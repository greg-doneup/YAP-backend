import hashlib
import hmac
from typing import Dict, Tuple
from mnemonic import Mnemonic
from eth_account import Account
import ecdsa
from ecdsa.util import string_to_number, number_to_string
from ecdsa.curves import SECP256k1
from ecdsa.keys import SigningKey
import base64

class WalletUtils:
    """Utilities for generating SEI and ETH wallets from mnemonics."""
    
    @staticmethod
    def generate_mnemonic() -> str:
        """Generate a new 12-word BIP39 mnemonic."""
        mnemo = Mnemonic("english")
        return mnemo.generate(strength=128)  # 128 bits = 12 words
    
    @staticmethod
    def validate_mnemonic(mnemonic: str) -> bool:
        """Validate a BIP39 mnemonic."""
        mnemo = Mnemonic("english")
        return mnemo.check(mnemonic)
    
    @staticmethod
    def derive_seed_from_mnemonic(mnemonic: str, passphrase: str = "") -> bytes:
        """Derive seed from mnemonic using BIP39."""
        mnemo = Mnemonic("english")
        return mnemo.to_seed(mnemonic, passphrase)
    
    @staticmethod
    def derive_private_key(seed: bytes, derivation_path: str) -> bytes:
        """Derive private key from seed using BIP32 derivation path."""
        # This is a simplified BIP32 implementation
        # For production, consider using a more robust library
        
        # Parse derivation path (e.g., "m/44'/118'/0'/0/0" for SEI, "m/44'/60'/0'/0/0" for ETH)
        path_parts = derivation_path.split('/')[1:]  # Remove 'm'
        
        master_key = hmac.new(b"ed25519 seed", seed, hashlib.sha512).digest()
        key = master_key[:32]
        chain_code = master_key[32:]
        
        for part in path_parts:
            if part.endswith("'"):
                # Hardened derivation
                index = int(part[:-1]) + 0x80000000
            else:
                # Non-hardened derivation
                index = int(part)
            
            # Derive child key
            if index >= 0x80000000:
                # Hardened
                data = b'\x00' + key + index.to_bytes(4, 'big')
            else:
                # Non-hardened (for SEI we use hardened paths mostly)
                data = key + index.to_bytes(4, 'big')
            
            hmac_result = hmac.new(chain_code, data, hashlib.sha512).digest()
            key = hmac_result[:32]
            chain_code = hmac_result[32:]
        
        return key
    
    @staticmethod
    def create_sei_wallet(mnemonic: str) -> Dict[str, str]:
        """Create SEI wallet from mnemonic."""
        seed = WalletUtils.derive_seed_from_mnemonic(mnemonic)
        
        # SEI uses Cosmos SDK derivation path: m/44'/118'/0'/0/0
        private_key = WalletUtils.derive_private_key(seed, "m/44'/118'/0'/0/0")
        
        # Generate public key using secp256k1
        signing_key = SigningKey.from_string(private_key, curve=SECP256k1)
        public_key = signing_key.get_verifying_key().to_string("compressed")
        
        # Generate SEI address (bech32 format)
        # For simplicity, we'll create a mock address format
        # In production, use proper SEI address generation
        address = WalletUtils._generate_sei_address(public_key)
        
        return {
            "address": address,
            "private_key": private_key.hex(),
            "public_key": public_key.hex()
        }
    
    @staticmethod
    def create_eth_wallet(mnemonic: str) -> Dict[str, str]:
        """Create Ethereum wallet from mnemonic."""
        seed = WalletUtils.derive_seed_from_mnemonic(mnemonic)
        
        # Ethereum derivation path: m/44'/60'/0'/0/0
        private_key = WalletUtils.derive_private_key(seed, "m/44'/60'/0'/0/0")
        
        # Use eth_account for proper Ethereum wallet generation
        account = Account.from_key(private_key)
        
        return {
            "address": account.address,
            "private_key": private_key.hex(),
            "public_key": account._key_obj.public_key.to_hex()
        }
    
    @staticmethod
    def _generate_sei_address(public_key: bytes) -> str:
        """Generate SEI address from public key."""
        # This is a simplified implementation
        # In production, use proper bech32 encoding for SEI
        sha256_hash = hashlib.sha256(public_key).digest()
        ripemd160_hash = hashlib.new('ripemd160', sha256_hash).digest()
        
        # Mock SEI address format (should use bech32 with 'sei' prefix)
        address_bytes = ripemd160_hash[:20]
        return f"sei{base64.b32encode(address_bytes).decode().lower().rstrip('=')}"
    
    @staticmethod
    def create_wallets_from_mnemonic(mnemonic: str) -> Dict[str, Dict[str, str]]:
        """Create both SEI and ETH wallets from a single mnemonic."""
        if not WalletUtils.validate_mnemonic(mnemonic):
            raise ValueError("Invalid mnemonic phrase")
        
        sei_wallet = WalletUtils.create_sei_wallet(mnemonic)
        eth_wallet = WalletUtils.create_eth_wallet(mnemonic)
        
        return {
            "sei": sei_wallet,
            "eth": eth_wallet
        }
