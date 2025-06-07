import os
import time
import json
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict
from enum import Enum

class RateLimitType(Enum):
    RECOVERY_ATTEMPT = "recovery_attempt"
    LOGIN_ATTEMPT = "login_attempt"
    WALLET_CREATION = "wallet_creation"
    TRANSACTION = "transaction"

@dataclass
class RateLimitEntry:
    """Rate limit tracking entry."""
    user_id: str
    limit_type: RateLimitType
    attempts: int
    first_attempt: datetime
    last_attempt: datetime
    lockout_until: Optional[datetime] = None
    progressive_delay: int = 0
    blocked_attempts: int = 0

class EnhancedRateLimiter:
    """
    Enhanced rate limiting system with progressive delays and security monitoring.
    
    Features:
    - Progressive rate limiting (exponential backoff)
    - Different limits for different operations
    - IP-based and user-based tracking
    - Security event logging
    - Automatic cleanup of expired entries
    """
    
    def __init__(self, storage_backend='memory'):
        """
        Initialize rate limiter.
        
        Args:
            storage_backend: 'memory' or 'redis' for distributed systems
        """
        self.storage_backend = storage_backend
        self.memory_store: Dict[str, RateLimitEntry] = {}
        
        # Rate limit configurations
        self.limits = {
            RateLimitType.RECOVERY_ATTEMPT: {
                'max_attempts': 5,
                'window_minutes': 60,
                'lockout_minutes': 60,
                'progressive_base': 2  # 2^attempt_number minutes delay
            },
            RateLimitType.LOGIN_ATTEMPT: {
                'max_attempts': 10,
                'window_minutes': 15,
                'lockout_minutes': 30,
                'progressive_base': 1.5
            },
            RateLimitType.WALLET_CREATION: {
                'max_attempts': 3,
                'window_minutes': 60,
                'lockout_minutes': 120,
                'progressive_base': 5
            },
            RateLimitType.TRANSACTION: {
                'max_attempts': 50,
                'window_minutes': 5,
                'lockout_minutes': 10,
                'progressive_base': 1.2
            }
        }
    
    def _get_key(self, user_id: str, limit_type: RateLimitType, ip_address: str = None) -> str:
        """Generate storage key for rate limit entry."""
        if ip_address:
            return f"rate_limit:{limit_type.value}:{user_id}:{ip_address}"
        return f"rate_limit:{limit_type.value}:{user_id}"
    
    def _cleanup_expired_entries(self):
        """Remove expired rate limit entries."""
        current_time = datetime.utcnow()
        expired_keys = []
        
        for key, entry in self.memory_store.items():
            # Remove entries older than 24 hours
            if current_time - entry.last_attempt > timedelta(hours=24):
                expired_keys.append(key)
            
            # Remove entries where lockout has expired
            if entry.lockout_until and current_time > entry.lockout_until:
                entry.lockout_until = None
                entry.progressive_delay = 0
        
        for key in expired_keys:
            del self.memory_store[key]
    
    def check_rate_limit(
        self, 
        user_id: str, 
        limit_type: RateLimitType, 
        ip_address: str = None
    ) -> Dict[str, Any]:
        """
        Check if request should be rate limited.
        
        Args:
            user_id: User identifier
            limit_type: Type of operation being rate limited
            ip_address: Optional IP address for additional tracking
            
        Returns:
            Dict with rate limit status and metadata
        """
        self._cleanup_expired_entries()
        
        key = self._get_key(user_id, limit_type, ip_address)
        current_time = datetime.utcnow()
        config = self.limits[limit_type]
        
        # Get existing entry
        entry = self.memory_store.get(key)
        
        if not entry:
            # First attempt
            return {
                'allowed': True,
                'remaining_attempts': config['max_attempts'] - 1,
                'reset_time': None,
                'retry_after': 0
            }
        
        # Check if currently locked out
        if entry.lockout_until and current_time < entry.lockout_until:
            return {
                'allowed': False,
                'remaining_attempts': 0,
                'reset_time': entry.lockout_until.isoformat(),
                'retry_after': int((entry.lockout_until - current_time).total_seconds()),
                'reason': 'lockout_active'
            }
        
        # Check if within rate limit window
        window_start = current_time - timedelta(minutes=config['window_minutes'])
        
        if entry.first_attempt > window_start:
            # Still within current window
            if entry.attempts >= config['max_attempts']:
                # Calculate progressive lockout
                lockout_minutes = config['lockout_minutes'] * (config['progressive_base'] ** entry.progressive_delay)
                lockout_until = current_time + timedelta(minutes=lockout_minutes)
                
                entry.lockout_until = lockout_until
                entry.progressive_delay += 1
                entry.blocked_attempts += 1
                
                return {
                    'allowed': False,
                    'remaining_attempts': 0,
                    'reset_time': lockout_until.isoformat(),
                    'retry_after': int(lockout_minutes * 60),
                    'reason': 'rate_limit_exceeded',
                    'progressive_delay': entry.progressive_delay
                }
            else:
                # Within limits
                return {
                    'allowed': True,
                    'remaining_attempts': config['max_attempts'] - entry.attempts - 1,
                    'reset_time': None,
                    'retry_after': 0
                }
        else:
            # Window has reset
            return {
                'allowed': True,
                'remaining_attempts': config['max_attempts'] - 1,
                'reset_time': None,
                'retry_after': 0
            }
    
    def record_attempt(
        self, 
        user_id: str, 
        limit_type: RateLimitType, 
        success: bool = False,
        ip_address: str = None,
        metadata: Dict[str, Any] = None
    ) -> None:
        """
        Record an attempt for rate limiting.
        
        Args:
            user_id: User identifier
            limit_type: Type of operation
            success: Whether the attempt was successful
            ip_address: Optional IP address
            metadata: Additional metadata for logging
        """
        key = self._get_key(user_id, limit_type, ip_address)
        current_time = datetime.utcnow()
        config = self.limits[limit_type]
        
        entry = self.memory_store.get(key)
        
        if not entry:
            # Create new entry
            entry = RateLimitEntry(
                user_id=user_id,
                limit_type=limit_type,
                attempts=1,
                first_attempt=current_time,
                last_attempt=current_time
            )
        else:
            # Check if we need to reset the window
            window_start = current_time - timedelta(minutes=config['window_minutes'])
            
            if entry.first_attempt <= window_start:
                # Reset window
                entry.attempts = 1
                entry.first_attempt = current_time
                entry.progressive_delay = max(0, entry.progressive_delay - 1)  # Reduce penalty over time
            else:
                # Increment attempts
                entry.attempts += 1
            
            entry.last_attempt = current_time
        
        # If successful, reduce progressive delay
        if success and entry.progressive_delay > 0:
            entry.progressive_delay = max(0, entry.progressive_delay - 1)
        
        self.memory_store[key] = entry
        
        # Log security event
        self._log_security_event(user_id, limit_type, success, ip_address, metadata, entry)
    
    def _log_security_event(
        self, 
        user_id: str, 
        limit_type: RateLimitType, 
        success: bool, 
        ip_address: str, 
        metadata: Dict[str, Any], 
        entry: RateLimitEntry
    ) -> None:
        """Log security events for monitoring."""
        event = {
            'timestamp': datetime.utcnow().isoformat(),
            'user_id': user_id,
            'event_type': limit_type.value,
            'success': success,
            'ip_address': ip_address,
            'attempts_in_window': entry.attempts,
            'progressive_delay': entry.progressive_delay,
            'blocked_attempts': entry.blocked_attempts,
            'metadata': metadata or {}
        }
        
        # In production, send to proper logging system
        # For now, log to file
        self._write_security_log(event)
    
    def _write_security_log(self, event: Dict[str, Any]) -> None:
        """Write security event to log file."""
        log_file = os.environ.get('SECURITY_LOG_FILE', '/tmp/wallet_security.log')
        
        try:
            with open(log_file, 'a') as f:
                f.write(json.dumps(event) + '\n')
        except Exception as e:
            print(f"Failed to write security log: {e}")
    
    def get_user_status(self, user_id: str) -> Dict[str, Any]:
        """
        Get current rate limit status for a user across all operation types.
        
        Args:
            user_id: User identifier
            
        Returns:
            Dict with status for each operation type
        """
        status = {}
        
        for limit_type in RateLimitType:
            key = self._get_key(user_id, limit_type)
            entry = self.memory_store.get(key)
            
            if entry:
                status[limit_type.value] = {
                    'attempts': entry.attempts,
                    'last_attempt': entry.last_attempt.isoformat(),
                    'lockout_until': entry.lockout_until.isoformat() if entry.lockout_until else None,
                    'progressive_delay': entry.progressive_delay,
                    'blocked_attempts': entry.blocked_attempts
                }
            else:
                status[limit_type.value] = {
                    'attempts': 0,
                    'last_attempt': None,
                    'lockout_until': None,
                    'progressive_delay': 0,
                    'blocked_attempts': 0
                }
        
        return status
    
    def reset_user_limits(self, user_id: str, limit_type: RateLimitType = None) -> bool:
        """
        Reset rate limits for a user (admin function).
        
        Args:
            user_id: User identifier
            limit_type: Optional specific limit type to reset
            
        Returns:
            True if reset successful
        """
        try:
            if limit_type:
                # Reset specific limit type
                key = self._get_key(user_id, limit_type)
                if key in self.memory_store:
                    del self.memory_store[key]
            else:
                # Reset all limits for user
                keys_to_remove = [key for key in self.memory_store.keys() if user_id in key]
                for key in keys_to_remove:
                    del self.memory_store[key]
            
            # Log admin action
            self._log_security_event(
                user_id, 
                limit_type or RateLimitType.RECOVERY_ATTEMPT, 
                True, 
                None, 
                {'action': 'admin_reset', 'reset_type': limit_type.value if limit_type else 'all'}, 
                RateLimitEntry(user_id, limit_type or RateLimitType.RECOVERY_ATTEMPT, 0, datetime.utcnow(), datetime.utcnow())
            )
            
            return True
        except Exception as e:
            print(f"Error resetting user limits: {e}")
            return False
    
    def get_security_metrics(self, hours: int = 24) -> Dict[str, Any]:
        """
        Get security metrics for monitoring.
        
        Args:
            hours: Number of hours to look back
            
        Returns:
            Dict with security metrics
        """
        cutoff_time = datetime.utcnow() - timedelta(hours=hours)
        
        total_attempts = 0
        blocked_attempts = 0
        unique_users = set()
        
        for entry in self.memory_store.values():
            if entry.last_attempt > cutoff_time:
                total_attempts += entry.attempts
                blocked_attempts += entry.blocked_attempts
                unique_users.add(entry.user_id)
        
        return {
            'time_window_hours': hours,
            'total_attempts': total_attempts,
            'blocked_attempts': blocked_attempts,
            'unique_users': len(unique_users),
            'block_rate': blocked_attempts / max(total_attempts, 1),
            'active_entries': len(self.memory_store)
        }


