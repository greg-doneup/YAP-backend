"""
Grammar Service Security Middleware
Provides comprehensive security features for the grammar evaluation service
"""

import asyncio
import time
import re
import logging
import json
from typing import Dict, Any, Optional, Set, List
from collections import defaultdict, deque
from datetime import datetime, timedelta
from enum import Enum
from dataclasses import dataclass, asdict
from fastapi import Request, Response, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
import hashlib
import html

# Configure logging
logger = logging.getLogger("grammar_security")
logger.setLevel(logging.INFO)

class GrammarSecurityEventType(Enum):
    """Security event types for grammar service"""
    GRAMMAR_EVALUATION = "grammar_evaluation"
    RATE_LIMIT_EXCEEDED = "rate_limit_exceeded"
    UNAUTHORIZED_ACCESS = "unauthorized_access" 
    SUSPICIOUS_ACTIVITY = "suspicious_activity"
    DATA_VALIDATION_FAILED = "data_validation_failed"
    XSS_ATTEMPT = "xss_attempt"
    CONTENT_FILTERING = "content_filtering"
    MALICIOUS_CONTENT = "malicious_content"
    TEXT_ABUSE = "text_abuse"
    LARGE_PAYLOAD = "large_payload"
    LANGUAGE_MANIPULATION = "language_manipulation"

