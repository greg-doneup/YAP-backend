from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorClient
import os
import hashlib
import base64
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from datetime import datetime
from crypto_utils import CryptoUtils  # encryption utilities
from dotenv import load_dotenv

# Load environment variables
load_dotenv('.env.development')

app = FastAPI(
    title="YAP Wallet Service",
    description="Two-layer security wallet service for YAP application",
    version="1.0.0"
)

# Add CORS middleware for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8100", "http://localhost:3000", "http://localhost:4200"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# MongoDB setup: read URI and DB name from environment variables
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "yap")

try:
    client = AsyncIOMotorClient(MONGO_URI)
    # Use the specified database name to access the profiles collection
    db = client.get_database(MONGO_DB_NAME).get_collection("profiles")
    print(f"✅ Connected to MongoDB: {MONGO_DB_NAME}")
except Exception as e:
    print(f"❌ Failed to connect to MongoDB: {e}")
    raise RuntimeError(f"MongoDB connection failed: {e}")

def derive_key_and_hash(passphrase: str) -> tuple[bytes, str]:
    """
    Derive key from passphrase using PBKDF2 and return both the key and its hash.
    This matches the exact pattern from pw_security.py.
    """
    password = bytes(passphrase, 'utf-8')
    salt = bytes('x0xmbtbles0x' + passphrase, 'utf-8')  # Same salt pattern as pw_security.py
    
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=390000,  # Same iterations as pw_security.py
    )
    
    # Use standard base64 encoding to match mock server and pw_security.py
    key = base64.b64encode(kdf.derive(password))
    passphrase_hash = hashlib.sha256(key).hexdigest()  # Same as pw_security.py
    
    return key, passphrase_hash

class SecureAccountRequest(BaseModel):
    email: str
    passphrase: str
    encrypted_wallet_data: dict  # Contains client-side encrypted wallet data

class AuthRequest(BaseModel):
    email: str
    passphrase: str

class RegistrationRequest(BaseModel):
    email: str
    passphrase: str
    # client-side encrypted mnemonic components
    encrypted_mnemonic: str
    salt: str
    nonce: str

class WaitlistSignupRequest(BaseModel):
    email: str
    passphrase: str
    encrypted_mnemonic: str
    salt: str
    nonce: str
    sei_address: str
    sei_public_key: str
    eth_address: str
    eth_public_key: str

@app.get("/health")
async def health_check():
    return {"status": "ok"}

@app.get("/wallet/email/{email}")
async def get_profile_by_email(email: str):
    profile = await db.find_one({"email": email}, {"_id": 0})
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile

@app.post("/wallet/secure-account")
async def setup_secure_account(request: SecureAccountRequest):
    """
    First-time secure account setup for waitlist users using two-layer security.
    Layer 1: Server-side PBKDF2 key derivation and hash storage (following pw_security.py pattern)
    Layer 2: Client-side E2E encryption of wallet data
    """
    # Find waitlist user by email
    profile = await db.find_one({"email": request.email}, {"_id": 0})
    if not profile:
        raise HTTPException(status_code=404, detail="Email not found in waitlist")
    
    # Check if user already has secure account setup
    if profile.get("wlw") == True and profile.get("passphrase_hash"):
        raise HTTPException(status_code=409, detail="Account already has secure passphrase setup")
    
    try:
        # Derive key and hash using the same process as pw_security.py
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
async def recover_wallet(request: AuthRequest):
    """
    Authenticate user and return encrypted wallet data using two-layer security.
    Layer 1: Server-side hash verification (PBKDF2 + SHA256)
    Layer 2: Return encrypted wallet data for client-side decryption
    """
    # Find user profile by email
    profile = await db.find_one({"email": request.email}, {"_id": 0})
    if not profile:
        raise HTTPException(status_code=404, detail="Email not found")
    
    # Check if user needs to setup secure account first
    if not profile.get("passphrase_hash"):
        raise HTTPException(
            status_code=409, 
            detail={
                "error": "setup_required",
                "message": "User needs to setup secure account first",
                "setup_required": True
            }
        )
    
    try:
        # Derive key and hash from provided passphrase using same process as setup
        key, provided_hash = derive_key_and_hash(request.passphrase)
        
        # Verify hash matches stored hash (Layer 1 authentication)
        stored_hash = profile.get("passphrase_hash")
        if provided_hash != stored_hash:
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
            raise HTTPException(status_code=404, detail="No encrypted wallet data found")
        
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
        raise HTTPException(status_code=500, detail=f"Failed to recover wallet: {str(e)}")

@app.post("/wallet/register")
async def register_wallet(request: RegistrationRequest):
    # Verify user exists
    existing = await db.find_one({"email": request.email}, {"_id":0})
    if not existing:
        raise HTTPException(status_code=404, detail="Profile not found for registration")
    # Store client-provided encrypted mnemonic
    payload = {
        "encrypted_mnemonic": request.encrypted_mnemonic,
        "salt": request.salt,
        "nonce": request.nonce
    }
    # Persist encrypted fields
    result = await db.update_one({"email": request.email}, {"$set": payload})
    if result.modified_count != 1:
        raise HTTPException(status_code=500, detail="Failed to store encrypted mnemonic")
    return {"status": "registered"}

@app.post("/wallet/waitlist-signup")
async def waitlist_signup(request: WaitlistSignupRequest):
    """
    Handle waitlist user signup: accept client-generated encrypted mnemonic and wallet info
    """
    # Verify user exists
    existing = await db.find_one({"email": request.email}, {"_id":0})
    if not existing:
        raise HTTPException(status_code=404, detail="Profile not found for waitlist signup")
    # Ensure user hasn't already onboarded
    if existing.get("wlw"):
        raise HTTPException(status_code=400, detail="User already has a wallet")
    # Prepare wallet payload
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
        "nonce": request.nonce
    }
    # Persist to DB
    result = await db.update_one({"email": request.email}, {"$set": wallet_data})
    if result.modified_count != 1:
        raise HTTPException(status_code=500, detail="Failed to store wallet data")
    return {
        "status": "wallet_created",
        "sei_address": request.sei_address,
        "eth_address": request.eth_address,
        "waitlist_bonus": 25,
        "message": "Wallet created successfully for waitlist user"
    }
