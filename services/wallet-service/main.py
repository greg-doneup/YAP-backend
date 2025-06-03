from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, validator
from motor.motor_asyncio import AsyncIOMotorClient
import os
import hashlib
import base64
import time
import logging
import re
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from crypto_utils import CryptoUtils  # encryption utilities
from dotenv import load_dotenv

# Import security middleware
from security import security_middleware, get_wallet_security_metrics

# Load environment variables
load_dotenv('.env.development')

# Enhanced logging configuration
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('wallet_service.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Security audit logger
audit_logger = logging.getLogger('security_audit')
audit_handler = logging.FileHandler('security_audit.log')
audit_handler.setFormatter(logging.Formatter('%(asctime)s - AUDIT - %(message)s'))
audit_logger.addHandler(audit_handler)
audit_logger.setLevel(logging.INFO)

app = FastAPI(
    title="YAP Wallet Service",
    description="Enhanced two-layer security wallet service for YAP application",
    version="2.0.0"
)

# Add CORS middleware for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8100", "http://localhost:3000", "http://localhost:4200"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Enhanced Rate Limiting
class RateLimiter:
    def __init__(self):
        self.clients = defaultdict(list)
        self.failed_attempts = defaultdict(list)
    
    def is_rate_limited(self, client_ip: str, endpoint: str, max_requests: int = 60, window_minutes: int = 1) -> bool:
        """Check if client is rate limited for the endpoint"""
        now = time.time()
        window_start = now - (window_minutes * 60)
        
        # Clean old requests
        self.clients[f"{client_ip}:{endpoint}"] = [
            req_time for req_time in self.clients[f"{client_ip}:{endpoint}"] 
            if req_time > window_start
        ]
        
        # Check current count
        current_requests = len(self.clients[f"{client_ip}:{endpoint}"])
        if current_requests >= max_requests:
            return True
        
        # Add current request
        self.clients[f"{client_ip}:{endpoint}"].append(now)
        return False
    
    def log_failed_attempt(self, client_ip: str, email: str, reason: str):
        """Log failed authentication attempts for monitoring"""
        now = time.time()
        self.failed_attempts[client_ip].append({
            'timestamp': now,
            'email': email,
            'reason': reason
        })
        
        # Clean old attempts (keep 24 hours)
        day_ago = now - (24 * 60 * 60)
        self.failed_attempts[client_ip] = [
            attempt for attempt in self.failed_attempts[client_ip]
            if attempt['timestamp'] > day_ago
        ]
        
        # Log for security monitoring
        audit_logger.warning(f"Failed auth attempt - IP: {client_ip}, Email: {email}, Reason: {reason}")
    
    def get_failed_attempts_count(self, client_ip: str, hours: int = 1) -> int:
        """Get count of failed attempts from specific IP in last N hours"""
        cutoff = time.time() - (hours * 60 * 60)
        return len([
            attempt for attempt in self.failed_attempts[client_ip]
            if attempt['timestamp'] > cutoff
        ])

rate_limiter = RateLimiter()

# Security Validator
class SecurityValidator:
    @staticmethod
    def validate_passphrase_strength(passphrase: str) -> Dict[str, Any]:
        """Enhanced passphrase validation matching frontend CryptoService"""
        errors = []
        warnings = []
        score = 0
        
        # Length check
        if len(passphrase) < 12:
            errors.append("Passphrase must be at least 12 characters long")
        elif len(passphrase) >= 20:
            score += 3
        elif len(passphrase) >= 16:
            score += 2
        else:
            score += 1
        
        # Character variety
        if re.search(r'[a-z]', passphrase):
            score += 1
        else:
            warnings.append("Include lowercase letters")
            
        if re.search(r'[A-Z]', passphrase):
            score += 1
        else:
            warnings.append("Include uppercase letters")
            
        if re.search(r'[0-9]', passphrase):
            score += 1
        else:
            warnings.append("Include numbers")
            
        if re.search(r'[^a-zA-Z0-9]', passphrase):
            score += 1
        else:
            warnings.append("Include special characters")
        
        # Common patterns check
        common_patterns = ['123456', '654321', 'password', 'qwerty', 'abc123', 'letmein']
        for pattern in common_patterns:
            if pattern.lower() in passphrase.lower():
                errors.append(f"Avoid common patterns like '{pattern}'")
                score = max(0, score - 2)
                break
        
        # Sequential characters check
        has_sequence = False
        for i in range(len(passphrase) - 2):
            if (ord(passphrase[i+1]) == ord(passphrase[i]) + 1 and 
                ord(passphrase[i+2]) == ord(passphrase[i+1]) + 1):
                has_sequence = True
                break
        
        if has_sequence:
            warnings.append("Avoid sequential characters")
            score = max(0, score - 1)
        
        return {
            'is_valid': len(errors) == 0 and score >= 4,
            'score': min(7, score),
            'errors': errors,
            'warnings': warnings
        }
    
    @staticmethod
    def validate_email(email: str) -> bool:
        """Enhanced email validation"""
        pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        return re.match(pattern, email) is not None
    
    @staticmethod
    def validate_crypto_data(encrypted_data: Dict[str, str]) -> Dict[str, Any]:
        """Validate encrypted wallet data structure"""
        required_fields = ['encrypted_mnemonic', 'salt', 'nonce']
        errors = []
        
        for field in required_fields:
            if field not in encrypted_data:
                errors.append(f"Missing required field: {field}")
            elif not encrypted_data[field] or len(encrypted_data[field]) < 8:
                errors.append(f"Invalid {field}: too short")
        
        return {
            'is_valid': len(errors) == 0,
            'errors': errors
        }

security_validator = SecurityValidator()

# MongoDB setup: read URI and DB name from environment variables
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "yap")

