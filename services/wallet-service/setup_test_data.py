import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def setup_test_data():
    """Setup test data for wallet service testing"""
    
    # Connect to MongoDB
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client.get_database("yap").get_collection("profiles")
    
    # Test user data
    test_users = [
        {
            "email": "test@example.com", 
            "name": "Test User",
            "created_at": "2024-01-01T00:00:00Z"
        },
        {
            "email": "test2@example.com", 
            "name": "Test User 2",
            "created_at": "2024-01-01T00:00:00Z"
        },
        {
            "email": "existing@wallet.com",
            "name": "Existing Wallet User",
            "wlw": True,
            "created_at": "2024-01-01T00:00:00Z"
        }
    ]
    
    # Clear existing test data
    await db.delete_many({"email": {"$in": [user["email"] for user in test_users]}})
    
    # Insert test data
    result = await db.insert_many(test_users)
    print(f"Inserted {len(result.inserted_ids)} test users")
    
    # Verify insertion
    for user in test_users:
        found = await db.find_one({"email": user["email"]})
        if found:
            print(f"✓ Test user {user['email']} created successfully")
        else:
            print(f"✗ Failed to create test user {user['email']}")

if __name__ == "__main__":
    asyncio.run(setup_test_data())
