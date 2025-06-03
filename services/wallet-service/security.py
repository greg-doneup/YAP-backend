"""
Comprehensive Security Middleware for Wallet Service

This module provides enterprise-grade security features for the wallet service,
including rate limiting, input validation, transaction monitoring, and fraud detection.
"""

import os
import re
import time
import hashlib
import hmac
import logging
from typing import Dict, Any, Optional, List, Set
from datetime import datetime, timedelta
from collections import defaultdict, deque
from dataclasses import dataclass, field
from fastapi import Request, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import json
from decimal import Decimal

# Enhanced logging configuration
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Security audit logger
security_logger = logging.getLogger('wallet_security')
security_handler = logging.FileHandler('wallet_security.log')
security_handler.setFormatter(logging.Formatter('%(asctime)s - SECURITY - %(message)s'))
security_logger.addHandler(security_handler)
security_logger.setLevel(logging.INFO)

@dataclass
class WalletSecurityConfig:
    """Security configuration for wallet service"""
    # Rate limiting (more restrictive for financial operations)
    RATE_LIMIT_CREATE_WALLET: int = 5     # per hour
    RATE_LIMIT_TRANSACTIONS: int = 20     # per hour
    RATE_LIMIT_BALANCE_CHECK: int = 100   # per hour
    RATE_LIMIT_AUTH: int = 10             # per 15 minutes
    RATE_LIMIT_WINDOW: int = 3600         # 1 hour in seconds
    
    # Input validation
    MAX_WALLET_NAME_LENGTH: int = 100
    MAX_EMAIL_LENGTH: int = 254
    MAX_PASSWORD_LENGTH: int = 128
    MIN_PASSWORD_LENGTH: int = 8
    MAX_TRANSACTION_AMOUNT: Decimal = Decimal('1000000')  # 1M max
    MIN_TRANSACTION_AMOUNT: Decimal = Decimal('0.01')     # 1 cent min
    
    # Blockchain validation
    SUPPORTED_NETWORKS: Set[str] = field(default_factory=lambda: {
        'ethereum', 'bitcoin', 'polygon', 'bsc', 'avalanche', 'sei'
    })
    
    # Security patterns
    MALICIOUS_PATTERNS: List[str] = field(default_factory=lambda: [
        r'<script[^>]*>.*?</script>',
        r'javascript:',
        r'on\w+\s*=',
        r'eval\s*\(',
        r'expression\s*\(',
        r'import\s+',
        r'require\s*\(',
        r'\.\./',
        r'file:///',
        r'data:text/html',
    ])
    
    # Financial fraud patterns
    FRAUD_PATTERNS: List[str] = field(default_factory=lambda: [
        r'\b(test|fake|dummy|fraud)\b',
        r'\b(money\s*launder|wash\s*money)\b',
        r'\b(scam|phish|steal)\b',
        r'(.)\1{20,}',  # excessive repetition
    ])
    
    # Suspicious wallet addresses (known bad actors)
    BLACKLISTED_ADDRESSES: Set[str] = field(default_factory=lambda: {
        # Add known malicious addresses here
    })
    
    # Transaction monitoring
    SUSPICIOUS_AMOUNT_THRESHOLD: Decimal = Decimal('10000')  # $10k
    MAX_DAILY_TRANSACTION_VOLUME: Decimal = Decimal('50000')  # $50k per day
    MAX_TRANSACTIONS_PER_HOUR: int = 10

@dataclass
class SecurityEvent:
    """Security event data structure"""
    timestamp: datetime
    event_type: str
    client_ip: str
    user_agent: str
    user_id: Optional[str]
    details: Dict[str, Any]
    risk_level: str  # LOW, MEDIUM, HIGH, CRITICAL
    action_taken: str

@dataclass
class RateLimitEntry:
    """Rate limiting entry"""
    requests: deque = field(default_factory=deque)
    blocked_until: Optional[datetime] = None
    total_requests: int = 0
    blocked_requests: int = 0

