import os
import base64
from typing import Dict, Any, Tuple
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

class CryptoUtils:
    """Utilities for encryption and decryption of mnemonics."""
    
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
