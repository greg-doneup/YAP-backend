# YAP AI Service

A comprehensive AI integration service for the YAP language learning platform, providing seamless integration with OpenAI GPT models, Anthropic Claude, and other AI providers.

## Features

- **Multiple AI Provider Support**: OpenAI, Anthropic Claude, and extensible architecture for additional providers
- **Token Management**: Integrated token-based system with daily limits and unlimited hour passes
- **Conversation History**: Persistent conversation tracking and management
- **Rate Limiting**: Built-in rate limiting for API protection
- **Security**: JWT authentication, CORS, helmet security headers
- **Monitoring**: Prometheus metrics and health checks
- **Containerized**: Docker and Docker Compose ready
- **TypeScript**: Full TypeScript support with comprehensive type definitions

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm 8+
- Docker and Docker Compose (optional)
- Redis (for caching)
- MongoDB (for data persistence)

### Installation

1. **Clone and navigate to the service directory:**
   ```bash
   cd services/ai-service
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your actual values
   ```

4. **Create secrets directory and add your API keys:**
   ```bash
   mkdir -p secrets
   echo "your-openai-api-key" > secrets/openai_api_key.txt
   echo "your-anthropic-api-key" > secrets/anthropic_api_key.txt
   echo "your-jwt-secret" > secrets/jwt_secret.txt
   echo "mongodb://admin:password@localhost:27017/yap_ai?authSource=admin" > secrets/mongodb_uri.txt
   echo "redis://localhost:6379/0" > secrets/redis_url.txt
   ```

### Running the Service

#### Development Mode
```bash
npm run dev
```

#### Production Mode
```bash
npm run build
npm start
```

#### Using Docker Compose
```bash
# Start all services (AI service, Redis, MongoDB, monitoring)
docker-compose up -d

# View logs
docker-compose logs -f ai-service

# Stop all services
docker-compose down
```

## API Endpoints

### Health Check
```bash
GET /health
```

### AI Chat
```bash
POST /api/ai/chat/message
Content-Type: application/json
Authorization: Bearer <jwt-token>

{
  "message": "Hello, how are you?",
  "conversationId": "optional-conversation-id",
  "modelType": "gpt-3.5"
}
```

### Purchase Unlimited Hour
```bash
POST /api/ai/chat/unlimited-hour
Content-Type: application/json
Authorization: Bearer <jwt-token>

{
  "userId": "user-id-here"
}
```

### Metrics
```bash
GET /metrics
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development` |
| `PORT` | Server port | `8080` |
| `OPENAI_API_KEY` | OpenAI API key | Required |
| `ANTHROPIC_API_KEY` | Anthropic API key | Optional |
| `MONGODB_URI` | MongoDB connection string | Required |
| `REDIS_URL` | Redis connection string | Required |
| `APP_JWT_SECRET` | JWT signing secret | Required |
| `AI_MODEL_DEFAULT` | Default AI model | `gpt-3.5-turbo` |
| `TEXT_CHAT_DAILY_LIMIT` | Daily free message limit | `25` |
| `UNLIMITED_HOUR_TOKEN_COST` | Token cost for unlimited hour | `2` |
| `AI_RATE_LIMIT_REQUESTS` | Rate limit per window | `100` |
| `AI_RATE_LIMIT_WINDOW` | Rate limit window (ms) | `3600000` |

### Secret Management

The service supports loading secrets from mounted files (recommended for production) or environment variables:

```bash
# Create secrets directory
mkdir -p secrets

# Add your secrets
echo "sk-..." > secrets/openai_api_key.txt
echo "sk-ant-..." > secrets/anthropic_api_key.txt
echo "your-jwt-secret" > secrets/jwt_secret.txt
```

## Docker Configuration

### Building the Image
```bash
docker build -t yap-ai-service:latest .
```

### Running with Docker Compose
```bash
# Start all services
docker-compose up -d

# Scale the AI service
docker-compose up --scale ai-service=3 -d

# View service logs
docker-compose logs -f ai-service
```

### Services Included

- **ai-service**: Main AI service
- **redis**: Caching and session management
- **mongodb**: Data persistence
- **nginx**: Load balancing and reverse proxy
- **prometheus**: Metrics collection
- **grafana**: Monitoring dashboards

## Token Management

The service implements a comprehensive token management system:

### Daily Limits
- **Free Users**: 25 messages per day
- **Token Holders**: Additional messages based on token balance

### Unlimited Hour Pass
- **Cost**: 2 tokens
- **Duration**: 1 hour of unlimited messages
- **Stackable**: Multiple passes can be purchased

### Token Validation Flow
1. Check daily allowance
2. Validate JWT token
3. Query user token balance
4. Process request or reject
5. Update consumption tracking

## Monitoring

### Metrics
The service exposes Prometheus metrics at `/metrics`:

- `ai_service_http_requests_total` - Total HTTP requests
- `ai_service_ai_requests_total` - Total AI model requests
- `ai_service_token_consumption_total` - Token consumption
- `ai_service_errors_total` - Error count
- `ai_service_active_conversations` - Active conversations

### Health Checks
- **Endpoint**: `/health`
- **Kubernetes**: Configured for readiness and liveness probes
- **Docker**: Health check command included

### Logging
- **Format**: JSON structured logging
- **Levels**: Error, warn, info, debug
- **Output**: Console and file (`logs/ai-service.log`)

## Security

### Authentication
- JWT token validation
- User session management
- Rate limiting per IP and user

### API Security
- CORS configuration
- Helmet security headers
- Input validation
- Request size limits

### Secret Management
- File-based secrets mounting
- Environment variable fallback
- No secrets in code or logs

## Development

### Project Structure
```
src/
├── controllers/     # Request handlers
├── middleware/      # Custom middleware
├── routes/         # API routes
├── services/       # Business logic
├── utils/          # Utility functions
└── index.ts        # Main application
```

### Scripts
```bash
npm run dev         # Development with hot reload
npm run build       # Build for production
npm start           # Start production server
npm test            # Run tests
npm run lint        # Lint code
npm run docker:build # Build Docker image
npm run docker:run   # Run with Docker Compose
```

### Testing
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Deployment

### Kubernetes
The service includes Kubernetes manifests in the `../infra/k8s/` directory:

```bash
kubectl apply -f ../infra/k8s/ai-service.yaml
```

### Docker Compose
For local development and testing:

```bash
docker-compose up -d
```

### Environment-Specific Configurations

#### Development
- Hot reload enabled
- Detailed logging
- Debug mode active

#### Production
- Optimized builds
- Error tracking
- Performance monitoring

## Troubleshooting

### Common Issues

1. **API Key Errors**
   - Verify OpenAI API key is valid
   - Check secret mounting in Docker

2. **Database Connection**
   - Ensure MongoDB is running
   - Check connection string format

3. **Rate Limiting**
   - Adjust rate limits in environment
   - Monitor metrics for usage patterns

4. **Token Validation**
   - Verify JWT secret configuration
   - Check token expiration

### Debugging
```bash
# Enable debug logging
LOG_LEVEL=debug npm run dev

# View container logs
docker-compose logs -f ai-service

# Check health status
curl http://localhost:8080/health
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

This project is licensed under the UNLICENSED license - see the package.json file for details.

## Support

For support and questions, please contact the YAP Technologies team.