try:
    client = AsyncIOMotorClient(MONGO_URI)
    # Use the specified database name to access the profiles collection
    db = client.get_database(MONGO_DB_NAME).get_collection("profiles")
    # Add audit collection for security events
    audit_db = client.get_database(MONGO_DB_NAME).get_collection("security_audit")
    logger.info(f"✅ Connected to MongoDB: {MONGO_DB_NAME}")
except Exception as e:
    logger.error(f"❌ Failed to connect to MongoDB: {e}")
    raise RuntimeError(f"MongoDB connection failed: {e}")

# Rate limiting middleware
async def check_rate_limit(request: Request):
    """Rate limiting dependency"""
    client_ip = request.client.host
    endpoint = request.url.path
    
    # Different limits for different endpoints
    limits = {
        '/wallet/recover': {'max_requests': 10, 'window_minutes': 5},  # Stricter for auth
        '/wallet/secure-account': {'max_requests': 5, 'window_minutes': 10},  # Very strict for setup
        'default': {'max_requests': 60, 'window_minutes': 1}  # Default limit
    }
    
    limit_config = limits.get(endpoint, limits['default'])
    
    if rate_limiter.is_rate_limited(client_ip, endpoint, 
                                   limit_config['max_requests'], 
                                   limit_config['window_minutes']):
        audit_logger.warning(f"Rate limit exceeded - IP: {client_ip}, Endpoint: {endpoint}")
        raise HTTPException(
            status_code=429,
            detail={
                "error": "rate_limit_exceeded",
                "message": "Rate limit exceeded. Please try again later.",
                "retry_after": limit_config['window_minutes'] * 60
            }
        )

# Security audit logging
async def log_security_event(event_type: str, email: str, client_ip: str, 
                           details: Dict[str, Any], success: bool = True):
    """Log security events to database and file"""
    event = {
        'timestamp': datetime.utcnow(),
        'event_type': event_type,
        'email_hash': hashlib.sha256(email.encode()).hexdigest(),  # Privacy preserving
        'client_ip': client_ip,
        'success': success,
        'details': details
    }
    
    try:
        await audit_db.insert_one(event)
        if success:
            audit_logger.info(f"Security event: {event_type} - {email}")
        else:
            audit_logger.warning(f"Security event failed: {event_type} - {email}")
    except Exception as e:
        logger.error(f"Failed to log security event: {e}")

def derive_key_and_hash(passphrase: str) -> tuple[bytes, str]:
    """
    Enhanced key derivation with increased iterations for better security.
    Matches the pattern from pw_security.py but with enhanced security.
    """
    password = bytes(passphrase, 'utf-8')
    salt = bytes('x0xmbtbles0x' + passphrase, 'utf-8')  # Same salt pattern as pw_security.py
    
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=600000,  # Increased from 390k to 600k for enhanced security
    )
    
    # Use standard base64 encoding to match mock server and pw_security.py
    key = base64.b64encode(kdf.derive(password))
    passphrase_hash = hashlib.sha256(key).hexdigest()  # Same as pw_security.py
    
    return key, passphrase_hash