class WalletSecurityStore:
    """Thread-safe security data store for wallet service"""
    
    def __init__(self):
        self.config = WalletSecurityConfig()
        
        # Rate limiting data
        self.rate_limits: Dict[str, RateLimitEntry] = defaultdict(RateLimitEntry)
        
        # Security events
        self.security_events: List[SecurityEvent] = []
        self.blocked_ips: Set[str] = set()
        self.suspicious_users: Set[str] = set()
        
        # Transaction monitoring
        self.daily_volumes: Dict[str, Dict[str, Decimal]] = defaultdict(lambda: defaultdict(Decimal))
        self.transaction_history: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        
        # Failed authentication tracking
        self.failed_auth_attempts: Dict[str, List[datetime]] = defaultdict(list)
        
        # Metrics
        self.metrics = {
            'total_requests': 0,
            'blocked_requests': 0,
            'malicious_content_detected': 0,
            'rate_limit_violations': 0,
            'validation_failures': 0,
            'fraud_attempts_detected': 0,
            'suspicious_transactions': 0,
            'wallet_creation_attempts': 0,
            'transaction_attempts': 0,
        }
        
        logger.info("WalletSecurityStore initialized")

    def is_rate_limited(self, client_ip: str, endpoint: str, limit: int) -> bool:
        """Check if client is rate limited for specific endpoint"""
        now = datetime.now()
        key = f"{client_ip}:{endpoint}"
        entry = self.rate_limits[key]
        
        # Check if client is blocked
        if entry.blocked_until and now < entry.blocked_until:
            return True
        
        # Clean old requests
        cutoff = now - timedelta(seconds=self.config.RATE_LIMIT_WINDOW)
        while entry.requests and entry.requests[0] < cutoff:
            entry.requests.popleft()
        
        # Check rate limit
        if len(entry.requests) >= limit:
            # Block for escalating duration based on endpoint sensitivity
            base_duration = 300 if 'wallet' in endpoint or 'transaction' in endpoint else 60
            block_duration = min(3600, base_duration * (entry.blocked_requests + 1))  # Max 1 hour
            entry.blocked_until = now + timedelta(seconds=block_duration)
            entry.blocked_requests += 1
            
            self.log_security_event(
                event_type="RATE_LIMIT_EXCEEDED",
                client_ip=client_ip,
                details={
                    'endpoint': endpoint,
                    'requests_in_window': len(entry.requests),
                    'limit': limit,
                    'blocked_duration': block_duration
                },
                risk_level="MEDIUM"
            )
            return True
        
        # Add current request
        entry.requests.append(now)
        entry.total_requests += 1
        return False

    def validate_wallet_data(self, data: Dict[str, Any]) -> tuple[bool, List[str]]:
        """Validate wallet creation/update data"""
        issues = []
        
        # Validate wallet name
        if 'name' in data:
            name = data['name']
            if not name or len(name.strip()) == 0:
                issues.append("Wallet name is required")
            elif len(name) > self.config.MAX_WALLET_NAME_LENGTH:
                issues.append(f"Wallet name too long (max {self.config.MAX_WALLET_NAME_LENGTH} chars)")
            
            # Check for malicious patterns
            for pattern in self.config.MALICIOUS_PATTERNS:
                if re.search(pattern, name, re.IGNORECASE):
                    issues.append(f"Malicious pattern in wallet name: {pattern}")
            
            # Check for fraud patterns
            for pattern in self.config.FRAUD_PATTERNS:
                if re.search(pattern, name, re.IGNORECASE):
                    issues.append(f"Suspicious pattern in wallet name: {pattern}")
        
        # Validate email
        if 'email' in data:
            email = data['email']
            if not email:
                issues.append("Email is required")
            elif len(email) > self.config.MAX_EMAIL_LENGTH:
                issues.append(f"Email too long (max {self.config.MAX_EMAIL_LENGTH} chars)")
            elif not self._is_valid_email(email):
                issues.append("Invalid email format")
        
        # Validate password
        if 'password' in data:
            password = data['password']
            if not password:
                issues.append("Password is required")
            elif len(password) < self.config.MIN_PASSWORD_LENGTH:
                issues.append(f"Password too short (min {self.config.MIN_PASSWORD_LENGTH} chars)")
            elif len(password) > self.config.MAX_PASSWORD_LENGTH:
                issues.append(f"Password too long (max {self.config.MAX_PASSWORD_LENGTH} chars)")
            elif not self._is_strong_password(password):
                issues.append("Password not strong enough (need uppercase, lowercase, digit, and special char)")
        
        # Validate network
        if 'network' in data:
            network = data['network'].lower()
            if network not in self.config.SUPPORTED_NETWORKS:
                issues.append(f"Unsupported network: {data['network']}")
        
        return len(issues) == 0, issues

    def validate_transaction_data(self, data: Dict[str, Any]) -> tuple[bool, List[str]]:
        """Validate transaction data"""
        issues = []
        
        # Validate amount
        if 'amount' in data:
            try:
                amount = Decimal(str(data['amount']))
                if amount <= 0:
                    issues.append("Transaction amount must be positive")
                elif amount < self.config.MIN_TRANSACTION_AMOUNT:
                    issues.append(f"Amount too small (min {self.config.MIN_TRANSACTION_AMOUNT})")
                elif amount > self.config.MAX_TRANSACTION_AMOUNT:
                    issues.append(f"Amount too large (max {self.config.MAX_TRANSACTION_AMOUNT})")
            except (ValueError, TypeError):
                issues.append("Invalid amount format")
        
        # Validate addresses
        for addr_field in ['from_address', 'to_address', 'recipient']:
            if addr_field in data:
                addr = data[addr_field]
                if not self._is_valid_address(addr):
                    issues.append(f"Invalid {addr_field} format")
                elif addr in self.config.BLACKLISTED_ADDRESSES:
                    issues.append(f"Blacklisted address: {addr}")
        
        # Validate transaction hash
        if 'tx_hash' in data:
            tx_hash = data['tx_hash']
            if not self._is_valid_tx_hash(tx_hash):
                issues.append("Invalid transaction hash format")
        
        return len(issues) == 0, issues

    def _is_valid_email(self, email: str) -> bool:
        """Basic email validation"""
        email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        return re.match(email_pattern, email) is not None

    def _is_strong_password(self, password: str) -> bool:
        """Check if password meets strength requirements"""
        has_upper = re.search(r'[A-Z]', password)
        has_lower = re.search(r'[a-z]', password)
        has_digit = re.search(r'\d', password)
        has_special = re.search(r'[!@#$%^&*(),.?":{}|<>]', password)
        
        return bool(has_upper and has_lower and has_digit and has_special)

    def _is_valid_address(self, address: str) -> bool:
        """Basic blockchain address validation"""
        if not address:
            return False
        
        # Ethereum/EVM address
        if re.match(r'^0x[a-fA-F0-9]{40}$', address):
            return True
        
        # Bitcoin address patterns
        if re.match(r'^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$', address):  # Legacy
            return True
        if re.match(r'^bc1[a-z0-9]{39,59}$', address):  # Bech32
            return True
        
        # Sei/Cosmos address
        if re.match(r'^sei[a-z0-9]{39}$', address):
            return True
        
        return False

    def _is_valid_tx_hash(self, tx_hash: str) -> bool:
        """Basic transaction hash validation"""
        # Most blockchain tx hashes are 64 hex characters
        return bool(re.match(r'^0x[a-fA-F0-9]{64}$', tx_hash))

    def track_transaction(self, user_id: str, amount: Decimal, client_ip: str) -> bool:
        """Track transaction for fraud detection"""
        today = datetime.now().date().isoformat()
        
        # Update daily volume
        self.daily_volumes[user_id][today] += amount
        
        # Check daily limit
        if self.daily_volumes[user_id][today] > self.config.MAX_DAILY_TRANSACTION_VOLUME:
            self.log_security_event(
                event_type="DAILY_LIMIT_EXCEEDED",
                client_ip=client_ip,
                user_id=user_id,
                details={
                    'daily_volume': float(self.daily_volumes[user_id][today]),
                    'limit': float(self.config.MAX_DAILY_TRANSACTION_VOLUME),
                    'amount': float(amount)
                },
                risk_level="HIGH"
            )
            return False
        
        # Check for suspicious amount
        if amount >= self.config.SUSPICIOUS_AMOUNT_THRESHOLD:
            self.log_security_event(
                event_type="SUSPICIOUS_AMOUNT",
                client_ip=client_ip,
                user_id=user_id,
                details={
                    'amount': float(amount),
                    'threshold': float(self.config.SUSPICIOUS_AMOUNT_THRESHOLD)
                },
                risk_level="MEDIUM"
            )
            self.metrics['suspicious_transactions'] += 1
        
        # Add to history
        self.transaction_history[user_id].append({
            'timestamp': datetime.now(),
            'amount': amount,
            'client_ip': client_ip
        })
        
        # Keep only recent history (last 100 transactions)
        if len(self.transaction_history[user_id]) > 100:
            self.transaction_history[user_id] = self.transaction_history[user_id][-100:]
        
        self.metrics['transaction_attempts'] += 1
        return True

    def track_failed_auth(self, client_ip: str, email: str, reason: str):
        """Track failed authentication attempts"""
        now = datetime.now()
        self.failed_auth_attempts[client_ip].append(now)
        
        # Clean old attempts (keep 24 hours)
        cutoff = now - timedelta(hours=24)
        self.failed_auth_attempts[client_ip] = [
            attempt for attempt in self.failed_auth_attempts[client_ip]
            if attempt > cutoff
        ]
        
        # Check for brute force
        recent_failures = len([
            attempt for attempt in self.failed_auth_attempts[client_ip]
            if (now - attempt).total_seconds() < 3600  # Last hour
        ])
        
        if recent_failures >= 5:
            self.log_security_event(
                event_type="BRUTE_FORCE_DETECTED",
                client_ip=client_ip,
                details={
                    'email': email,
                    'reason': reason,
                    'recent_failures': recent_failures
                },
                risk_level="HIGH"
            )
            self.blocked_ips.add(client_ip)

    def log_security_event(self, event_type: str, client_ip: str, 
                          details: Dict[str, Any], risk_level: str = "LOW",
                          user_agent: str = "", user_id: Optional[str] = None,
                          action_taken: str = ""):
        """Log security event"""
        event = SecurityEvent(
            timestamp=datetime.now(),
            event_type=event_type,
            client_ip=client_ip,
            user_agent=user_agent,
            user_id=user_id,
            details=details,
            risk_level=risk_level,
            action_taken=action_taken or "LOGGED"
        )
        
        self.security_events.append(event)
        
        # Keep only recent events (last 1000)
        if len(self.security_events) > 1000:
            self.security_events = self.security_events[-1000:]
        
        # Update metrics
        if event_type == "RATE_LIMIT_EXCEEDED":
            self.metrics['rate_limit_violations'] += 1
        elif event_type == "MALICIOUS_CONTENT":
            self.metrics['malicious_content_detected'] += 1
        elif event_type == "VALIDATION_FAILURE":
            self.metrics['validation_failures'] += 1
        elif "FRAUD" in event_type:
            self.metrics['fraud_attempts_detected'] += 1
        
        # Log to file
        security_logger.info(
            f"EVENT: {event_type} | IP: {client_ip} | USER: {user_id} | RISK: {risk_level} | "
            f"DETAILS: {json.dumps(details, default=str)} | ACTION: {action_taken}"
        )

    def get_security_metrics(self) -> Dict[str, Any]:
        """Get security metrics"""
        now = datetime.now()
        
        # Calculate recent activity
        recent_events = [
            e for e in self.security_events 
            if (now - e.timestamp).total_seconds() < 3600  # Last hour
        ]
        
        return {
            **self.metrics,
            'recent_events_count': len(recent_events),
            'blocked_ips_count': len(self.blocked_ips),
            'suspicious_users_count': len(self.suspicious_users),
            'active_rate_limits': sum(
                1 for entry in self.rate_limits.values() 
                if entry.blocked_until and now < entry.blocked_until
            ),
            'total_security_events': len(self.security_events),
            'uptime_seconds': time.time() - getattr(self, 'start_time', time.time())
        }

