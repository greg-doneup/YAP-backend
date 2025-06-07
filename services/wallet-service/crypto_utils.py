import os
import base64
import hashlib
import hmac
import secrets
from typing import Dict, Any, Tuple
from datetime import datetime, timedelta
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

class CryptoUtils:
    """Enhanced utilities for encryption and decryption of mnemonics with server secret integration."""
    
    @staticmethod
    def generate_salt() -> bytes:
        """Generate a random salt for key derivation."""
        return os.urandom(16)
    
    @staticmethod
    def derive_key(passphrase: str, salt: bytes) -> bytes:
        """Derive an encryption key from a passphrase using PBKDF2."""
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            iterations=100000,  # High iteration count for security
            salt=salt,
            length=32  # 256-bit key
        )
        return kdf.derive(passphrase.encode())
    
    @staticmethod
    def encrypt_mnemonic(mnemonic: str, passphrase: str) -> Dict[str, str]:
        """
        Encrypt a mnemonic using a passphrase.
        
        Returns:
            Dict with base64-encoded salt, nonce, and ciphertext
        """
        salt = CryptoUtils.generate_salt()
        key = CryptoUtils.derive_key(passphrase, salt)
        
        # Generate a random nonce
        nonce = os.urandom(12)  # 96 bits
        
        # Encrypt with AES-GCM
        aesgcm = AESGCM(key)
        ciphertext = aesgcm.encrypt(nonce, mnemonic.encode(), None)
        
        # Return the components needed for decryption
        return {
            "encrypted_mnemonic": base64.b64encode(ciphertext).decode(),
            "salt": base64.b64encode(salt).decode(),
            "nonce": base64.b64encode(nonce).decode()
        }
    
    @staticmethod
    def decrypt_mnemonic(
        encrypted_mnemonic: str, 
        passphrase: str, 
        salt: str, 
        nonce: str
    ) -> str:
        """
        Decrypt an encrypted mnemonic using a passphrase.
        
        Args:
            encrypted_mnemonic: Base64-encoded encrypted mnemonic
            passphrase: User's passphrase
            salt: Base64-encoded salt
            nonce: Base64-encoded nonce
            
        Returns:
            The decrypted mnemonic phrase
        
        Raises:
            ValueError: If decryption fails (wrong passphrase)
        """
        salt_bytes = base64.b64decode(salt)
        nonce_bytes = base64.b64decode(nonce)
        encrypted_bytes = base64.b64decode(encrypted_mnemonic)
        
        key = CryptoUtils.derive_key(passphrase, salt_bytes)
        
        aesgcm = AESGCM(key)
        try:
            decrypted = aesgcm.decrypt(nonce_bytes, encrypted_bytes, None)
            return decrypted.decode()
        except Exception:
            raise ValueError("Invalid passphrase or corrupted data")
    
    @staticmethod
    def get_server_secret() -> str:
        """Get server secret from environment with fallback generation."""
        server_secret = os.environ.get('MNEMONIC_SERVER_SECRET')
        if not server_secret:
            # Generate and warn - this should be set in production
            server_secret = secrets.token_hex(32)
            print("WARNING: MNEMONIC_SERVER_SECRET not set. Using generated secret (not persistent)")
        return server_secret
    
    @staticmethod
    def create_recovery_hash(mnemonic: str, user_id: str) -> Dict[str, str]:
        """
        Create a secure recovery hash for mnemonic storage.
        
        Uses two-layer hashing with server secret to prevent offline attacks.
        
        Args:
            mnemonic: The recovery mnemonic phrase
            user_id: Unique user identifier
            
        Returns:
            Dict containing recovery_hash and user_salt for storage
        """
        # Generate user-specific salt
        user_salt = os.urandom(32)
        
        # First layer: User-specific PBKDF2
        client_hash = hashlib.pbkdf2_hmac(
            'sha256',
            mnemonic.encode('utf-8'),
            user_salt + user_id.encode('utf-8'),  # Include user_id in salt
            100000  # High iteration count
        )
        
        # Second layer: Server secret integration
        server_secret = CryptoUtils.get_server_secret()
        server_salt = hashlib.sha256(f"{user_id}:{server_secret}".encode()).digest()
        
        final_hash = hashlib.pbkdf2_hmac(
            'sha256',
            client_hash,
            server_salt,
            50000  # Additional iterations with server secret
        )
        
        return {
            'recovery_hash': base64.b64encode(final_hash).decode(),
            'user_salt': base64.b64encode(user_salt).decode(),
            'created_at': datetime.utcnow().isoformat()
        }
    
    @staticmethod
    def verify_recovery_hash(mnemonic: str, user_id: str, stored_hash: str, stored_salt: str) -> bool:
        """
        Verify a mnemonic against stored recovery hash.
        
        Args:
            mnemonic: The mnemonic to verify
            user_id: User identifier
            stored_hash: Base64 encoded stored hash
            stored_salt: Base64 encoded stored salt
            
        Returns:
            True if mnemonic matches stored hash
        """
        try:
            user_salt = base64.b64decode(stored_salt)
            
            # Recreate the hash using same process
            client_hash = hashlib.pbkdf2_hmac(
                'sha256',
                mnemonic.encode('utf-8'),
                user_salt + user_id.encode('utf-8'),
                100000
            )
            
            server_secret = CryptoUtils.get_server_secret()
            server_salt = hashlib.sha256(f"{user_id}:{server_secret}".encode()).digest()
            
            final_hash = hashlib.pbkdf2_hmac(
                'sha256',
                client_hash,
                server_salt,
                50000
            )
            
            computed_hash = base64.b64encode(final_hash).decode()
            return hmac.compare_digest(computed_hash, stored_hash)
            
        except Exception as e:
            print(f"Error verifying recovery hash: {e}")
            return False
    
    @staticmethod
    def create_secure_session_token(user_id: str, wallet_address: str) -> Dict[str, str]:
        """
        Create a secure session token for wallet operations.
        
        Args:
            user_id: User identifier
            wallet_address: Wallet address
            
        Returns:
            Dict containing session token and expiry
        """
        timestamp = str(int(datetime.utcnow().timestamp()))
        expiry = datetime.utcnow() + timedelta(hours=24)
        
        # Create token data
        token_data = f"{user_id}:{wallet_address}:{timestamp}"
        server_secret = CryptoUtils.get_server_secret()
        
        # Sign with HMAC
        signature = hmac.new(
            server_secret.encode(),
            token_data.encode(),
            hashlib.sha256
        ).hexdigest()
        
        session_token = base64.b64encode(f"{token_data}:{signature}".encode()).decode()
        
        return {
            'session_token': session_token,
            'expires_at': expiry.isoformat(),
            'created_at': datetime.utcnow().isoformat()
        }
    
    @staticmethod
    def verify_session_token(session_token: str, user_id: str, wallet_address: str) -> bool:
        """
        Verify a session token.
        
        Args:
            session_token: Base64 encoded session token
            user_id: Expected user ID
            wallet_address: Expected wallet address
            
        Returns:
            True if token is valid and not expired
        """
        try:
            decoded = base64.b64decode(session_token).decode()
            parts = decoded.split(':')
            
            if len(parts) != 4:
                return False
            
            token_user_id, token_wallet, timestamp, signature = parts
            
            # Verify user and wallet match
            if token_user_id != user_id or token_wallet != wallet_address:
                return False
            
            # Check expiry (24 hours)
            token_time = datetime.fromtimestamp(int(timestamp))
            if datetime.utcnow() - token_time > timedelta(hours=24):
                return False
            
            # Verify signature
            token_data = f"{token_user_id}:{token_wallet}:{timestamp}"
            server_secret = CryptoUtils.get_server_secret()
            
            expected_signature = hmac.new(
                server_secret.encode(),
                token_data.encode(),
                hashlib.sha256
            ).hexdigest()
            
            return hmac.compare_digest(signature, expected_signature)
            
        except Exception as e:
            print(f"Error verifying session token: {e}")
            return False