class SecureAccountRequest(BaseModel):
    email: EmailStr
    passphrase: str
    encrypted_wallet_data: dict  # Contains client-side encrypted wallet data
    
    @validator('passphrase')
    def validate_passphrase(cls, v):
        validation = security_validator.validate_passphrase_strength(v)
        if not validation['is_valid']:
            raise ValueError(f"Passphrase validation failed: {', '.join(validation['errors'])}")
        return v

class AuthRequest(BaseModel):
    email: EmailStr
    passphrase: str
    
    @validator('passphrase')
    def validate_passphrase_length(cls, v):
        if len(v) < 8:
            raise ValueError("Passphrase too short")
        if len(v) > 1000:
            raise ValueError("Passphrase too long")
        return v

class RegistrationRequest(BaseModel):
    email: EmailStr
    passphrase: str
    # client-side encrypted mnemonic components
    encrypted_mnemonic: str
    salt: str
    nonce: str
    
    @validator('passphrase')
    def validate_passphrase(cls, v):
        validation = security_validator.validate_passphrase_strength(v)
        if not validation['is_valid']:
            raise ValueError(f"Passphrase validation failed: {', '.join(validation['errors'])}")
        return v
    
    @validator('encrypted_mnemonic', 'salt', 'nonce')
    def validate_crypto_fields(cls, v):
        if not v or len(v) < 8:
            raise ValueError("Cryptographic field too short")
        return v

class WaitlistSignupRequest(BaseModel):
    email: EmailStr
    passphrase: str
    encrypted_mnemonic: str
    salt: str
    nonce: str
    sei_address: str
    sei_public_key: str
    eth_address: str
    eth_public_key: str
    
    @validator('passphrase')
    def validate_passphrase(cls, v):
        validation = security_validator.validate_passphrase_strength(v)
        if not validation['is_valid']:
            raise ValueError(f"Passphrase validation failed: {', '.join(validation['errors'])}")
        return v
    
    @validator('sei_address')
    def validate_sei_address(cls, v):
        if not v.startswith('sei1') or len(v) < 10:
            raise ValueError("Invalid SEI address format")
        return v
    
    @validator('eth_address')
    def validate_eth_address(cls, v):
        if not v.startswith('0x') or len(v) != 42:
            raise ValueError("Invalid Ethereum address format")
        return v

# Enhanced security monitoring models
class SecurityMetrics(BaseModel):
    total_requests: int
    failed_attempts: int
    rate_limited_requests: int
    unique_ips: int
    timestamp: datetime

@app.get("/health")
@security_middleware.protect_endpoint("health_check")
async def health_check(request: Request):
    """Enhanced health check with security metrics"""
    try:
        # Test database connection
        await db.find_one({}, {"_id": 1})
        db_status = "connected"
    except Exception:
        db_status = "disconnected"
    
    # Get security status from middleware
    security_metrics = get_wallet_security_metrics()
    
    return {
        "status": "ok",
        "database": db_status,
        "timestamp": datetime.utcnow().isoformat(),
        "version": "2.0.0",
        "security_features": [
            "rate_limiting",
            "audit_logging", 
            "enhanced_validation",
            "pbkdf2_600k_iterations",
            "comprehensive_security_middleware",
            "financial_fraud_detection"
        ],
        "security_status": {
            "active_sessions": security_metrics.get("active_sessions", 0),
            "blocked_requests": security_metrics.get("blocked_requests", 0),
            "threat_level": "low"
        }
    }

