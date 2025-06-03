"""
Comprehensive Security Middleware for Pronunciation Scorer Service

This module provides enterprise-grade security features for the pronunciation scoring service,
including rate limiting, input validation, content filtering, and audio validation.
"""

import os
import re
import time
import hashlib
import threading
import logging
from typing import Dict, Any, Optional, List, Set
from datetime import datetime, timedelta
from collections import defaultdict, deque
from dataclasses import dataclass, field
import grpc
from grpc_interceptor import ServerInterceptor
import json

# Enhanced logging configuration
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Security audit logger
security_logger = logging.getLogger('pronunciation_security')
security_handler = logging.FileHandler('pronunciation_security.log')
security_handler.setFormatter(logging.Formatter('%(asctime)s - SECURITY - %(message)s'))
security_logger.addHandler(security_handler)
security_logger.setLevel(logging.INFO)

@dataclass
class PronunciationSecurityConfig:
    """Security configuration for pronunciation scorer service"""
    # Rate limiting
    RATE_LIMIT_REQUESTS: int = 25  # requests per window (lower due to CPU intensive scoring)
    RATE_LIMIT_WINDOW: int = 60    # seconds
    BURST_LIMIT: int = 8           # burst allowance
    
    # Content validation
    MAX_AUDIO_SIZE_MB: int = 50    # maximum audio file size (smaller for scoring)
    MAX_TEXT_LENGTH: int = 1000    # maximum text length
    MIN_TEXT_LENGTH: int = 1       # minimum text length
    MAX_WORD_COUNT: int = 200      # maximum word count for scoring
    
    # Audio validation
    ALLOWED_AUDIO_FORMATS: Set[str] = field(default_factory=lambda: {
        'wav', 'mp3', 'flac', 'm4a', 'ogg'
    })
    MAX_AUDIO_DURATION_SECONDS: int = 300  # 5 minutes max for scoring
    MIN_AUDIO_DURATION_SECONDS: float = 0.5  # 500ms min
    
    # Pronunciation-specific limits
    MAX_PHONEMES_PER_REQUEST: int = 500
    MAX_SCORING_ITERATIONS: int = 10
    
    # Language validation
    SUPPORTED_LANGUAGES: Set[str] = field(default_factory=lambda: {
        'en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'zh', 'ja', 'ko',
        'ar', 'hi', 'th', 'vi', 'tr', 'pl', 'nl', 'sv', 'da', 'no'
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
    
    # Pronunciation-specific suspicious patterns
    SUSPICIOUS_PATTERNS: List[str] = field(default_factory=lambda: [
        r'(.)\1{30,}',  # excessive repetition
        r'[^\w\s\.\,\!\?]{10,}',  # excessive special characters
        r'\b(test|hack|exploit|inject)\b',  # suspicious keywords
        r'[0-9]{100,}',  # excessive numbers
    ])
    
    # Audio manipulation detection
    MANIPULATION_KEYWORDS: Set[str] = field(default_factory=lambda: {
        'voice clone', 'deepfake', 'synthetic', 'artificial voice',
        'generated speech', 'voice synthesis', 'speech synthesis',
        'manipulated audio', 'fake voice'
    })

@dataclass
class SecurityEvent:
    """Security event data structure"""
    timestamp: datetime
    event_type: str
    client_ip: str
    user_agent: str
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

class PronunciationSecurityStore:
    """Thread-safe security data store for pronunciation scorer service"""
    
    def __init__(self):
        self.config = PronunciationSecurityConfig()
        self.lock = threading.RLock()
        
        # Rate limiting data
        self.rate_limits: Dict[str, RateLimitEntry] = defaultdict(RateLimitEntry)
        
        # Security events
        self.security_events: List[SecurityEvent] = []
        self.blocked_ips: Set[str] = set()
        
        # Scoring-specific tracking
        self.scoring_sessions: Dict[str, Dict[str, Any]] = {}
        self.suspicious_scores: List[Dict[str, Any]] = []
        
        # Metrics
        self.metrics = {
            'total_requests': 0,
            'blocked_requests': 0,
            'malicious_content_detected': 0,
            'rate_limit_violations': 0,
            'validation_failures': 0,
            'suspicious_audio_detected': 0,
            'suspicious_scores_detected': 0,
        }
        
        # Cache for expensive operations
        self.validation_cache: Dict[str, bool] = {}
        self.cache_timestamps: Dict[str, datetime] = {}
        
        logger.info("PronunciationSecurityStore initialized")

    def is_rate_limited(self, client_ip: str) -> bool:
        """Check if client is rate limited"""
        with self.lock:
            now = datetime.now()
            entry = self.rate_limits[client_ip]
            
            # Check if client is blocked
            if entry.blocked_until and now < entry.blocked_until:
                return True
            
            # Clean old requests
            cutoff = now - timedelta(seconds=self.config.RATE_LIMIT_WINDOW)
            while entry.requests and entry.requests[0] < cutoff:
                entry.requests.popleft()
            
            # Check rate limit
            if len(entry.requests) >= self.config.RATE_LIMIT_REQUESTS:
                # Block for escalating duration
                block_duration = min(600, 120 * (entry.blocked_requests + 1))  # Max 10 minutes
                entry.blocked_until = now + timedelta(seconds=block_duration)
                entry.blocked_requests += 1
                
                self.log_security_event(
                    event_type="RATE_LIMIT_EXCEEDED",
                    client_ip=client_ip,
                    details={
                        'requests_in_window': len(entry.requests),
                        'limit': self.config.RATE_LIMIT_REQUESTS,
                        'blocked_duration': block_duration
                    },
                    risk_level="MEDIUM"
                )
                return True
            
            # Add current request
            entry.requests.append(now)
            entry.total_requests += 1
            return False

    def validate_pronunciation_text(self, text: str, expected_phonemes: Optional[List[str]] = None) -> tuple[bool, List[str]]:
        """Validate text content for pronunciation scoring"""
        issues = []
        
        # Basic validation
        if not text or len(text.strip()) < self.config.MIN_TEXT_LENGTH:
            issues.append("Text too short for pronunciation scoring")
        
        if len(text) > self.config.MAX_TEXT_LENGTH:
            issues.append(f"Text too long (max {self.config.MAX_TEXT_LENGTH} chars)")
        
        word_count = len(text.split())
        if word_count > self.config.MAX_WORD_COUNT:
            issues.append(f"Too many words for scoring (max {self.config.MAX_WORD_COUNT})")
        
        # Check for malicious patterns
        for pattern in self.config.MALICIOUS_PATTERNS:
            if re.search(pattern, text, re.IGNORECASE):
                issues.append(f"Malicious pattern detected: {pattern}")
        
        # Check for suspicious patterns
        for pattern in self.config.SUSPICIOUS_PATTERNS:
            if re.search(pattern, text, re.IGNORECASE):
                issues.append(f"Suspicious pattern detected: {pattern}")
        
        # Check for manipulation keywords
        text_lower = text.lower()
        for keyword in self.config.MANIPULATION_KEYWORDS:
            if keyword in text_lower:
                issues.append(f"Audio manipulation keyword detected: {keyword}")
        
        # Validate phonemes if provided
        if expected_phonemes:
            if len(expected_phonemes) > self.config.MAX_PHONEMES_PER_REQUEST:
                issues.append(f"Too many phonemes (max {self.config.MAX_PHONEMES_PER_REQUEST})")
        
        return len(issues) == 0, issues

    def validate_audio_for_scoring(self, audio_data: bytes, audio_format: str) -> tuple[bool, List[str]]:
        """Validate audio data for pronunciation scoring"""
        issues = []
        
        # Check audio format
        if audio_format.lower() not in self.config.ALLOWED_AUDIO_FORMATS:
            issues.append(f"Unsupported audio format for scoring: {audio_format}")
        
        # Check audio size
        size_mb = len(audio_data) / (1024 * 1024)
        if size_mb > self.config.MAX_AUDIO_SIZE_MB:
            issues.append(f"Audio too large for scoring: {size_mb:.2f}MB (max {self.config.MAX_AUDIO_SIZE_MB}MB)")
        
        # Check minimum size
        if len(audio_data) < 1000:  # Less than 1KB
            issues.append("Audio file too small or corrupted")
        
        # Basic audio header validation
        if not self._validate_audio_header(audio_data, audio_format):
            issues.append("Invalid audio file format or corrupted header")
        
        # Check for audio manipulation signatures
        if self._detect_audio_manipulation(audio_data):
            issues.append("Potential audio manipulation detected")
        
        return len(issues) == 0, issues

    def _validate_audio_header(self, audio_data: bytes, audio_format: str) -> bool:
        """Basic audio header validation"""
        if len(audio_data) < 12:
            return False
        
        # Check common audio file signatures
        signatures = {
            'wav': [b'RIFF', b'WAVE'],
            'mp3': [b'ID3', b'\xff\xfb', b'\xff\xf3', b'\xff\xf2'],
            'flac': [b'fLaC'],
            'ogg': [b'OggS'],
            'm4a': [b'ftypM4A'],
        }
        
        format_sigs = signatures.get(audio_format.lower(), [])
        for sig in format_sigs:
            if audio_data.startswith(sig) or sig in audio_data[:20]:
                return True
        
        return False

    def _detect_audio_manipulation(self, audio_data: bytes) -> bool:
        """Basic audio manipulation detection"""
        # Check for unusual patterns in audio data
        if len(audio_data) < 1000:
            return False
        
        # Check for excessive repetition (possible synthetic audio)
        chunk_size = 100
        chunks = [audio_data[i:i+chunk_size] for i in range(0, min(1000, len(audio_data)), chunk_size)]
        
        # Count identical chunks
        unique_chunks = set(chunks)
        if len(unique_chunks) < len(chunks) * 0.3:  # Less than 30% unique chunks
            return True
        
        return False

    def validate_language_code(self, language_code: str) -> tuple[bool, str]:
        """Validate language code for pronunciation scoring"""
        if not language_code:
            return False, "Language code is required for pronunciation scoring"
        
        # Normalize language code
        lang_code = language_code.lower().strip()
        
        # Support both ISO 639-1 (en) and locale codes (en-US)
        base_lang = lang_code.split('-')[0]
        
        if base_lang not in self.config.SUPPORTED_LANGUAGES:
            return False, f"Unsupported language for pronunciation scoring: {language_code}"
        
        return True, ""

    def validate_scoring_parameters(self, request) -> tuple[bool, List[str]]:
        """Validate pronunciation scoring parameters"""
        issues = []
        
        # Check scoring thresholds
        if hasattr(request, 'threshold') and request.threshold:
            if request.threshold < 0 or request.threshold > 1:
                issues.append("Score threshold must be between 0 and 1")
        
        # Check scoring algorithm parameters
        if hasattr(request, 'scoring_algorithm'):
            allowed_algorithms = {'gop', 'azure', 'wav2vec2', 'whisper'}
            if request.scoring_algorithm not in allowed_algorithms:
                issues.append(f"Unsupported scoring algorithm: {request.scoring_algorithm}")
        
        # Check iteration limits
        if hasattr(request, 'max_iterations'):
            if request.max_iterations > self.config.MAX_SCORING_ITERATIONS:
                issues.append(f"Too many scoring iterations (max {self.config.MAX_SCORING_ITERATIONS})")
        
        return len(issues) == 0, issues

    def track_scoring_session(self, session_id: str, client_ip: str, details: Dict[str, Any]):
        """Track pronunciation scoring session"""
        with self.lock:
            self.scoring_sessions[session_id] = {
                'client_ip': client_ip,
                'start_time': datetime.now(),
                'details': details,
                'request_count': 1
            }

    def detect_suspicious_scoring(self, scores: List[float], client_ip: str) -> bool:
        """Detect suspicious scoring patterns"""
        if not scores:
            return False
        
        # Check for impossible scores
        if any(score < 0 or score > 1 for score in scores):
            self.log_security_event(
                event_type="SUSPICIOUS_SCORES",
                client_ip=client_ip,
                details={'scores': scores, 'issue': 'impossible_scores'},
                risk_level="HIGH"
            )
            return True
        
        # Check for perfect scores (potential manipulation)
        perfect_scores = [s for s in scores if s >= 0.99]
        if len(perfect_scores) > len(scores) * 0.8:  # More than 80% perfect
            self.log_security_event(
                event_type="SUSPICIOUS_SCORES",
                client_ip=client_ip,
                details={'scores': scores, 'issue': 'too_many_perfect_scores'},
                risk_level="MEDIUM"
            )
            return True
        
        return False

    def log_security_event(self, event_type: str, client_ip: str, 
                          details: Dict[str, Any], risk_level: str = "LOW",
                          user_agent: str = "", action_taken: str = ""):
        """Log security event"""
        with self.lock:
            event = SecurityEvent(
                timestamp=datetime.now(),
                event_type=event_type,
                client_ip=client_ip,
                user_agent=user_agent,
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
            elif event_type == "SUSPICIOUS_AUDIO":
                self.metrics['suspicious_audio_detected'] += 1
            elif event_type == "SUSPICIOUS_SCORES":
                self.metrics['suspicious_scores_detected'] += 1
            
            # Log to file
            security_logger.info(
                f"EVENT: {event_type} | IP: {client_ip} | RISK: {risk_level} | "
                f"DETAILS: {json.dumps(details)} | ACTION: {action_taken}"
            )

    def get_security_metrics(self) -> Dict[str, Any]:
        """Get security metrics"""
        with self.lock:
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
                'active_rate_limits': len([
                    e for e in self.rate_limits.values() 
                    if e.blocked_until and now < e.blocked_until
                ]),
                'total_security_events': len(self.security_events),
                'active_scoring_sessions': len(self.scoring_sessions),
                'uptime_seconds': time.time() - getattr(self, 'start_time', time.time())
            }

class PronunciationSecurityMiddleware:
    """Main security middleware class for pronunciation scorer service"""
    
    def __init__(self):
        self.store = PronunciationSecurityStore()
        self.store.start_time = time.time()
        logger.info("PronunciationSecurityMiddleware initialized")

    def validate_request(self, request, context) -> tuple[bool, str]:
        """Comprehensive request validation"""
        try:
            # Extract client info
            client_ip = self._extract_client_ip(context)
            user_agent = self._extract_user_agent(context)
            
            # Increment total requests
            with self.store.lock:
                self.store.metrics['total_requests'] += 1
            
            # Check rate limiting
            if self.store.is_rate_limited(client_ip):
                with self.store.lock:
                    self.store.metrics['blocked_requests'] += 1
                return False, "Rate limit exceeded"
            
            # Validate text content
            if hasattr(request, 'text'):
                expected_phonemes = getattr(request, 'expected_phonemes', None)
                is_valid, issues = self.store.validate_pronunciation_text(request.text, expected_phonemes)
                if not is_valid:
                    self.store.log_security_event(
                        event_type="VALIDATION_FAILURE",
                        client_ip=client_ip,
                        user_agent=user_agent,
                        details={'validation_issues': issues, 'content_type': 'text'},
                        risk_level="MEDIUM"
                    )
                    return False, f"Text validation failed: {', '.join(issues)}"
            
            # Validate audio data
            if hasattr(request, 'audio_data'):
                audio_format = getattr(request, 'audio_format', 'wav')
                is_valid, issues = self.store.validate_audio_for_scoring(request.audio_data, audio_format)
                if not is_valid:
                    self.store.log_security_event(
                        event_type="VALIDATION_FAILURE",
                        client_ip=client_ip,
                        user_agent=user_agent,
                        details={'validation_issues': issues, 'content_type': 'audio'},
                        risk_level="MEDIUM"
                    )
                    return False, f"Audio validation failed: {', '.join(issues)}"
            
            # Validate language code
            if hasattr(request, 'language_code'):
                is_valid, error = self.store.validate_language_code(request.language_code)
                if not is_valid:
                    self.store.log_security_event(
                        event_type="VALIDATION_FAILURE",
                        client_ip=client_ip,
                        user_agent=user_agent,
                        details={'error': error, 'language_code': request.language_code},
                        risk_level="LOW"
                    )
                    return False, error
            
            # Validate scoring parameters
            is_valid, issues = self.store.validate_scoring_parameters(request)
            if not is_valid:
                self.store.log_security_event(
                    event_type="VALIDATION_FAILURE",
                    client_ip=client_ip,
                    user_agent=user_agent,
                    details={'validation_issues': issues, 'content_type': 'scoring_parameters'},
                    risk_level="MEDIUM"
                )
                return False, f"Scoring parameter validation failed: {', '.join(issues)}"
            
            # Log successful validation
            self.store.log_security_event(
                event_type="REQUEST_VALIDATED",
                client_ip=client_ip,
                user_agent=user_agent,
                details={'method': context._rpc_event.method},
                risk_level="LOW"
            )
            
            return True, ""
            
        except Exception as e:
            logger.error(f"Security validation error: {e}")
            return False, "Security validation failed"

    def _extract_client_ip(self, context) -> str:
        """Extract client IP from gRPC context"""
        try:
            peer = context.peer()
            if peer:
                # Extract IP from peer string like "ipv4:127.0.0.1:12345"
                if ':' in peer:
                    return peer.split(':')[1]
            return "unknown"
        except:
            return "unknown"

    def _extract_user_agent(self, context) -> str:
        """Extract user agent from gRPC metadata"""
        try:
            metadata = dict(context.invocation_metadata())
            return metadata.get('user-agent', 'unknown')
        except:
            return "unknown"

class PronunciationSecurityInterceptor(ServerInterceptor):
    """gRPC interceptor for pronunciation scorer service security"""
    
    def __init__(self):
        self.middleware = PronunciationSecurityMiddleware()
        logger.info("PronunciationSecurityInterceptor initialized")

    def intercept(self, method, request, context, method_name):
        """Intercept and validate gRPC requests"""
        try:
            # Validate request
            is_valid, error_message = self.middleware.validate_request(request, context)
            
            if not is_valid:
                logger.warning(f"Security validation failed: {error_message}")
                context.abort(grpc.StatusCode.PERMISSION_DENIED, error_message)
                return
            
            # Continue with request
            return method(request, context)
            
        except Exception as e:
            logger.error(f"Security interceptor error: {e}")
            context.abort(grpc.StatusCode.INTERNAL, "Security processing failed")

def get_pronunciation_security_metrics() -> Dict[str, Any]:
    """Get security metrics (for external monitoring)"""
    if hasattr(get_pronunciation_security_metrics, '_instance'):
        return get_pronunciation_security_metrics._instance.store.get_security_metrics()
    return {}

# Store the middleware instance for metrics access
def create_pronunciation_security_interceptor():
    """Create and store security interceptor instance"""
    interceptor = PronunciationSecurityInterceptor()
    get_pronunciation_security_metrics._instance = interceptor.middleware
    return interceptor
