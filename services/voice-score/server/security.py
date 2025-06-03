"""
Comprehensive Security Middleware for Voice Score Service

This module provides enterprise-grade security features for the voice scoring service,
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
security_logger = logging.getLogger('voice_score_security')
security_handler = logging.FileHandler('voice_score_security.log')
security_handler.setFormatter(logging.Formatter('%(asctime)s - SECURITY - %(message)s'))
security_logger.addHandler(security_handler)
security_logger.setLevel(logging.INFO)

@dataclass
class VoiceScoreSecurityConfig:
    """Security configuration for voice score service"""
    # Rate limiting
    RATE_LIMIT_REQUESTS: int = 20  # requests per window (conservative for voice scoring)
    RATE_LIMIT_WINDOW: int = 60    # seconds
    BURST_LIMIT: int = 5           # burst allowance
    
    # Content validation
    MAX_AUDIO_SIZE_MB: int = 25    # maximum audio file size
    MAX_PHRASE_LENGTH: int = 500   # maximum expected phrase length
    MIN_PHRASE_LENGTH: int = 1     # minimum phrase length
    MAX_WORD_COUNT: int = 100      # maximum word count
    
    # Audio validation
    ALLOWED_AUDIO_FORMATS: Set[str] = field(default_factory=lambda: {
        'wav', 'mp3', 'flac', 'm4a', 'ogg'
    })
    MAX_AUDIO_DURATION_SECONDS: int = 60   # 1 minute max for voice scoring
    MIN_AUDIO_DURATION_SECONDS: float = 0.3  # 300ms min
    
    # Score validation
    MIN_SIMILARITY_SCORE: float = 0.0
    MAX_SIMILARITY_SCORE: float = 1.0
    SUSPICIOUS_SCORE_THRESHOLD: float = 0.98  # Scores above this are suspicious
    
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
    
    # Voice manipulation detection
    MANIPULATION_KEYWORDS: Set[str] = field(default_factory=lambda: {
        'voice clone', 'deepfake', 'synthetic voice', 'artificial voice',
        'generated speech', 'voice synthesis', 'speech synthesis',
        'manipulated audio', 'fake voice', 'voice changer'
    })
    
    # Suspicious phrase patterns
    SUSPICIOUS_PHRASES: List[str] = field(default_factory=lambda: [
        r'(.)\1{10,}',  # repeated characters
        r'\b(\w+)\s+\1\s+\1\b',  # triple repeated words
        r'[A-Z]{20,}',  # excessive caps
        r'[0-9]{20,}',  # excessive numbers
    ])

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

class VoiceScoreSecurityStore:
    """Thread-safe security data store for voice score service"""
    
    def __init__(self):
        self.config = VoiceScoreSecurityConfig()
        self.lock = threading.RLock()
        
        # Rate limiting data
        self.rate_limits: Dict[str, RateLimitEntry] = defaultdict(RateLimitEntry)
        
        # Security events
        self.security_events: List[SecurityEvent] = []
        self.blocked_ips: Set[str] = set()
        
        # Voice scoring specific tracking
        self.evaluation_sessions: Dict[str, Dict[str, Any]] = {}
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
            'perfect_scores_detected': 0,
        }
        
        # Cache for expensive operations
        self.validation_cache: Dict[str, bool] = {}
        self.cache_timestamps: Dict[str, datetime] = {}
        
        logger.info("VoiceScoreSecurityStore initialized")

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
                block_duration = min(900, 180 * (entry.blocked_requests + 1))  # Max 15 minutes
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

    def validate_expected_phrase(self, phrase: str) -> tuple[bool, List[str]]:
        """Validate expected phrase for voice scoring"""
        issues = []
        
        # Basic validation
        if not phrase or len(phrase.strip()) < self.config.MIN_PHRASE_LENGTH:
            issues.append("Expected phrase too short")
        
        if len(phrase) > self.config.MAX_PHRASE_LENGTH:
            issues.append(f"Expected phrase too long (max {self.config.MAX_PHRASE_LENGTH} chars)")
        
        word_count = len(phrase.split())
        if word_count > self.config.MAX_WORD_COUNT:
            issues.append(f"Too many words in phrase (max {self.config.MAX_WORD_COUNT})")
        
        # Check for malicious patterns
        for pattern in self.config.MALICIOUS_PATTERNS:
            if re.search(pattern, phrase, re.IGNORECASE):
                issues.append(f"Malicious pattern detected: {pattern}")
        
        # Check for suspicious phrase patterns
        for pattern in self.config.SUSPICIOUS_PHRASES:
            if re.search(pattern, phrase, re.IGNORECASE):
                issues.append(f"Suspicious phrase pattern detected: {pattern}")
        
        # Check for manipulation keywords
        phrase_lower = phrase.lower()
        for keyword in self.config.MANIPULATION_KEYWORDS:
            if keyword in phrase_lower:
                issues.append(f"Voice manipulation keyword detected: {keyword}")
        
        return len(issues) == 0, issues

    def validate_audio_for_voice_scoring(self, audio_data: bytes) -> tuple[bool, List[str]]:
        """Validate audio data for voice scoring"""
        issues = []
        
        # Check audio size
        size_mb = len(audio_data) / (1024 * 1024)
        if size_mb > self.config.MAX_AUDIO_SIZE_MB:
            issues.append(f"Audio too large: {size_mb:.2f}MB (max {self.config.MAX_AUDIO_SIZE_MB}MB)")
        
        # Check minimum size
        if len(audio_data) < 500:  # Less than 500 bytes
            issues.append("Audio file too small or corrupted")
        
        # Basic audio validation
        if not self._validate_basic_audio(audio_data):
            issues.append("Invalid audio file or corrupted data")
        
        # Check for potential voice manipulation
        if self._detect_voice_manipulation(audio_data):
            issues.append("Potential voice manipulation detected")
        
        return len(issues) == 0, issues

    def _validate_basic_audio(self, audio_data: bytes) -> bool:
        """Basic audio file validation"""
        if len(audio_data) < 12:
            return False
        
        # Check for common audio signatures
        audio_signatures = [
            b'RIFF',  # WAV
            b'ID3',   # MP3 with ID3
            b'\xff\xfb',  # MP3
            b'\xff\xf3',  # MP3
            b'fLaC',  # FLAC
            b'OggS',  # OGG
            b'ftyp',  # M4A/MP4
        ]
        
        for sig in audio_signatures:
            if audio_data.startswith(sig) or sig in audio_data[:20]:
                return True
        
        return False

    def _detect_voice_manipulation(self, audio_data: bytes) -> bool:
        """Basic voice manipulation detection"""
        if len(audio_data) < 1000:
            return False
        
        # Check for unusual patterns that might indicate synthetic audio
        # Simple pattern analysis
        chunk_size = 50
        chunks = [audio_data[i:i+chunk_size] for i in range(0, min(500, len(audio_data)), chunk_size)]
        
        # Count identical chunks (synthetic audio often has repetitive patterns)
        unique_chunks = set(chunks)
        if len(unique_chunks) < len(chunks) * 0.4:  # Less than 40% unique
            return True
        
        # Check for excessive silence or uniformity
        if self._has_excessive_uniformity(audio_data):
            return True
        
        return False

    def _has_excessive_uniformity(self, audio_data: bytes) -> bool:
        """Check for excessive uniformity in audio data"""
        if len(audio_data) < 100:
            return False
        
        # Sample bytes and check for too much uniformity
        sample_size = min(100, len(audio_data))
        sample = audio_data[:sample_size]
        
        # Count unique byte values
        unique_bytes = set(sample)
        
        # If less than 10% unique byte values, might be suspicious
        return len(unique_bytes) < sample_size * 0.1

    def validate_similarity_score(self, score: float, client_ip: str) -> tuple[bool, str]:
        """Validate similarity score for anomalies"""
        # Check score range
        if score < self.config.MIN_SIMILARITY_SCORE or score > self.config.MAX_SIMILARITY_SCORE:
            self.log_security_event(
                event_type="INVALID_SCORE",
                client_ip=client_ip,
                details={'score': score, 'valid_range': [self.config.MIN_SIMILARITY_SCORE, self.config.MAX_SIMILARITY_SCORE]},
                risk_level="HIGH"
            )
            return False, f"Invalid similarity score: {score}"
        
        # Check for suspiciously high scores
        if score >= self.config.SUSPICIOUS_SCORE_THRESHOLD:
            self.log_security_event(
                event_type="SUSPICIOUS_SCORE",
                client_ip=client_ip,
                details={'score': score, 'threshold': self.config.SUSPICIOUS_SCORE_THRESHOLD},
                risk_level="MEDIUM"
            )
            self.metrics['suspicious_scores_detected'] += 1
        
        # Check for perfect scores
        if score >= 0.999:
            self.log_security_event(
                event_type="PERFECT_SCORE",
                client_ip=client_ip,
                details={'score': score},
                risk_level="LOW"
            )
            self.metrics['perfect_scores_detected'] += 1
        
        return True, ""

    def track_evaluation_session(self, session_id: str, client_ip: str, details: Dict[str, Any]):
        """Track voice evaluation session"""
        with self.lock:
            self.evaluation_sessions[session_id] = {
                'client_ip': client_ip,
                'start_time': datetime.now(),
                'details': details,
                'evaluation_count': 1
            }

    def detect_scoring_abuse(self, client_ip: str, scores: List[float]) -> bool:
        """Detect potential scoring abuse patterns"""
        if not scores:
            return False
        
        # Check for consistently high scores (potential gaming)
        high_scores = [s for s in scores if s >= 0.9]
        if len(high_scores) > len(scores) * 0.8:  # More than 80% high scores
            self.log_security_event(
                event_type="SCORING_ABUSE",
                client_ip=client_ip,
                details={
                    'scores': scores,
                    'high_score_percentage': len(high_scores) / len(scores),
                    'issue': 'consistently_high_scores'
                },
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
            
            # Log to file
            security_logger.info(
                f"EVENT: {event_type} | IP: {client_ip} | RISK: {risk_level} | "
                f"DETAILS: {json.dumps(details, default=str)} | ACTION: {action_taken}"
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
                'active_evaluation_sessions': len(self.evaluation_sessions),
                'uptime_seconds': time.time() - getattr(self, 'start_time', time.time())
            }

class VoiceScoreSecurityMiddleware:
    """Main security middleware class for voice score service"""
    
    def __init__(self):
        self.store = VoiceScoreSecurityStore()
        self.store.start_time = time.time()
        logger.info("VoiceScoreSecurityMiddleware initialized")

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
            
            # Validate expected phrase
            if hasattr(request, 'expected_phrase'):
                is_valid, issues = self.store.validate_expected_phrase(request.expected_phrase)
                if not is_valid:
                    self.store.log_security_event(
                        event_type="VALIDATION_FAILURE",
                        client_ip=client_ip,
                        user_agent=user_agent,
                        details={'validation_issues': issues, 'content_type': 'expected_phrase'},
                        risk_level="MEDIUM"
                    )
                    return False, f"Expected phrase validation failed: {', '.join(issues)}"
            
            # Validate audio data
            if hasattr(request, 'audio'):
                is_valid, issues = self.store.validate_audio_for_voice_scoring(request.audio)
                if not is_valid:
                    self.store.log_security_event(
                        event_type="VALIDATION_FAILURE",
                        client_ip=client_ip,
                        user_agent=user_agent,
                        details={'validation_issues': issues, 'content_type': 'audio'},
                        risk_level="MEDIUM"
                    )
                    return False, f"Audio validation failed: {', '.join(issues)}"
            
            # Log successful validation
            self.store.log_security_event(
                event_type="REQUEST_VALIDATED",
                client_ip=client_ip,
                user_agent=user_agent,
                details={'method': 'Evaluate'},
                risk_level="LOW"
            )
            
            return True, ""
            
        except Exception as e:
            logger.error(f"Security validation error: {e}")
            return False, "Security validation failed"

    def validate_response(self, response, client_ip: str) -> tuple[bool, str]:
        """Validate response for anomalies"""
        try:
            # Validate similarity score
            if hasattr(response, 'score'):
                is_valid, error = self.store.validate_similarity_score(response.score, client_ip)
                if not is_valid:
                    return False, error
            
            return True, ""
            
        except Exception as e:
            logger.error(f"Response validation error: {e}")
            return False, "Response validation failed"

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

class VoiceScoreSecurityInterceptor(ServerInterceptor):
    """gRPC interceptor for voice score service security"""
    
    def __init__(self):
        self.middleware = VoiceScoreSecurityMiddleware()
        logger.info("VoiceScoreSecurityInterceptor initialized")

    def intercept(self, method, request, context, method_name):
        """Intercept and validate gRPC requests"""
        try:
            # Validate request
            is_valid, error_message = self.middleware.validate_request(request, context)
            
            if not is_valid:
                logger.warning(f"Security validation failed: {error_message}")
                context.abort(grpc.StatusCode.PERMISSION_DENIED, error_message)
                return
            
            # Continue with request and get response
            response = method(request, context)
            
            # Validate response
            client_ip = self.middleware._extract_client_ip(context)
            is_valid, error_message = self.middleware.validate_response(response, client_ip)
            
            if not is_valid:
                logger.warning(f"Response validation failed: {error_message}")
                # Don't abort here, just log - response already generated
                self.middleware.store.log_security_event(
                    event_type="RESPONSE_VALIDATION_FAILURE",
                    client_ip=client_ip,
                    details={'error': error_message},
                    risk_level="MEDIUM"
                )
            
            return response
            
        except Exception as e:
            logger.error(f"Security interceptor error: {e}")
            context.abort(grpc.StatusCode.INTERNAL, "Security processing failed")

def get_voice_score_security_metrics() -> Dict[str, Any]:
    """Get security metrics (for external monitoring)"""
    if hasattr(get_voice_score_security_metrics, '_instance'):
        return get_voice_score_security_metrics._instance.store.get_security_metrics()
    return {}

# Store the middleware instance for metrics access
def create_voice_score_security_interceptor():
    """Create and store security interceptor instance"""
    interceptor = VoiceScoreSecurityInterceptor()
    get_voice_score_security_metrics._instance = interceptor.middleware
    return interceptor