class RiskLevel(Enum):
    """Risk levels for security events"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

@dataclass
class SecurityContext:
    """Security context for tracking requests"""
    ip: str
    user_agent: str
    timestamp: datetime
    endpoint: str
    method: str
    risk_score: int
    event_type: GrammarSecurityEventType
    metadata: Dict[str, Any]

class InMemorySecurityStore:
    """In-memory storage for security tracking"""
    
    def __init__(self):
        self.rate_limits: Dict[str, Dict[str, Any]] = {}
        self.security_events: deque = deque(maxlen=1000)  # Keep last 1000 events
        self.blocked_ips: Set[str] = set()
        self.suspicious_ips: Set[str] = set()
        self.content_hashes: Set[str] = set()  # Track repeated content
        self.user_requests: defaultdict = defaultdict(list)  # Track user request patterns
        
    def track_request(self, key: str, window_seconds: int, max_requests: int) -> Dict[str, Any]:
        """Track rate limiting"""
        now = time.time()
        
        if key not in self.rate_limits:
            self.rate_limits[key] = {"count": 1, "reset_time": now + window_seconds}
            return {"allowed": True, "remaining": max_requests - 1}
            
        limit_data = self.rate_limits[key]
        if now > limit_data["reset_time"]:
            # Reset window
            self.rate_limits[key] = {"count": 1, "reset_time": now + window_seconds}
            return {"allowed": True, "remaining": max_requests - 1}
            
        limit_data["count"] += 1
        allowed = limit_data["count"] <= max_requests
        remaining = max(0, max_requests - limit_data["count"])
        
        return {"allowed": allowed, "remaining": remaining}
        
    def log_security_event(self, context: SecurityContext):
        """Log security event"""
        self.security_events.append(context)
        
        # Auto-block IPs with high-risk activities
        if context.risk_score >= 8:
            recent_events = [
                e for e in self.security_events 
                if e.ip == context.ip and 
                (datetime.now() - e.timestamp).seconds < 300  # Last 5 minutes
                and e.risk_score >= 7
            ]
            
            if len(recent_events) >= 3:
                self.blocked_ips.add(context.ip)
                logger.warning(f"Auto-blocked IP {context.ip} due to suspicious activity")
                
    def is_blocked(self, ip: str) -> bool:
        """Check if IP is blocked"""
        return ip in self.blocked_ips
        
    def get_metrics(self) -> Dict[str, Any]:
        """Get security metrics"""
        now = datetime.now()
        last_24h = [
            e for e in self.security_events 
            if (now - e.timestamp).total_seconds() < 86400
        ]
        
        return {
            "total_events": len(self.security_events),
            "events_last_24h": len(last_24h),
            "blocked_ips": list(self.blocked_ips),
            "suspicious_ips": list(self.suspicious_ips),
            "high_risk_events": len([e for e in last_24h if e.risk_score >= 8]),
            "event_types": self._group_events_by_type(last_24h),
            "timestamp": now.isoformat()
        }
        
    def _group_events_by_type(self, events: List[SecurityContext]) -> Dict[str, int]:
        """Group events by type"""
        counts = defaultdict(int)
        for event in events:
            counts[event.event_type.value] += 1
        return dict(counts)

class GrammarSecurityMiddleware:
    """Main security middleware for grammar service"""
    
    def __init__(self):
        self.store = InMemorySecurityStore()
        self.security_patterns = self._init_security_patterns()
        self.content_filters = self._init_content_filters()
        
    def _init_security_patterns(self) -> Dict[str, re.Pattern]:
        """Initialize security detection patterns"""
        return {
            "xss": re.compile(r'<script|javascript:|on\w+\s*=', re.IGNORECASE),
            "sql_injection": re.compile(r'\b(union|select|insert|delete|update|drop|create|alter|exec|execute)\b|(-{2})|(\|\|)', re.IGNORECASE),
            "path_traversal": re.compile(r'\.\.(\/|\\)'),
            "command_injection": re.compile(r'[;&|`$]', re.IGNORECASE)
        }
        
    def _init_content_filters(self) -> Dict[str, Any]:
        """Initialize content filtering rules"""
        return {
            "max_text_length": 10000,  # Maximum text length for grammar evaluation
            "min_text_length": 1,      # Minimum text length
            "max_words": 2000,         # Maximum number of words
            "suspicious_patterns": [
                r'(.)\1{20,}',         # Repeated characters (20+ times)
                r'\b\w{50,}\b',        # Very long words (50+ chars)
                r'[^\w\s\.,!?;:\'"-]{5,}',  # Multiple special characters
            ]
        }
        
    def get_client_ip(self, request: Request) -> str:
        """Extract client IP from request"""
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        real_ip = request.headers.get("x-real-ip")
        if real_ip:
            return real_ip
        return request.client.host if request.client else "unknown"
        
    def sanitize_text(self, text: str) -> str:
        """Sanitize input text"""
        if not isinstance(text, str):
            return str(text)
            
        # HTML escape
        text = html.escape(text)
        
        # Remove null bytes and control characters
        text = re.sub(r'[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]', '', text)
        
        # Normalize whitespace
        text = re.sub(r'\s+', ' ', text).strip()
        
        return text
        
    def detect_malicious_content(self, text: str) -> Dict[str, Any]:
        """Detect malicious content in text"""
        threats = []
        risk_score = 0
        
        for threat_type, pattern in self.security_patterns.items():
            if pattern.search(text):
                threats.append(threat_type)
                risk_score += 3
                
        # Check content filters
        if len(text) > self.content_filters["max_text_length"]:
            threats.append("oversized_content")
            risk_score += 2
            
        if len(text.split()) > self.content_filters["max_words"]:
            threats.append("too_many_words")
            risk_score += 2
            
        for pattern in self.content_filters["suspicious_patterns"]:
            if re.search(pattern, text):
                threats.append("suspicious_pattern")
                risk_score += 1
                
        return {
            "threats": threats,
            "risk_score": min(risk_score, 10),
            "safe": len(threats) == 0
        }
        
    def validate_language_code(self, lang: str) -> bool:
        """Validate language code"""
        # Common language codes for LanguageTool
        valid_langs = {
            'en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'zh', 'ja', 'ko',
            'en-US', 'en-GB', 'es-ES', 'fr-FR', 'de-DE', 'it-IT', 'pt-PT', 'pt-BR'
        }
        return lang in valid_langs
        
    def create_security_context(self, request: Request, event_type: GrammarSecurityEventType, 
                              risk_score: int, metadata: Dict[str, Any] = None) -> SecurityContext:
        """Create security context"""
        return SecurityContext(
            ip=self.get_client_ip(request),
            user_agent=request.headers.get("user-agent", ""),
            timestamp=datetime.now(),
            endpoint=str(request.url.path),
            method=request.method,
            risk_score=risk_score,
            event_type=event_type,
            metadata=metadata or {}
        )
        
    async def rate_limit_check(self, request: Request, 
                             max_requests: int = 30, window_seconds: int = 60) -> bool:
        """Check rate limiting"""
        ip = self.get_client_ip(request)
        
        # Check if IP is blocked
        if self.store.is_blocked(ip):
            context = self.create_security_context(
                request, GrammarSecurityEventType.RATE_LIMIT_EXCEEDED, 10,
                {"reason": "ip_blocked", "ip": ip}
            )
            self.store.log_security_event(context)
            return False
            
        # Check rate limit
        key = f"rate_limit:{ip}"
        result = self.store.track_request(key, window_seconds, max_requests)
        
        if not result["allowed"]:
            context = self.create_security_context(
                request, GrammarSecurityEventType.RATE_LIMIT_EXCEEDED, 6,
                {"requests": max_requests, "window": window_seconds}
            )
            self.store.log_security_event(context)
            return False
            
        return True
        
    async def validate_grammar_request(self, request: Request, body: Dict[str, Any]) -> Dict[str, Any]:
        """Validate grammar evaluation request"""
        errors = []
        risk_score = 0
        
        # Check required fields
        if "text" not in body:
            errors.append("Missing required field: text")
            risk_score += 2
            
        if "lang" not in body:
            errors.append("Missing required field: lang")
            risk_score += 1
            
        if errors:
            return {"valid": False, "errors": errors, "risk_score": risk_score}
            
        text = body.get("text", "")
        lang = body.get("lang", "")
        
        # Validate text
        if not isinstance(text, str):
            errors.append("Text must be a string")
            risk_score += 2
        elif len(text.strip()) == 0:
            errors.append("Text cannot be empty")
            risk_score += 1
        elif len(text) > self.content_filters["max_text_length"]:
            errors.append(f"Text too long (max {self.content_filters['max_text_length']} characters)")
            risk_score += 3
            
        # Validate language
        if not isinstance(lang, str):
            errors.append("Language must be a string")
            risk_score += 1
        elif not self.validate_language_code(lang):
            errors.append("Invalid language code")
            risk_score += 2
            
        # Check for malicious content
        if text:
            malicious_check = self.detect_malicious_content(text)
            if not malicious_check["safe"]:
                errors.extend([f"Threat detected: {threat}" for threat in malicious_check["threats"]])
                risk_score += malicious_check["risk_score"]
                
        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "risk_score": risk_score
        }
        
    async def get_security_metrics(self) -> Dict[str, Any]:
        """Get security metrics"""
        metrics = self.store.get_metrics()
        metrics.update({
            "service": "grammar-service",
            "security_level": "high",
            "content_filtering": True,
            "rate_limiting": True,
            "threat_detection": True
        })
        return metrics

class GrammarSecurityHTTPMiddleware(BaseHTTPMiddleware):
    """HTTP middleware for grammar service security"""
    
    def __init__(self, app, security_middleware: GrammarSecurityMiddleware):
        super().__init__(app)
        self.security = security_middleware
        
    async def dispatch(self, request: Request, call_next):
        """Process request through security middleware"""
        start_time = time.time()
        
        # Apply security headers
        def add_security_headers(response: Response):
            response.headers.update({
                "X-Content-Type-Options": "nosniff",
                "X-Frame-Options": "DENY", 
                "X-XSS-Protection": "1; mode=block",
                "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
                "Referrer-Policy": "strict-origin-when-cross-origin",
                "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'",
                "X-Service": "grammar-service",
                "X-Security-Level": "high"
            })
            return response
            
        # Rate limiting
        if not await self.security.rate_limit_check(request):
            response = JSONResponse(
                status_code=429,
                content={"error": "Rate limit exceeded", "retry_after": 60}
            )
            return add_security_headers(response)
            
        # Process request
        try:
            response = await call_next(request)
            
            # Log successful operation
            if request.url.path.startswith("/grammar/"):
                context = self.security.create_security_context(
                    request, GrammarSecurityEventType.GRAMMAR_EVALUATION, 1,
                    {
                        "status_code": response.status_code,
                        "response_time": time.time() - start_time,
                        "success": response.status_code < 400
                    }
                )
                self.security.store.log_security_event(context)
                
            return add_security_headers(response)
            
        except Exception as e:
            # Log error
            context = self.security.create_security_context(
                request, GrammarSecurityEventType.SUSPICIOUS_ACTIVITY, 7,
                {"error": str(e), "exception_type": type(e).__name__}
            )
            self.security.store.log_security_event(context)
            
            response = JSONResponse(
                status_code=500,
                content={"error": "Internal server error"}
            )
            return add_security_headers(response)

# Global security middleware instance
grammar_security = GrammarSecurityMiddleware()