@app.get("/wallet/email/{email}")
@security_middleware.protect_endpoint("get_profile")
async def get_profile_by_email(email: str, request: Request, _: None = Depends(check_rate_limit)):
    """Get user profile with enhanced security logging"""
    client_ip = request.client.host
    
    # Additional security validation from middleware
    await security_middleware.validate_request(request, {"email": email})
    
    # Validate email format
    if not security_validator.validate_email(email):
        await log_security_event("invalid_email_lookup", email, client_ip, 
                                {"error": "invalid_email_format"}, False)
        raise HTTPException(status_code=400, detail="Invalid email format")
    
    try:
        profile = await db.find_one({"email": email}, {"_id": 0})
        if not profile:
            await log_security_event("profile_lookup", email, client_ip, 
                                    {"result": "not_found"}, False)
            raise HTTPException(status_code=404, detail="Profile not found")
        
        await log_security_event("profile_lookup", email, client_ip, 
                                {"result": "found", "has_wallet": bool(profile.get("wlw"))}, True)
        return profile
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Database error in profile lookup: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.post("/wallet/secure-account")
@security_middleware.protect_endpoint("create_wallet") 
async def setup_secure_account(request: SecureAccountRequest, req: Request, 
                             _: None = Depends(check_rate_limit)):
    """
    Enhanced first-time secure account setup with comprehensive security features.
    Layer 1: Server-side PBKDF2 key derivation and hash storage (600k iterations)
    Layer 2: Client-side E2E encryption of wallet data
    """
    client_ip = req.client.host
    
    # Enhanced security validation from middleware
    await security_middleware.validate_request(req, {
        "email": request.email,
        "operation": "create_wallet",
        "encrypted_data": request.encrypted_wallet_data
    })
    
    # Validate encrypted wallet data structure
    crypto_validation = security_validator.validate_crypto_data(request.encrypted_wallet_data)
    if not crypto_validation['is_valid']:
        await log_security_event("secure_account_setup", request.email, client_ip,
                                {"error": "invalid_crypto_data", "details": crypto_validation['errors']}, False)
        raise HTTPException(status_code=400, detail=f"Invalid encrypted data: {', '.join(crypto_validation['errors'])}")
    
    # Find waitlist user by email
    try:
        profile = await db.find_one({"email": request.email}, {"_id": 0})
        if not profile:
            await log_security_event("secure_account_setup", request.email, client_ip,
                                    {"error": "email_not_found"}, False)
            raise HTTPException(status_code=404, detail="Email not found in waitlist")
        
        # Check if user already has secure account setup
        if profile.get("wlw") == True and profile.get("passphrase_hash"):
            await log_security_event("secure_account_setup", request.email, client_ip,
                                    {"error": "already_secured"}, False)
            raise HTTPException(status_code=409, detail="Account already has secure passphrase setup")
        
        # Derive key and hash using enhanced security (600k iterations)
        key, passphrase_hash = derive_key_and_hash(request.passphrase)
        
        # Update user profile with secure account data
        update_data = {
            "wlw": True,
            "passphrase_hash": passphrase_hash,
            "encrypted_wallet_data": request.encrypted_wallet_data,
            "secured_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat()
        }
        
        result = await db.update_one({"email": request.email}, {"$set": update_data})
        if result.modified_count != 1:
            raise HTTPException(status_code=500, detail="Failed to setup secure account")
        
        return {
            "success": True,
            "message": "Secure account setup completed",
            "user_id": profile.get("userId", "unknown")
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to setup secure account: {str(e)}")

@app.post("/wallet/recover")
@security_middleware.protect_endpoint("authenticate")
async def recover_wallet(request: AuthRequest, req: Request, _: None = Depends(check_rate_limit)):
    """
    Enhanced wallet recovery with comprehensive security features.
    Layer 1: Server-side hash verification (PBKDF2 + SHA256)
    Layer 2: Return encrypted wallet data for client-side decryption
    """
    client_ip = req.client.host
    
    # Enhanced security validation from middleware
    await security_middleware.validate_request(req, {
        "email": request.email,
        "operation": "authenticate",
        "passphrase_length": len(request.passphrase)
    })
    
    # Check for too many failed attempts from this IP
    failed_attempts = rate_limiter.get_failed_attempts_count(client_ip, hours=1)
    if failed_attempts >= 5:
        await log_security_event("wallet_recovery", request.email, client_ip,
                                {"error": "too_many_failed_attempts", "count": failed_attempts}, False)
        raise HTTPException(
            status_code=429,
            detail={
                "error": "too_many_attempts",
                "message": "Too many failed attempts. Please try again later.",
                "retry_after": 3600
            }
        )
    
    try:
        # Find user profile by email
        profile = await db.find_one({"email": request.email}, {"_id": 0})
        if not profile:
            rate_limiter.log_failed_attempt(client_ip, request.email, "email_not_found")
            await log_security_event("wallet_recovery", request.email, client_ip,
                                    {"error": "email_not_found"}, False)
            raise HTTPException(status_code=404, detail="Email not found")
        
        # Check if user needs to setup secure account first
        if not profile.get("passphrase_hash"):
            await log_security_event("wallet_recovery", request.email, client_ip,
                                    {"error": "setup_required"}, False)
            raise HTTPException(
                status_code=409, 
                detail={
                    "error": "setup_required",
                    "message": "User needs to setup secure account first",
                    "setup_required": True
                }
            )
        
        # Derive key and hash from provided passphrase using same process as setup
        key, provided_hash = derive_key_and_hash(request.passphrase)
        
        # Verify hash matches stored hash (Layer 1 authentication)
        stored_hash = profile.get("passphrase_hash")
        if provided_hash != stored_hash:
            rate_limiter.log_failed_attempt(client_ip, request.email, "invalid_passphrase")
            await log_security_event("wallet_recovery", request.email, client_ip,
                                    {"error": "invalid_passphrase"}, False)
            raise HTTPException(
                status_code=401, 
                detail={
                    "error": "invalid_passphrase",
                    "message": "Invalid passphrase"
                }
            )
        
        # Authentication successful - return encrypted wallet data for client-side decryption (Layer 2)
        encrypted_wallet_data = profile.get("encrypted_wallet_data")
        if not encrypted_wallet_data:
            await log_security_event("wallet_recovery", request.email, client_ip,
                                    {"error": "no_wallet_data"}, False)
            raise HTTPException(status_code=404, detail="No encrypted wallet data found")
        
        # Log successful recovery
        await log_security_event("wallet_recovery", request.email, client_ip,
                                {"user_id": profile.get("userId", "unknown"), "has_waitlist_bonus": bool(profile.get("waitlist_bonus"))}, True)
        
        return {
            "success": True,
            "encrypted_wallet_data": encrypted_wallet_data,
            "user_id": profile.get("userId", "unknown"),
            "waitlist_bonus": profile.get("waitlist_bonus", 0)
        }
        
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        logger.error(f"Unexpected error in wallet recovery: {e}")
        await log_security_event("wallet_recovery", request.email, client_ip,
                                {"error": "unexpected_error", "details": str(e)}, False)
        raise HTTPException(status_code=500, detail="Failed to recover wallet")

@app.post("/wallet/register")
@security_middleware.protect_endpoint("register_wallet")
async def register_wallet(request: RegistrationRequest, req: Request, _: None = Depends(check_rate_limit)):
    """Enhanced wallet registration with security features"""
    client_ip = req.client.host
    
    # Enhanced security validation from middleware
    await security_middleware.validate_request(req, {
        "email": request.email,
        "operation": "register_wallet",
        "crypto_data": {
            "encrypted_mnemonic": request.encrypted_mnemonic,
            "salt": request.salt,
            "nonce": request.nonce
        }
    })
    
    try:
        # Verify user exists
        existing = await db.find_one({"email": request.email}, {"_id": 0})
        if not existing:
            await log_security_event("wallet_registration", request.email, client_ip,
                                    {"error": "profile_not_found"}, False)
            raise HTTPException(status_code=404, detail="Profile not found for registration")
        
        # Validate crypto data structure
        crypto_data = {
            "encrypted_mnemonic": request.encrypted_mnemonic,
            "salt": request.salt,
            "nonce": request.nonce
        }
        crypto_validation = security_validator.validate_crypto_data(crypto_data)
        if not crypto_validation['is_valid']:
            await log_security_event("wallet_registration", request.email, client_ip,
                                    {"error": "invalid_crypto_data", "details": crypto_validation['errors']}, False)
            raise HTTPException(status_code=400, detail=f"Invalid crypto data: {', '.join(crypto_validation['errors'])}")
        
        # Store client-provided encrypted mnemonic
        payload = {
            "encrypted_mnemonic": request.encrypted_mnemonic,
            "salt": request.salt,
            "nonce": request.nonce,
            "registered_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat()
        }
        
        # Persist encrypted fields
        result = await db.update_one({"email": request.email}, {"$set": payload})
        if result.modified_count != 1:
            await log_security_event("wallet_registration", request.email, client_ip,
                                    {"error": "database_update_failed"}, False)
            raise HTTPException(status_code=500, detail="Failed to store encrypted mnemonic")
        
        # Log successful registration
        await log_security_event("wallet_registration", request.email, client_ip,
                                {"user_id": existing.get("userId", "unknown")}, True)
        
        return {
            "status": "registered",
            "message": "Wallet registered successfully",
            "user_id": existing.get("userId", "unknown")
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in wallet registration: {e}")
        await log_security_event("wallet_registration", request.email, client_ip,
                                {"error": "unexpected_error", "details": str(e)}, False)
        raise HTTPException(status_code=500, detail="Failed to register wallet")

@app.post("/wallet/waitlist-signup")
@security_middleware.protect_endpoint("waitlist_signup")
async def waitlist_signup(request: WaitlistSignupRequest, req: Request, _: None = Depends(check_rate_limit)):
    """
    Enhanced waitlist user signup with comprehensive security features
    """
    client_ip = req.client.host
    
    # Enhanced security validation from middleware
    await security_middleware.validate_request(req, {
        "email": request.email,
        "operation": "waitlist_signup",
        "sei_address": request.sei_address,
        "eth_address": request.eth_address,
        "crypto_data": {
            "encrypted_mnemonic": request.encrypted_mnemonic,
            "salt": request.salt,
            "nonce": request.nonce
        }
    })
    
    try:
        # Verify user exists
        existing = await db.find_one({"email": request.email}, {"_id": 0})
        if not existing:
            await log_security_event("waitlist_signup", request.email, client_ip,
                                    {"error": "profile_not_found"}, False)
            raise HTTPException(status_code=404, detail="Profile not found for waitlist signup")
        
        # Ensure user hasn't already onboarded
        if existing.get("wlw"):
            await log_security_event("waitlist_signup", request.email, client_ip,
                                    {"error": "already_has_wallet"}, False)
            raise HTTPException(status_code=400, detail="User already has a wallet")
        
        # Validate crypto data structure
        crypto_data = {
            "encrypted_mnemonic": request.encrypted_mnemonic,
            "salt": request.salt,
            "nonce": request.nonce
        }
        crypto_validation = security_validator.validate_crypto_data(crypto_data)
        if not crypto_validation['is_valid']:
            await log_security_event("waitlist_signup", request.email, client_ip,
                                    {"error": "invalid_crypto_data", "details": crypto_validation['errors']}, False)
            raise HTTPException(status_code=400, detail=f"Invalid crypto data: {', '.join(crypto_validation['errors'])}")
        
        # Prepare wallet payload with enhanced security metadata
        wallet_data = {
            "wlw": True,
            "waitlist_bonus": 25,
            "sei_wallet": {
                "address": request.sei_address,
                "public_key": request.sei_public_key
            },
            "eth_wallet": {
                "address": request.eth_address,
                "public_key": request.eth_public_key
            },
            "encrypted_mnemonic": request.encrypted_mnemonic,
            "salt": request.salt,
            "nonce": request.nonce,
            "waitlist_signup_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
            "signup_ip_hash": hashlib.sha256(client_ip.encode()).hexdigest()  # Privacy-preserving IP tracking
        }
        
        # Persist to DB
        result = await db.update_one({"email": request.email}, {"$set": wallet_data})
        if result.modified_count != 1:
            await log_security_event("waitlist_signup", request.email, client_ip,
                                    {"error": "database_update_failed"}, False)
            raise HTTPException(status_code=500, detail="Failed to store wallet data")
        
        # Log successful waitlist signup
        await log_security_event("waitlist_signup", request.email, client_ip,
                                {"user_id": existing.get("userId", "unknown"), 
                                 "sei_address": request.sei_address,
                                 "eth_address": request.eth_address}, True)
        
        return {
            "status": "wallet_created",
            "sei_address": request.sei_address,
            "eth_address": request.eth_address,
            "waitlist_bonus": 25,
            "user_id": existing.get("userId", "unknown"),
            "message": "Wallet created successfully for waitlist user"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in waitlist signup: {e}")
        await log_security_event("waitlist_signup", request.email, client_ip,
                                {"error": "unexpected_error", "details": str(e)}, False)
        raise HTTPException(status_code=500, detail="Failed to create waitlist wallet")

# New Security Analytics and Monitoring Endpoints

@app.get("/wallet/security/metrics")
@security_middleware.protect_endpoint("security_metrics")
async def get_security_metrics(request: Request):
    """Get comprehensive security metrics for monitoring"""
    try:
        client_ip = request.client.host
        
        # Get metrics from both middleware and local audit database
        middleware_metrics = get_wallet_security_metrics()
        
        # Get audit database metrics
        yesterday = datetime.utcnow() - timedelta(days=1)
        events = await audit_db.find({
            "timestamp": {"$gte": yesterday}
        }).to_list(1000)
        
        # Calculate metrics
        total_events = len(events)
        failed_events = len([e for e in events if not e.get('success', True)])
        unique_ips = len(set(e.get('client_ip') for e in events if e.get('client_ip')))
        
        # Event type breakdown
        event_types = {}
        for event in events:
            event_type = event.get('event_type', 'unknown')
            event_types[event_type] = event_types.get(event_type, 0) + 1
        
        await log_security_event("metrics_access", "admin", client_ip, 
                                {"total_events": total_events}, True)
        
        return {
            "status": "success",
            "timestamp": datetime.utcnow().isoformat(),
            "period": "24h",
            "wallet_service_metrics": {
                "total_events": total_events,
                "failed_events": failed_events,
                "success_rate": round((total_events - failed_events) / max(total_events, 1) * 100, 2),
                "unique_ips": unique_ips,
                "event_types": event_types
            },
            "security_middleware_metrics": middleware_metrics
        }
    except Exception as e:
        logger.error(f"Error getting security metrics: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve security metrics"
        )

@app.get("/wallet/security/failed-attempts/{email}")
async def get_failed_attempts(email: str, request: Request, _: None = Depends(check_rate_limit)):
    """Get failed authentication attempts for specific email (admin endpoint)"""
    client_ip = request.client.host
    
    if not security_validator.validate_email(email):
        raise HTTPException(status_code=400, detail="Invalid email format")
    
    try:
        # Get failed attempts for this email (last 24 hours)
        yesterday = datetime.utcnow() - timedelta(days=1)
        email_hash = hashlib.sha256(email.encode()).hexdigest()
        
        failed_attempts = await audit_db.find({
            "email_hash": email_hash,
            "success": False,
            "timestamp": {"$gte": yesterday}
        }).to_list(100)
        
        await log_security_event("failed_attempts_query", email, client_ip, 
                                {"attempt_count": len(failed_attempts)}, True)
        
        return {
            "email_hash": email_hash,
            "failed_attempts": len(failed_attempts),
            "attempts": [
                {
                    "timestamp": attempt.get("timestamp"),
                    "event_type": attempt.get("event_type"),
                    "client_ip": attempt.get("client_ip"),
                    "details": attempt.get("details", {})
                }
                for attempt in failed_attempts
            ]
        }
        
    except Exception as e:
        logger.error(f"Failed to get failed attempts: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve failed attempts")

@app.post("/wallet/security/validate-passphrase")
async def validate_passphrase_endpoint(request: Request, _: None = Depends(check_rate_limit)):
    """Endpoint for frontend to validate passphrase strength"""
    client_ip = request.client.host
    
    try:
        body = await request.json()
        passphrase = body.get('passphrase', '')
        
        if not passphrase:
            raise HTTPException(status_code=400, detail="Passphrase is required")
        
        validation = security_validator.validate_passphrase_strength(passphrase)
        
        await log_security_event("passphrase_validation", "anonymous", client_ip, 
                                {"score": validation['score']}, True)
        
        return validation
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to validate passphrase: {e}")
        raise HTTPException(status_code=500, detail="Failed to validate passphrase")

# Enhanced error handling
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Enhanced error handling with security logging"""
    client_ip = request.client.host
    
    # Log security-relevant errors
    if exc.status_code in [401, 403, 429]:
        audit_logger.warning(f"Security error {exc.status_code} from {client_ip}: {exc.detail}")
    
    return {
        "error": exc.detail,
        "status_code": exc.status_code,
        "timestamp": datetime.utcnow().isoformat()
    }

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """General exception handler with security logging"""
    client_ip = request.client.host
    logger.error(f"Unhandled exception from {client_ip}: {exc}")
    
    return {
        "error": "Internal server error",
        "status_code": 500,
        "timestamp": datetime.utcnow().isoformat()
    }

if __name__ == "__main__":
    try:
        import uvicorn
    except ImportError:
        logger.error("uvicorn not installed. Install with: pip install uvicorn")
        exit(1)
    
    logger.info("🚀 Starting YAP Wallet Service with enhanced security features")
    logger.info("Security features enabled:")
    logger.info("- Comprehensive security middleware")
    logger.info("- Rate limiting with endpoint-specific limits")
    logger.info("- Enhanced passphrase validation (12+ chars, 600k PBKDF2)")
    logger.info("- Comprehensive audit logging")
    logger.info("- Failed attempt monitoring")
    logger.info("- Financial fraud detection")
    logger.info("- Blockchain address validation")
    logger.info("- Security metrics and monitoring")
    
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8001,
        reload=True,
        log_level="info"
    )
