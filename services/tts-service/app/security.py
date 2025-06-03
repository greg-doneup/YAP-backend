"""
TTS Service Security Middleware
Provides comprehensive security features for the text-to-speech service
"""

import time
import re
import logging
import json
import hashlib
import html
from typing import Dict, Any, Optional, Set, List, Tuple
from collections import defaultdict, deque
from datetime import datetime, timedelta
from enum import Enum
from dataclasses import dataclass, asdict
import grpc
from grpc import StatusCode
import threading

# Configure logging
logger = logging.getLogger("tts_security")
logger.setLevel(logging.INFO)

class TTSSecurityEventType(Enum):
    """Security event types for TTS service"""
    TTS_SYNTHESIS_REQUEST = "tts_synthesis_request"
    VOICE_CLONING_ATTEMPT = "voice_cloning_attempt"
    RATE_LIMIT_EXCEEDED = "rate_limit_exceeded"
    UNAUTHORIZED_ACCESS = "unauthorized_access"
    SUSPICIOUS_ACTIVITY = "suspicious_activity"
    DATA_VALIDATION_FAILED = "data_validation_failed"
    CONTENT_FILTERING = "content_filtering"
    MALICIOUS_CONTENT = "malicious_content"
    TEXT_ABUSE = "text_abuse"
    LARGE_PAYLOAD = "large_payload"
    LANGUAGE_MANIPULATION = "language_manipulation"
    AUDIO_MANIPULATION = "audio_manipulation"
    DEEPFAKE_ATTEMPT = "deepfake_attempt"

