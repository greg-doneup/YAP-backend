#!/usr/bin/env python3
"""
Secure Wallet Authentication Service
Implements E2E encryption for wallet data with PBKDF2 password stretching
"""

import os
import hashlib
import secrets
import base64
from typing import Dict, Any, Tuple, Optional
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives import serialization

class SecureWalletAuth:
    """
    Secure wallet authentication with E2E encryption
    
    Security Features:
    - PBKDF2 password stretching (390,000 iterations)
    - AES-GCM encryption for mnemonic storage
    - RSA encryption for server-side E2E encryption
    - Secure password hashing for authentication
    """
    
    def __init__(self, server_private_key: Optional[bytes] = None):
        """Initialize with server's private key for E2E encryption"""
        if server_private_key:
            self.server_private_key = serialization.load_pem_private_key(
                server_private_key, password=None
            )
        else:
            # Generate a new key pair for development
            self.server_private_key = rsa.generate_private_key(
                public_exponent=65537,
                key_size=2048
            )
        
        self.server_public_key = self.server_private_key.public_key()
    
    def stretch_passphrase(self, passphrase: str, salt: bytes) -> bytes:
        """
        Stretch passphrase using PBKDF2 with high iteration count
        
        Args:
            passphrase: User's original passphrase
            salt: Unique salt for this user
            
        Returns:
            Stretched key (32 bytes)
        """
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=390_000,  # High iteration count for security
        )
        return kdf.derive(passphrase.encode('utf-8'))
    
    def hash_stretched_passphrase(self, stretched_key: bytes) -> str:
        """
        Hash the stretched passphrase for storage
        
        Args:
            stretched_key: Output from stretch_passphrase
            
        Returns:
            Hex-encoded SHA-256 hash
        """
        return hashlib.sha256(stretched_key).hexdigest()
    
    def encrypt_mnemonic_client_side(self, mnemonic: str, passphrase: str) -> Dict[str, str]:
        """
        Client-side mnemonic encryption (for non-custodial storage)
        
        Args:
            mnemonic: Recovery phrase to encrypt
            passphrase: User's passphrase
            
        Returns:
            Encrypted data for client-side storage
        """
        # Generate unique salt for this encryption
        salt = secrets.token_bytes(16)
        
        # Derive encryption key from passphrase
        stretched_key = self.stretch_passphrase(passphrase, salt)
        
        # Generate nonce for AES-GCM
        nonce = secrets.token_bytes(12)
        
        # Encrypt with AES-GCM
        aesgcm = AESGCM(stretched_key)
        ciphertext = aesgcm.encrypt(nonce, mnemonic.encode('utf-8'), None)
        
        return {
            "encrypted_mnemonic": base64.b64encode(ciphertext).decode(),
            "salt": base64.b64encode(salt).decode(),
            "nonce": base64.b64encode(nonce).decode()
        }
    
    def encrypt_for_server_storage(self, data: str) -> Dict[str, str]:
        """
        Encrypt data for server-side storage using server's public key
        
        Args:
            data: Data to encrypt
            
        Returns:
            Encrypted data for server storage
        """
        # For large data, use hybrid encryption (RSA + AES)
        # Generate AES key
        aes_key = secrets.token_bytes(32)
        nonce = secrets.token_bytes(12)
        
        # Encrypt data with AES-GCM
        aesgcm = AESGCM(aes_key)
        encrypted_data = aesgcm.encrypt(nonce, data.encode('utf-8'), None)
        
        # Encrypt AES key with RSA
        encrypted_aes_key = self.server_public_key.encrypt(
            aes_key,
            padding.OAEP(
                mgf=padding.MGF1(algorithm=hashes.SHA256()),
                algorithm=hashes.SHA256(),
                label=None
            )
        )
        
        return {
            "encrypted_data": base64.b64encode(encrypted_data).decode(),
            "encrypted_key": base64.b64encode(encrypted_aes_key).decode(),
            "nonce": base64.b64encode(nonce).decode()
        }
    
    def decrypt_from_server_storage(self, encrypted_data: Dict[str, str]) -> str:
        """
        Decrypt data from server storage using server's private key
        
        Args:
            encrypted_data: Data encrypted with encrypt_for_server_storage
            
        Returns:
            Decrypted plaintext
        """
        # Decrypt AES key with RSA
        encrypted_aes_key = base64.b64decode(encrypted_data["encrypted_key"])
        aes_key = self.server_private_key.decrypt(
            encrypted_aes_key,
            padding.OAEP(
                mgf=padding.MGF1(algorithm=hashes.SHA256()),
                algorithm=hashes.SHA256(),
                label=None
            )
        )
        
        # Decrypt data with AES-GCM
        ciphertext = base64.b64decode(encrypted_data["encrypted_data"])
        nonce = base64.b64decode(encrypted_data["nonce"])
        
        aesgcm = AESGCM(aes_key)
        plaintext = aesgcm.decrypt(nonce, ciphertext, None)
        
        return plaintext.decode('utf-8')
    
    def create_secure_account(self, email: str, passphrase: str, 
                            sei_address: str, eth_address: str,
                            encrypted_mnemonic_data: Dict[str, str]) -> Dict[str, Any]:
        """
        Create a secure account with encrypted wallet data
        
        Args:
            email: User's email
            passphrase: User's passphrase (for hashing only)
            sei_address: SEI wallet address
            eth_address: Ethereum wallet address  
            encrypted_mnemonic_data: Client-side encrypted mnemonic
            
        Returns:
            Secure account data for database storage
        """
        # Generate unique salt for this user
        user_salt = secrets.token_bytes(16)
        
        # Stretch passphrase
        stretched_key = self.stretch_passphrase(passphrase, user_salt)
        
        # Hash stretched passphrase for authentication
        passphrase_hash = self.hash_stretched_passphrase(stretched_key)
        
        # Optionally encrypt sensitive data for server storage
        # (This is for backup/recovery purposes only)
        server_encrypted_data = self.encrypt_for_server_storage(
            f"{sei_address}|{eth_address}|{encrypted_mnemonic_data['salt']}"
        )
        
        return {
            "email": email,
            "passphrase_hash": passphrase_hash,
            "user_salt": base64.b64encode(user_salt).decode(),
            "sei_address": sei_address,
            "eth_address": eth_address,
            "client_encrypted_mnemonic": encrypted_mnemonic_data,
            "server_backup_data": server_encrypted_data,  # Optional backup
            "created_at": "now",
            "last_accessed": "now"
        }
    
    def verify_passphrase(self, provided_passphrase: str, stored_hash: str, 
                         stored_salt: str) -> bool:
        """
        Verify a passphrase against stored hash
        
        Args:
            provided_passphrase: Passphrase provided by user
            stored_hash: Hash stored in database
            stored_salt: Salt stored in database
            
        Returns:
            True if passphrase is correct
        """
        try:
            salt = base64.b64decode(stored_salt)
            stretched_key = self.stretch_passphrase(provided_passphrase, salt)
            computed_hash = self.hash_stretched_passphrase(stretched_key)
            
            # Secure comparison to prevent timing attacks
            return secrets.compare_digest(computed_hash, stored_hash)
        except Exception:
            return False
    
    def get_server_public_key_pem(self) -> str:
        """Get server's public key in PEM format for client use"""
        return self.server_public_key.public_key_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo
        ).decode('utf-8')

