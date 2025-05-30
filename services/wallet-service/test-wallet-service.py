#!/usr/bin/env python3
"""
YAP Wallet Service Test Script
Tests the two-layer security implementation locally
"""

import asyncio
import aiohttp
import json
import sys

# Test configuration
BASE_URL = "http://localhost:8000"
TEST_EMAIL = "test-wallet@example.com"
TEST_PASSPHRASE = "test-secure-passphrase-123"

async def test_wallet_service():
    """Test the complete two-layer security flow"""
    print("🧪 Testing YAP Wallet Service Two-Layer Security")
    print("=" * 50)
    
    async with aiohttp.ClientSession() as session:
        # Test 1: Health check
        print("1️⃣ Testing health check...")
        async with session.get(f"{BASE_URL}/health") as resp:
            if resp.status == 200:
                data = await resp.json()
                print(f"✅ Health check passed: {data}")
            else:
                print(f"❌ Health check failed: {resp.status}")
                return False
        
        # Test 2: Check if user exists (should not exist initially)
        print(f"\n2️⃣ Checking if user {TEST_EMAIL} exists...")
        async with session.get(f"{BASE_URL}/wallet/email/{TEST_EMAIL}") as resp:
            if resp.status == 404:
                print("✅ User doesn't exist (expected)")
            else:
                print(f"ℹ️ User already exists: {resp.status}")
        
        # Test 3: Try to recover wallet for non-existent user
        print(f"\n3️⃣ Testing recovery for non-existent user...")
        recovery_data = {
            "email": TEST_EMAIL,
            "passphrase": TEST_PASSPHRASE
        }
        async with session.post(f"{BASE_URL}/wallet/recover", json=recovery_data) as resp:
            if resp.status == 404:
                print("✅ Correctly returned 404 for non-existent user")
            else:
                data = await resp.json()
                print(f"⚠️ Unexpected response: {resp.status} - {data}")
        
        # Test 4: Set up secure account (this would normally require a user to exist in DB)
        print(f"\n4️⃣ Testing secure account setup...")
        setup_data = {
            "email": TEST_EMAIL,
            "passphrase": TEST_PASSPHRASE,
            "encrypted_wallet_data": {
                "encrypted_mnemonic": "test_encrypted_data",
                "salt": "test_salt_16_bytes",
                "nonce": "test_nonce_12",
                "sei_address": "sei1testaddress",
                "eth_address": "0xtestethaddress"
            }
        }
        async with session.post(f"{BASE_URL}/wallet/secure-account", json=setup_data) as resp:
            data = await resp.json()
            if resp.status == 404:
                print("✅ Correctly returned 404 - user doesn't exist in DB")
            else:
                print(f"Response: {resp.status} - {data}")
        
        print(f"\n🎉 Wallet service tests completed!")
        print(f"💡 To test with real data, populate MongoDB with test users")
        
        return True

async def main():
    """Main test function"""
    try:
        success = await test_wallet_service()
        sys.exit(0 if success else 1)
    except aiohttp.ClientConnectorError:
        print("❌ Could not connect to wallet service")
        print("💡 Make sure the service is running at http://localhost:8000")
        print("   Run: uvicorn main:app --host 0.0.0.0 --port 8000 --reload")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Test failed with error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