class RiskLevel(Enum):
    """Risk levels for security events"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

@dataclass
class TTSSecurityContext:
    """Security context for tracking TTS requests"""
    client_ip: str
    user_agent: str
    timestamp: datetime
    method: str
    risk_score: int
    event_type: TTSSecurityEventType
    metadata: Dict[str, Any]

class TTSSecurityStore:
    """Thread-safe in-memory storage for TTS security tracking"""
    
    def __init__(self):
        self._lock = threading.RLock()
        self.rate_limits: Dict[str, Dict[str, Any]] = {}
        self.security_events: deque = deque(maxlen=1000)
        self.blocked_ips: Set[str] = set()
        self.suspicious_ips: Set[str] = set()
        self.text_hashes: Set[str] = set()  # Track repeated text
        self.voice_usage: defaultdict = defaultdict(int)  # Track voice usage patterns
        self.audio_metadata: Dict[str, Any] = {}  # Track audio generation metadata
        
    def track_request(self, key: str, window_seconds: int, max_requests: int) -> Dict[str, Any]:
        """Thread-safe rate limiting tracking"""
        with self._lock:
            now = time.time()
            
            if key not in self.rate_limits:
                self.rate_limits[key] = {"count": 1, "reset_time": now + window_seconds}
                return {"allowed": True, "remaining": max_requests - 1}
                
            limit_data = self.rate_limits[key]
            if now > limit_data["reset_time"]:
                self.rate_limits[key] = {"count": 1, "reset_time": now + window_seconds}
                return {"allowed": True, "remaining": max_requests - 1}
                
            limit_data["count"] += 1
            allowed = limit_data["count"] <= max_requests
            remaining = max(0, max_requests - limit_data["count"])
            
            return {"allowed": allowed, "remaining": remaining}
            
    def log_security_event(self, context: TTSSecurityContext):
        """Thread-safe security event logging"""
        with self._lock:
            self.security_events.append(context)
            
            # Auto-block IPs with critical risk activities
            if context.risk_score >= 9:
                recent_critical = [
                    e for e in self.security_events 
                    if e.client_ip == context.client_ip and 
                    (datetime.now() - e.timestamp).seconds < 300 and
                    e.risk_score >= 8
                ]
                
                if len(recent_critical) >= 2:
                    self.blocked_ips.add(context.client_ip)
                    logger.critical(f"Auto-blocked IP {context.client_ip} due to critical TTS security violations")
                    
    def is_blocked(self, ip: str) -> bool:
        """Check if IP is blocked"""
        with self._lock:
            return ip in self.blocked_ips
            
    def track_voice_usage(self, voice_id: str, client_ip: str):
        """Track voice usage patterns for deepfake detection"""
        with self._lock:
            key = f"{client_ip}:{voice_id}"
            self.voice_usage[key] += 1
            
    def get_metrics(self) -> Dict[str, Any]:
        """Get comprehensive security metrics"""
        with self._lock:
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
                "voice_usage_patterns": dict(self.voice_usage),
                "unique_voices_used": len(set(voice.split(':')[1] for voice in self.voice_usage.keys())),
                "timestamp": now.isoformat()
            }
            
    def _group_events_by_type(self, events: List[TTSSecurityContext]) -> Dict[str, int]:
        """Group events by type"""
        counts = defaultdict(int)
        for event in events:
            counts[event.event_type.value] += 1
        return dict(counts)

class TTSSecurityMiddleware:
    """Main security middleware for TTS service"""
    
    def __init__(self):
        self.store = TTSSecurityStore()
        self.content_filters = self._init_content_filters()
        self.security_patterns = self._init_security_patterns()
        self.trusted_voices = self._init_trusted_voices()
        
    def _init_content_filters(self) -> Dict[str, Any]:
        """Initialize content filtering rules for TTS"""
        return {
            "max_text_length": 5000,     # Maximum text length for TTS
            "min_text_length": 1,        # Minimum text length
            "max_words": 1000,           # Maximum number of words
            "max_sentences": 100,        # Maximum number of sentences
            "suspicious_patterns": [
                r'(.)\1{15,}',           # Repeated characters (15+ times)
                r'\b\w{40,}\b',          # Very long words (40+ chars)
                r'[^\w\s\.,!?;:\'"-]{3,}',  # Multiple special characters
                r'(.{10,})\1{3,}',       # Repeated phrases
            ],
            "blocked_content_types": [
                "hate_speech",
                "violence",
                "explicit_content",
                "phishing",
                "spam"
            ]
        }
        
    def _init_security_patterns(self) -> Dict[str, re.Pattern]:
        """Initialize security detection patterns"""
        return {
            "script_injection": re.compile(r'<script|javascript:|on\w+\s*=', re.IGNORECASE),
            "command_injection": re.compile(r'[;&|`$]|\\x[0-9a-f]{2}', re.IGNORECASE),
            "phone_numbers": re.compile(r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b'),
            "ssn_pattern": re.compile(r'\b\d{3}-\d{2}-\d{4}\b'),
            "credit_card": re.compile(r'\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b'),
            "deepfake_keywords": re.compile(r'\b(clone|mimic|impersonate|fake|synthesize|generate voice)\b', re.IGNORECASE)
        }
        
    def _init_trusted_voices(self) -> Set[str]:
        """Initialize list of trusted/safe voice IDs"""
        return {
            # Common safe voices for major TTS providers
            "en-US-JennyNeural", "en-US-AriaNeural", "en-US-DavisNeural",
            "en-GB-SoniaNeural", "es-ES-AlvaroNeural", "fr-FR-DeniseNeural",
            "de-DE-KatjaNeural", "it-IT-ElsaNeural", "pt-BR-FranciscaNeural",
            "ja-JP-NanamiNeural", "ko-KR-SunHiNeural", "zh-CN-XiaoxiaoNeural"
        }
        
    def extract_client_info(self, context) -> Tuple[str, str]:
        """Extract client IP and user agent from gRPC context"""
        try:
            peer = context.peer()
            client_ip = peer.split(':')[0].replace('ipv4:', '').replace('ipv6:', '') if peer else "unknown"
            
            # Extract user agent from metadata if available
            metadata = dict(context.invocation_metadata())
            user_agent = metadata.get('user-agent', metadata.get('grpc-user-agent', 'unknown'))
            
            return client_ip, user_agent
        except Exception:
            return "unknown", "unknown"
            
    def sanitize_text(self, text: str) -> str:
        """Sanitize TTS input text"""
        if not isinstance(text, str):
            return str(text)
            
        # HTML escape
        text = html.escape(text)
        
        # Remove null bytes and control characters
        text = re.sub(r'[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]', '', text)
        
        # Remove potentially harmful Unicode characters
        text = re.sub(r'[\u200B-\u200F\u2028-\u202F\u205F-\u206F\uFEFF]', '', text)
        
        # Normalize whitespace
        text = re.sub(r'\s+', ' ', text).strip()
        
        # Limit excessive punctuation
        text = re.sub(r'([.!?]){4,}', r'\1\1\1', text)
        
        return text
        
    def detect_malicious_tts_content(self, text: str, voice_id: str = None) -> Dict[str, Any]:
        """Detect malicious content in TTS request"""
        threats = []
        risk_score = 0
        
        # Check for script injection and commands
        for threat_type, pattern in self.security_patterns.items():
            if pattern.search(text):
                threats.append(threat_type)
                if threat_type in ["script_injection", "command_injection"]:
                    risk_score += 5
                elif threat_type == "deepfake_keywords":
                    risk_score += 8
                else:
                    risk_score += 2
                    
        # Check content length limits
        if len(text) > self.content_filters["max_text_length"]:
            threats.append("oversized_content")
            risk_score += 3
            
        word_count = len(text.split())
        if word_count > self.content_filters["max_words"]:
            threats.append("too_many_words")
            risk_score += 2
            
        sentence_count = len(re.split(r'[.!?]+', text))
        if sentence_count > self.content_filters["max_sentences"]:
            threats.append("too_many_sentences")
            risk_score += 2
            
        # Check for suspicious patterns
        for pattern in self.content_filters["suspicious_patterns"]:
            if re.search(pattern, text):
                threats.append("suspicious_pattern")
                risk_score += 1
                
        # Check voice legitimacy
        if voice_id and voice_id not in self.trusted_voices:
            threats.append("untrusted_voice")
            risk_score += 3
            
        # Check for potential PII
        pii_patterns = ["phone_numbers", "ssn_pattern", "credit_card"]
        for pattern_name in pii_patterns:
            if pattern_name in self.security_patterns and self.security_patterns[pattern_name].search(text):
                threats.append(f"pii_{pattern_name}")
                risk_score += 4
                
        return {
            "threats": threats,
            "risk_score": min(risk_score, 10),
            "safe": len(threats) == 0
        }
        
    def create_security_context(self, client_ip: str, user_agent: str, 
                              event_type: TTSSecurityEventType, risk_score: int, 
                              metadata: Dict[str, Any] = None) -> TTSSecurityContext:
        """Create security context for TTS operations"""
        return TTSSecurityContext(
            client_ip=client_ip,
            user_agent=user_agent,
            timestamp=datetime.now(),
            method="TTS_SYNTHESIS",
            risk_score=risk_score,
            event_type=event_type,
            metadata=metadata or {}
        )
        
    def rate_limit_check(self, client_ip: str, max_requests: int = 20, 
                        window_seconds: int = 60) -> Tuple[bool, str]:
        """Check rate limiting for TTS requests"""
        # Check if IP is blocked
        if self.store.is_blocked(client_ip):
            return False, "IP blocked due to security violations"
            
        # Check rate limit
        key = f"tts_rate_limit:{client_ip}"
        result = self.store.track_request(key, window_seconds, max_requests)
        
        if not result["allowed"]:
            return False, f"Rate limit exceeded: {max_requests} requests per {window_seconds} seconds"
            
        return True, ""
        
    def validate_tts_request(self, text: str, voice_id: str = None, 
                           language: str = None) -> Dict[str, Any]:
        """Validate TTS synthesis request"""
        errors = []
        risk_score = 0
        
        # Validate text
        if not text or not isinstance(text, str):
            errors.append("Text is required and must be a string")
            risk_score += 3
        elif len(text.strip()) == 0:
            errors.append("Text cannot be empty")
            risk_score += 2
        elif len(text) > self.content_filters["max_text_length"]:
            errors.append(f"Text too long (max {self.content_filters['max_text_length']} characters)")
            risk_score += 4
            
        # Validate voice ID
        if voice_id and not isinstance(voice_id, str):
            errors.append("Voice ID must be a string")
            risk_score += 1
        elif voice_id and voice_id not in self.trusted_voices:
            errors.append("Untrusted voice ID")
            risk_score += 2
            
        # Validate language
        if language and not isinstance(language, str):
            errors.append("Language must be a string")
            risk_score += 1
        elif language and not re.match(r'^[a-z]{2}(-[A-Z]{2})?$', language):
            errors.append("Invalid language format")
            risk_score += 2
            
        # Check for malicious content
        if text:
            malicious_check = self.detect_malicious_tts_content(text, voice_id)
            if not malicious_check["safe"]:
                errors.extend([f"Threat detected: {threat}" for threat in malicious_check["threats"]])
                risk_score += malicious_check["risk_score"]
                
        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "risk_score": risk_score,
            "sanitized_text": self.sanitize_text(text) if text else ""
        }
        
    def get_security_metrics(self) -> Dict[str, Any]:
        """Get comprehensive TTS security metrics"""
        metrics = self.store.get_metrics()
        metrics.update({
            "service": "tts-service",
            "security_level": "high",
            "content_filtering": True,
            "rate_limiting": True,
            "voice_verification": True,
            "deepfake_protection": True,
            "pii_detection": True
        })
        return metrics

# TTS gRPC Security Interceptor
class TTSSecurityInterceptor(grpc.ServerInterceptor):
    """gRPC interceptor for TTS security"""
    
    def __init__(self, security_middleware: TTSSecurityMiddleware):
        self.security = security_middleware
        
    def intercept_service(self, continuation, handler_call_details):
        """Intercept gRPC service calls for security"""
        def wrapper(request, context):
            # Extract client information
            client_ip, user_agent = self.security.extract_client_info(context)
            
            # Rate limiting
            allowed, reason = self.security.rate_limit_check(client_ip)
            if not allowed:
                context.set_code(StatusCode.RESOURCE_EXHAUSTED)
                context.set_details(reason)
                
                # Log rate limit violation
                security_context = self.security.create_security_context(
                    client_ip, user_agent, TTSSecurityEventType.RATE_LIMIT_EXCEEDED, 6,
                    {"reason": reason}
                )
                self.security.store.log_security_event(security_context)
                return None
                
            # Continue with the original handler
            try:
                return continuation(request, context)
            except Exception as e:
                # Log security incident
                security_context = self.security.create_security_context(
                    client_ip, user_agent, TTSSecurityEventType.SUSPICIOUS_ACTIVITY, 7,
                    {"error": str(e), "method": handler_call_details.method}
                )
                self.security.store.log_security_event(security_context)
                raise
                
        return wrapper

# Global TTS security middleware instance
tts_security = TTSSecurityMiddleware()