# Example usage and testing
if __name__ == "__main__":
    # Initialize secure wallet auth
    auth = SecureWalletAuth()
    
    # Test data
    test_email = "user@example.com"
    test_passphrase = "my-secure-passphrase-123"
    test_mnemonic = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
    test_sei = "sei1qwertyu..."
    test_eth = "0x1234567890..."
    
    print("=== Secure Wallet Authentication Test ===")
    
    # 1. Client-side mnemonic encryption
    print("1. Encrypting mnemonic client-side...")
    encrypted_mnemonic = auth.encrypt_mnemonic_client_side(test_mnemonic, test_passphrase)
    print(f"   Encrypted data keys: {list(encrypted_mnemonic.keys())}")
    
    # 2. Create secure account
    print("2. Creating secure account...")
    account_data = auth.create_secure_account(
        test_email, test_passphrase, test_sei, test_eth, encrypted_mnemonic
    )
    print(f"   Account created with passphrase hash: {account_data['passphrase_hash'][:16]}...")
    
    # 3. Verify passphrase
    print("3. Verifying passphrase...")
    is_valid = auth.verify_passphrase(
        test_passphrase, 
        account_data['passphrase_hash'],
        account_data['user_salt']
    )
    print(f"   Passphrase verification: {'✅ SUCCESS' if is_valid else '❌ FAILED'}")
    
    # 4. Test with wrong passphrase
    print("4. Testing with wrong passphrase...")
    is_invalid = auth.verify_passphrase(
        "wrong-passphrase",
        account_data['passphrase_hash'],
        account_data['user_salt']
    )
    print(f"   Wrong passphrase rejected: {'✅ SUCCESS' if not is_invalid else '❌ FAILED'}")
    
    print("\n=== Security Summary ===")
    print("✅ PBKDF2 password stretching (390,000 iterations)")
    print("✅ AES-GCM client-side mnemonic encryption")
    print("✅ RSA+AES hybrid server-side backup encryption")
    print("✅ Secure passphrase verification")
    print("✅ Timing attack resistant comparisons")
