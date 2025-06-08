# YAP Wallet Service

A FastAPI-based microservice implementing two-layer security for crypto wallet recovery and management in the YAP ecosystem.

## Architecture

### Two-Layer Security Model

The service implements a sophisticated two-layer security architecture:

**Layer 1: Server-side Authentication**
- PBKDF2 key derivation with 390,000 iterations
- SHA256 hash verification
- Salt pattern: `'x0xmbtbles0x' + passphrase`
- Server stores hashes only, never has access to wallet data

**Layer 2: Client-side End-to-End Encryption**
- AES-GCM encryption of wallet data
- Client-side decryption using same passphrase
- Server returns encrypted data for client decryption

## Endpoints

### Core Wallet Operations

- `GET /health` - Service health check
- `GET /wallet/email/{email}` - Get user profile by email
- `POST /wallet/secure-account` - First-time secure account setup
- `POST /wallet/recover` - Authenticate and return encrypted wallet data
- `POST /wallet/register` - Register wallet for existing user

## Quick Start

### Development Setup

```bash
# Setup the service
./deploy-wallet-service.sh --setup

# Start in development mode
./deploy-wallet-service.sh --mode development
```

### Testing

```bash
# Run basic tests
./deploy-wallet-service.sh --test

# Or run tests manually
python test-wallet-service.py
```

### Production Deployment

```bash
# Set required environment variables
export MONGO_URI="mongodb://your-production-mongodb"
export MONGO_DB_NAME="yap"

# Deploy in production mode
./deploy-wallet-service.sh --mode production --port 8000
```

## Environment Configuration

### Development (.env.development)
```env
MONGO_URI=mongodb://localhost:27017
MONGO_DB_NAME=yap_dev
SERVICE_PORT=8000
DEBUG=true
```

### Production
```env
MONGO_URI=mongodb://production-uri
MONGO_DB_NAME=yap
SERVICE_PORT=8000
DEBUG=false
```

## Security Features

### PBKDF2 Key Derivation
- **Iterations**: 390,000 (matching pw_security.py)
- **Algorithm**: SHA256
- **Key Length**: 32 bytes
- **Salt**: `'x0xmbtbles0x' + passphrase`

### Hash-Based Authentication
- Server stores SHA256 hash of derived key
- No plaintext passphrases stored
- No server access to wallet mnemonics

### Client-Side Encryption
- AES-GCM with 96-bit nonces
- Separate salt per wallet
- Client-controlled encryption/decryption

## API Integration

### Frontend (Ionic Angular)
The service integrates with the YAP frontend via the `WalletService`:

```typescript
// First-time setup
await walletService.setupSecureAccount(email, passphrase, encryptedData);

// Wallet recovery
const result = await walletService.recoverWallet(email, passphrase);
```

### Mock Server Compatibility
Fully compatible with the mock server implementation for development and testing.

## Database Schema

### User Profile Collection (profiles)
```json
{
  "userId": "string",
  "email": "string",
  "passphrase_hash": "string",  // SHA256 hash of PBKDF2 key
  "encrypted_wallet_data": {
    "encrypted_mnemonic": "string",
    "salt": "string",
    "nonce": "string",
    "sei_address": "string",
    "eth_address": "string"
  },
  "wlw": boolean,
  "secured_at": "ISO8601",
  "updated_at": "ISO8601"
}
```

## Error Handling

### Common Error Responses

- `404` - User not found
- `409` - Setup required or already secured
- `401` - Invalid passphrase
- `400` - Invalid input
- `500` - Server error

### Error Response Format
```json
{
  "error": "error_code",
  "message": "Human readable message",
  "setup_required": true  // For setup-required errors
}
```

## Development

### File Structure
```
wallet-service/
├── main.py                 # FastAPI application
├── crypto_utils.py         # Encryption utilities
├── wallet_utils.py         # Wallet operations
├── requirements.txt        # Python dependencies
├── Dockerfile             # Container configuration
├── .env.development       # Development environment
├── deploy-wallet-service.sh # Deployment script
├── test-wallet-service.py  # Test suite
└── README.md              # This file
```

### Dependencies
- FastAPI - Web framework
- Motor - Async MongoDB driver
- Cryptography - PBKDF2 and crypto operations
- Pydantic - Data validation
- Uvicorn - ASGI server

## Monitoring

### Health Check
```bash
curl http://localhost:8000/health
```

### API Documentation
Auto-generated docs available at:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## Contributing

1. Follow the two-layer security architecture
2. Maintain compatibility with frontend `WalletService`
3. Add tests for new endpoints
4. Update this README for any API changes

## Security Notes

⚠️ **Important Security Considerations**:

1. **Never store plaintext passphrases** - Always use PBKDF2 + SHA256 hash
2. **Client-side encryption only** - Server never decrypts wallet data
3. **Use production MongoDB** - Development URIs are not secure
4. **Environment variables** - Never commit secrets to version control
5. **HTTPS in production** - Always use TLS for API communication
