# MongoDB Atlas Configuration for YAP Backend

## 🎯 **Current Setup Analysis**

### **MongoDB Atlas Cluster**: `cy0.uvp0w.mongodb.net`
- **Cluster**: Production MongoDB Atlas cluster
- **Connection**: `mongodb+srv://yap-backend:sipwid-cemnYj-doqto2@cy0.uvp0w.mongodb.net/`
- **App Name**: `CY0`
- **Options**: `retryWrites=true&w=majority`

### **Database Architecture** (Updated to Single Database)

```
MongoDB Atlas Cluster (cy0.uvp0w.mongodb.net)
└── Database: yap
    ├── 👤 User & Profile Collections:
    │   ├── users
    │   ├── profiles  
    │   ├── user_settings
    │   └── wallet_data
    │
    ├── 🤖 AI Chat Collections:
    │   ├── chat_sessions
    │   ├── conversations
    │   ├── voice_recordings
    │   └── speech_assessments
    │
    ├── 📚 Learning Collections:
    │   ├── lessons
    │   ├── user_progress
    │   ├── assessments
    │   └── achievements
    │
    └── 💰 Token & Rewards Collections:
        ├── token_transactions
        ├── usage_events
        ├── rewards_history
        └── pricing_tiers
```

## 🔧 **Configuration Mapping**

### **From `mongodb-secrets.yaml`** (Master Configuration):
```yaml
MONGO_URI: "mongodb+srv://yap-backend:sipwid-cemnYj-doqto2@cy0.uvp0w.mongodb.net/?retryWrites=true&w=majority&appName=CY0"
MONGO_DB_NAME: "yap"
MONGO_USER: "yap-backend"  
MONGO_PASSWORD: "sipwid-cemnYj-doqto2"
```

### **From `database-cache-secrets.yaml`** (Service-Specific):
```yaml
MONGO_DB_NAME: "yap"           # Main database (all services)
AI_CHAT_DB_NAME: "yap"         # Same database, chat_* collections
LEARNING_DB_NAME: "yap"        # Same database, lesson_* collections  
PROFILE_DB_NAME: "yap"         # Same database, user_* collections
MONGODB_OPTIONS: "retryWrites=true&w=majority&appName=CY0"
```

## 🚀 **How Services Connect**

### **AI Chat Service**:
```javascript
// Connects to: mongodb+srv://yap-backend:password@cy0.uvp0w.mongodb.net/yap
const db = client.db(process.env.AI_CHAT_DB_NAME); // "yap"
const sessions = db.collection('chat_sessions');
const conversations = db.collection('conversations');
```

### **Learning Service**:
```javascript
// Connects to: mongodb+srv://yap-backend:password@cy0.uvp0w.mongodb.net/yap  
const db = client.db(process.env.LEARNING_DB_NAME); // "yap"
const lessons = db.collection('lessons');
const progress = db.collection('user_progress');
```

### **Profile Service**:
```javascript
// Connects to: mongodb+srv://yap-backend:password@cy0.uvp0w.mongodb.net/yap
const db = client.db(process.env.PROFILE_DB_NAME); // "yap"  
const users = db.collection('users');
const profiles = db.collection('profiles');
```

## ✅ **Benefits of Single Database Approach**

1. **Cost Efficient**: One database on Atlas free/shared tier
2. **Data Consistency**: Easy cross-service queries and transactions
3. **Backup Simplicity**: Single backup point for all data
4. **Collection-Level Security**: MongoDB supports collection-level permissions
5. **Easier Development**: Simpler connection management

## 🔍 **Collection Naming Convention**

To avoid conflicts, use prefixed collection names:
```
users                    # User authentication & basic info
user_profiles           # Extended profile data  
chat_sessions           # AI chat sessions
chat_conversations      # Individual conversations
learning_lessons        # Lesson content
learning_progress       # User progress tracking
token_transactions      # YAP token transactions
voice_assessments       # Pronunciation scoring data
```

## 🛡️ **Security Notes**

- **Atlas User**: `yap-backend` has read/write access to `yap` database
- **Connection Security**: TLS enabled, IP whitelist configured
- **Credentials**: Stored in Kubernetes secrets, base64 encoded
- **Network**: VPC peering or private endpoints recommended for production

## 📊 **Current Status**

✅ **Ready for Deployment**:
- MongoDB Atlas cluster is live and accessible
- Connection credentials are real and working
- Database configuration is optimized for single-database approach
- All services will use the same `yap` database with different collections

The configuration is now aligned between `mongodb-secrets.yaml` and `database-cache-secrets.yaml`!