# Global rate limiter instance
rate_limiter = EnhancedRateLimiter()


def rate_limit_decorator(limit_type: RateLimitType, get_user_id_func=None, get_ip_func=None):
    """
    Decorator for rate limiting Flask routes.
    
    Args:
        limit_type: Type of rate limit to apply
        get_user_id_func: Function to extract user ID from request
        get_ip_func: Function to extract IP address from request
    """
    def decorator(func):
        def wrapper(*args, **kwargs):
            from flask import request, jsonify
            
            # Extract user ID and IP
            user_id = get_user_id_func(request) if get_user_id_func else request.json.get('user_id')
            ip_address = get_ip_func(request) if get_ip_func else request.remote_addr
            
            if not user_id:
                return jsonify({'error': 'User ID required for rate limiting'}), 400
            
            # Check rate limit
            limit_check = rate_limiter.check_rate_limit(user_id, limit_type, ip_address)
            
            if not limit_check['allowed']:
                rate_limiter.record_attempt(user_id, limit_type, False, ip_address)
                return jsonify({
                    'error': 'Rate limit exceeded',
                    'retry_after': limit_check['retry_after'],
                    'reset_time': limit_check['reset_time'],
                    'reason': limit_check.get('reason', 'rate_limited')
                }), 429
            
            # Execute the function
            try:
                result = func(*args, **kwargs)
                
                # Record successful attempt
                rate_limiter.record_attempt(user_id, limit_type, True, ip_address)
                
                return result
            except Exception as e:
                # Record failed attempt
                rate_limiter.record_attempt(user_id, limit_type, False, ip_address, {'error': str(e)})
                raise
        
        return wrapper
    return decorator