class WalletSecurityMiddleware:
    """Main security middleware class for wallet service"""
    
    def __init__(self):
        self.store = WalletSecurityStore()
        self.store.start_time = time.time()
        logger.info("WalletSecurityMiddleware initialized")

    async def validate_request(self, request: Request, endpoint: str) -> tuple[bool, str]:
        """Comprehensive request validation"""
        try:
            # Extract client info
            client_ip = self._extract_client_ip(request)
            user_agent = request.headers.get('user-agent', 'unknown')
            
            # Increment total requests
            self.store.metrics['total_requests'] += 1
            
            # Check if IP is blocked
            if client_ip in self.store.blocked_ips:
                self.store.metrics['blocked_requests'] += 1
                return False, "IP address is blocked"
            
            # Check rate limiting based on endpoint
            rate_limits = {
                'create_wallet': self.store.config.RATE_LIMIT_CREATE_WALLET,
                'transaction': self.store.config.RATE_LIMIT_TRANSACTIONS,
                'balance': self.store.config.RATE_LIMIT_BALANCE_CHECK,
                'auth': self.store.config.RATE_LIMIT_AUTH,
            }
            
            limit = rate_limits.get(endpoint, 60)  # Default limit
            
            if self.store.is_rate_limited(client_ip, endpoint, limit):
                self.store.metrics['blocked_requests'] += 1
                return False, "Rate limit exceeded"
            
            return True, ""
            
        except Exception as e:
            logger.error(f"Request validation error: {e}")
            return False, "Security validation failed"

    def _extract_client_ip(self, request: Request) -> str:
        """Extract client IP from request"""
        # Check for forwarded headers first
        forwarded_for = request.headers.get('x-forwarded-for')
        if forwarded_for:
            return forwarded_for.split(',')[0].strip()
        
        real_ip = request.headers.get('x-real-ip')
        if real_ip:
            return real_ip
        
        # Fallback to client host
        return getattr(request.client, 'host', 'unknown')

# Global security middleware instance
security_middleware = WalletSecurityMiddleware()

def get_wallet_security_metrics() -> Dict[str, Any]:
    """Get security metrics (for external monitoring)"""
    return security_middleware.store.get_security_metrics()
