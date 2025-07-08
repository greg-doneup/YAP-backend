# YAP Backend - Advanced Language Learning Platform

![YAP Technologies](https://img.shields.io/badge/YAP-Technologies-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-43853D?logo=node.js&logoColor=white)
![Kubernetes](https://img.shields.io/badge/Kubernetes-326CE5?logo=kubernetes&logoColor=white)
![AWS](https://img.shields.io/badge/AWS-232F3E?logo=amazon-aws&logoColor=white)

YAP (Yet Another Polyglot) is a next-generation language learning platform that combines AI-powered pronunciation assessment, blockchain-based progress tracking, and scientifically-proven spaced repetition algorithms to deliver personalized language learning experiences.

## 🎯 Project Overview

YAP Backend is a comprehensive microservices architecture that powers an intelligent Spanish language learning application. The platform leverages cutting-edge technologies including:

- **CEFR-Aligned Curriculum**: 640 structured lessons covering Spanish A1-A2 levels
- **Advanced AI Assessment**: Real-time pronunciation scoring and feedback
- **Spaced Repetition**: SM-2 algorithm for optimal vocabulary retention
- **Blockchain Integration**: Secure progress tracking and tokenized rewards
- **Zero-Knowledge Security**: Client-side encryption with no passphrase exposure
- **Adaptive Learning**: Performance-based difficulty adjustment

## 🏗️ Architecture

The YAP Backend follows a distributed microservices architecture deployed on AWS EKS (Kubernetes), designed for scalability, reliability, and maintainability.

### Core Technologies

- **Runtime**: Node.js + TypeScript
- **Orchestration**: Kubernetes (EKS)
- **Databases**: MongoDB Atlas, Redis
- **AI/ML**: Python-based microservices for speech processing
- **Blockchain**: Ethereum-compatible smart contracts
- **Infrastructure**: AWS (ECR, EKS, ALB, Route53)
- **Monitoring**: Prometheus, Grafana, OpenTelemetry

## 📁 Directory Structure

### `/services/` - Microservices
The heart of the YAP platform, containing all microservices that power the learning experience:

#### **Core Learning Services**
- **`learning-service/`** - Central learning engine with CEFR lessons and spaced repetition
- **`auth/`** - Secure authentication with zero-knowledge wallet integration
- **`content-service/`** - Content management and lesson data
- **`assessment-service/`** - Learning progress assessment and analytics

#### **AI & Speech Processing Services**
- **`pronunciation-scorer/`** - Real-time pronunciation assessment using deep learning
- **`voice-score/`** - Advanced phoneme-level speech analysis
- **`tts-service/`** - Text-to-speech for audio reference generation
- **`ai-service/`** - General AI capabilities and language processing

#### **User & Profile Services**
- **`profile-service/`** - User profile management and preferences
- **`profile/`** - Legacy profile service (being migrated)
- **`offchain-profile/`** - Off-chain profile data management

#### **Blockchain & Rewards**
- **`wallet-service/`** - Secure wallet operations and blockchain interaction
- **`reward-service/`** - Tokenized reward system and achievements
- **`blockchain-progress-service/`** - Immutable progress tracking on blockchain

#### **Infrastructure Services**
- **`gateway-service/`** - API gateway and request routing
- **`notification-service/`** - Push notifications and messaging
- **`grammar-service/`** - Grammar checking and correction
- **`observability-service/`** - Monitoring, logging, and telemetry
- **`alignment-service/`** - Service mesh alignment and coordination

#### **Shared Components**
- **`shared/`** - Common utilities, types, and middleware used across services

### `/infra/` - Infrastructure as Code
Complete infrastructure definition and deployment automation:

- **`k8s/`** - Kubernetes manifests for service deployment
  - Service definitions, deployments, ingress configurations
  - ConfigMaps, secrets, and persistent volume claims
  - Auto-scaling and health check configurations

- **`terraform/`** - AWS infrastructure provisioning
  - EKS cluster configuration
  - VPC, subnets, and security groups
  - ECR repositories and IAM roles

- **`cdk/`** - AWS CDK (Cloud Development Kit) stacks
  - Higher-level infrastructure abstractions
  - Automated deployment pipelines

- **`pre/`** - Pre-deployment scripts and configurations
  - Environment setup and validation
  - Database initialization scripts

### `/evm_contracts/` - Blockchain Smart Contracts
Ethereum-compatible smart contracts for the YAP token ecosystem:

- **`contracts/`** - Solidity smart contracts
  - YAP token implementation (ERC-20)
  - Progress tracking contracts
  - Reward distribution mechanisms

- **`scripts/`** - Deployment and interaction scripts
- **`artifacts/`** - Compiled contract artifacts
- **`deployments/`** - Network-specific deployment records
- **`typechain-types/`** - TypeScript type definitions for contracts

### `/docs/` - Technical Documentation
Comprehensive documentation for developers and operators:

- **`mongodb-deployment-guide.md`** - Database setup and migration
- **`pronunciation-assessment-api.md`** - AI assessment service documentation
- **`dns-configuration-guide.md`** - Network and routing setup
- **`phase5-completion-report.md`** - Development milestone reports
- **`pronunciation-integration-summary.md`** - AI integration details

### **Root Configuration Files**
- **`skaffold.yaml`** - Development workflow automation
- **`YAP-BACKEND_FRONTEND_INTEGRATION_GUIDE.md`** - Frontend integration guide
- **`LICENSE`** - Project licensing terms
- **`.gitignore`** - Version control exclusions

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ and npm
- **Docker** and Docker Compose
- **kubectl** and AWS CLI configured
- **MongoDB Atlas** account
- **AWS Account** with EKS access

### Development Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/YAP-Technologies-Inc/YAP-backend.git
   cd YAP-backend
   ```

2. **Install dependencies:**
   ```bash
   # Install shared dependencies
   cd services/shared && npm install
   
   # Install service-specific dependencies
   cd ../learning-service && npm install
   cd ../auth && npm install
   # ... repeat for other services
   ```

3. **Configure environment:**
   ```bash
   cp .env.local.example .env.local
   # Edit .env.local with your configuration
   ```

4. **Start development environment:**
   ```bash
   # Using Skaffold for local development
   skaffold dev
   
   # Or start individual services
   cd services/learning-service && npm run dev
   ```

### Production Deployment

1. **Deploy to AWS EKS:**
   ```bash
   # Deploy infrastructure
   cd infra/terraform && terraform apply
   
   # Deploy services
   kubectl apply -f infra/k8s/
   ```

2. **Verify deployment:**
   ```bash
   kubectl get pods -n default
   kubectl get services -n default
   ```

## 🔧 Core Features

### 🎓 CEFR-Aligned Learning System
- **640 Structured Lessons**: Complete Spanish A1-A2 curriculum
- **Progressive Difficulty**: Adaptive content based on user performance
- **Skill Tracking**: Vocabulary, grammar, speaking, and cultural components
- **Milestone Achievements**: Celebration of learning progress

### 🧠 Spaced Repetition Engine
- **SM-2 Algorithm**: Scientifically-proven memory optimization
- **Adaptive Scheduling**: Personalized review intervals
- **Difficulty Tracking**: Automatic identification of challenging content
- **Performance Analytics**: Detailed retention metrics

### 🗣️ AI-Powered Pronunciation Assessment
- **Real-time Scoring**: Instant feedback on pronunciation accuracy
- **Phoneme Analysis**: Detailed breakdown of speech patterns
- **Progress Tracking**: Long-term pronunciation improvement monitoring
- **Native Audio References**: High-quality TTS for comparison

### 🔒 Zero-Knowledge Security
- **Client-side Encryption**: All sensitive data encrypted before transmission
- **Secure Wallet Integration**: Blockchain authentication without key exposure
- **PBKDF2 Key Derivation**: 390,000 iterations for maximum security
- **No Passphrase Storage**: Server never sees raw passphrases

### 🏆 Blockchain-Powered Rewards
- **YAP Token System**: ERC-20 compatible reward tokens
- **Immutable Progress**: Blockchain-verified learning achievements
- **Smart Contracts**: Automated reward distribution
- **Transparent Economics**: Open and fair token allocation

## 📊 Production Status

### ✅ Successfully Deployed Services (17/21)

**Core Learning Infrastructure:**
- **learning-service** (2/2 pods) - CEFR + Spaced Repetition Ready
- **auth-service** (1/1 pod) - Secure Authentication
- **assessment-service** (2/2 pods) - Learning Assessment
- **content-service** (2/2 pods) - Content Management

**AI & Speech Processing:**
- **pronunciation-scorer** (2/2 pods) - Speech Evaluation
- **voice-score** (2/2 pods) - Advanced Voice Analysis
- **tts-service** (2/2 pods) - Text-to-Speech
- **ai-service** (1/1 pod) - AI Processing

**Supporting Services:**
- **blockchain-progress-service** (2/2 pods) - Progress Tracking
- **notification-service** (2/2 pods) - User Notifications
- **redis** (1/1 pod) - Caching & Sessions

### 🔄 In Progress (4/21)
- **gateway-service** - API Gateway (image deployment pending)
- **wallet-service** - Blockchain Wallet Integration
- **profile-service** - User Profile Management
- **reward-service** - Token Rewards System

## 🛠️ Development

### Running Tests
```bash
# Run all service tests
npm run test:all

# Run specific service tests
cd services/learning-service && npm test

# Run integration tests
npm run test:integration
```

### Code Quality
```bash
# TypeScript compilation
npm run build

# Linting
npm run lint

# Code formatting
npm run format
```

### Database Operations
```bash
# MongoDB migrations
cd services/learning-service && npm run db:migrate

# Seed development data
npm run db:seed
```

## 🔗 API Documentation

The YAP Backend exposes RESTful APIs for all learning functionality. Key endpoints include:

### Authentication
- `POST /auth/secure-signup` - Create account with encrypted wallet
- `POST /auth/wallet/auth` - Authenticate with wallet credentials

### Learning System
- `GET /learning/api/cefr/lessons/{lessonNumber}` - Get CEFR lesson (1-640)
- `POST /learning/api/cefr/lessons/{lessonNumber}/complete` - Complete lesson
- `GET /learning/api/spaced-repetition/daily-queue` - Get review queue

### Assessment
- `POST /voice-score/evaluate-detailed` - Pronunciation assessment
- `GET /assessment/progress/{userId}` - Learning analytics

For complete API documentation, see [YAP-BACKEND_FRONTEND_INTEGRATION_GUIDE.md](./YAP-BACKEND_FRONTEND_INTEGRATION_GUIDE.md).

## 🤝 Contributing

We welcome contributions to the YAP Backend! Please follow these guidelines:

1. **Fork the repository** and create a feature branch
2. **Follow TypeScript best practices** and maintain test coverage
3. **Update documentation** for any API changes
4. **Test thoroughly** including integration tests
5. **Submit a pull request** with detailed description

### Development Workflow
```bash
# Create feature branch
git checkout -b feature/new-learning-algorithm

# Make changes and test
npm run test
npm run lint

# Commit with conventional commits
git commit -m "feat(learning): add adaptive difficulty algorithm"

# Push and create PR
git push origin feature/new-learning-algorithm
```

## 📈 Monitoring & Observability

### Health Checks
All services expose health check endpoints:
- `GET /health` - Basic health status
- `GET /healthz` - Kubernetes health check
- `GET /metrics` - Prometheus metrics

### Logging
Structured logging with correlation IDs:
```bash
# View service logs
kubectl logs -f deployment/learning-service

# View aggregated logs
kubectl logs -l app=yap-backend
```

### Metrics
Key metrics tracked:
- **Learning Engagement**: Lesson completion rates, session duration
- **AI Performance**: Pronunciation accuracy, assessment latency
- **System Health**: Service uptime, response times, error rates
- **User Analytics**: Progress tracking, retention metrics

## 🔐 Security

### Security Measures
- **Zero-Knowledge Architecture**: No sensitive data stored on servers
- **End-to-End Encryption**: All user data encrypted client-side
- **Secure Communication**: TLS 1.3 for all API communications
- **Input Validation**: Comprehensive request sanitization
- **Rate Limiting**: Protection against abuse and DoS attacks

### Security Auditing
```bash
# Security vulnerability scanning
npm audit

# Dependency security check
npm run security:check

# Container security scanning
docker scout cves
```

## 📄 License

YAP Backend is licensed under the [MIT License](./LICENSE). See the LICENSE file for details.

## 🙋‍♂️ Support

### Documentation
- **[Integration Guide](./YAP-BACKEND_FRONTEND_INTEGRATION_GUIDE.md)** - Frontend development guide
- **[Infrastructure Docs](./docs/)** - Deployment and operations
- **[Smart Contracts](./evm_contracts/YAP_Token_Overview_for_Stakeholders.md)** - Blockchain integration

### Getting Help
- **Issues**: Report bugs and feature requests via GitHub Issues
- **Discussions**: Join community discussions in GitHub Discussions
- **Documentation**: Check the `/docs` directory for detailed guides

### Contact
- **Email**: support@yap-technologies.com
- **Website**: https://yap-technologies.com
- **GitHub**: https://github.com/YAP-Technologies-Inc

---

## 🎯 Vision

YAP represents the future of language learning - combining the power of artificial intelligence, blockchain technology, and cognitive science to create the most effective and engaging language learning experience possible. Our backend architecture is designed to scale globally while maintaining the highest standards of security, performance, and user experience.

**Learn Spanish. Learn Smart. Learn with YAP.** 🚀

---

*Last Updated: July 8, 2025*
*Backend Version: 2.1.0*
*Services: 21 microservices*
*CEFR Lessons: 640 (A1-A2 Complete)*
