# Yap Backend Microservices

This repository contains the Node.js microservices and Kubernetes manifests powering Yap’s backend: authentication, learning logic, and blockchain middleware.

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Directory Structure](#directory-structure)
- [Prerequisites](#prerequisites)
- [Local Setup & Development](#local-setup--development)
- [Containerization](#containerization)
- [Kubernetes Deployment](#kubernetes-deployment)
- [CI/CD](#cicd)
- [Testing](#testing)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

Yap’s backend comprises three core microservices:

1. **Auth Service** — handles Web3Auth integration, user profiles, and off-chain session management.
2. **Learning Service** — manages daily vocabulary sets, quiz logic, leaderboard, and streak computation.
3. **Blockchain Middleware** — abstracts CosmJS calls to record completions and mint $YAP on the SEI network.

The repo also includes Dockerfiles and Kubernetes manifests to deploy each service in a DigitalOcean (DOKS) or any Kubernetes cluster.

---

## Tech Stack

- **Runtime**: Node.js (≥14) with TypeScript
- **Framework**: Express.js (or NestJS) for REST/gRPC endpoints
- **Datastore**: MongoDB (off-chain data) via Mongoose
- **Blockchain SDK**: CosmJS for SEI integration
- **Containerization**: Docker
- **Orchestration**: Kubernetes manifests (YAML)
- **CI/CD**: GitHub Actions for build, test, and image push

---

## Directory Structure

```bash
.
├── services
│   ├── auth-service         # Web3Auth & user management
│   │   ├── src
│   │   └── Dockerfile
│   ├── learning-service     # Vocab, quiz, leaderboard logic
│   │   ├── src
│   │   └── Dockerfile
│   └── middleware-service   # CosmJS → smart contract calls
│       ├── src
│       └── Dockerfile
├── k8s                      # Kubernetes manifests
│   ├── auth-deployment.yaml
│   ├── learning-deployment.yaml
│   ├── middleware-deployment.yaml
│   ├── service-auth.yaml
│   ├── service-learning.yaml
│   ├── service-middleware.yaml
│   └── configmaps, secrets
├── scripts
│   └── build-images.sh      # Builds and tags Docker images
├── .github
│   └── workflows            # CI/CD pipeline definitions (to be added)
└── README.md                # This file
```  

---

## Prerequisites

- **Node.js** ≥14
- **Yarn** or **npm**
- **Docker** & **Docker Compose** (for local containers)
- **kubectl** (configured for your cluster)
- **Access** to a MongoDB instance (connection URI via env)
- **SEI RPC endpoint** & **wallet mnemonic** (for middleware)  

---

## Local Setup & Development

1. **Clone the repo**:
   ```bash
   git clone git@github.com:greg-doneup/Yap-backend.git
   cd Yap-backend
   ```
2. **Install dependencies** for each service:
   ```bash
   cd services/auth-service && yarn install
   cd ../learning-service && yarn install
   cd ../middleware-service && yarn install
   ```
3. **Environment variables**: create `.env` in each service directory:
   ```dotenv
   # Auth Service
dbUri=mongodb://...   

   # Middleware Service
echo RPC_URL=https://rpc.sei.network
SEI_CHAIN_ID=atlantic-2
MNEMONIC="your mnemonic"

   # Learning Service
dbUri=mongodb://...
   ```
4. **Run locally** (without containers):
   ```bash
   cd services/auth-service && yarn start:dev
   ```

---

## Containerization

Build all service images via the helper script:
```bash
scripts/build-images.sh
```  
This will:
- Build each Dockerfile under `services/*`
- Tag images as `greg-doneup/yap-auth:latest`, etc.

---

## Kubernetes Deployment

Apply manifests in `k8s/`:
```bash
kubectl apply -f k8s/
```  
Ensure you have:
- **Secrets** for MongoDB URIs and SEI credentials
- **ConfigMaps** for non-sensitive service config

---

## CI/CD

Workflows will run on push/PR to `main`, performing:
1. **Lint & typecheck** (TypeScript)
2. **Unit & integration tests**
3. **Docker build & push** to your registry
4. **(Optional)** `kubectl apply` to staging cluster

Place `.github/workflows/ci.yml` accordingly.

---

## Testing

- **Unit Tests**: each service has its own test suite (`yarn test`).
- **Integration Tests**: ensure cross-service calls and on-chain transactions via a local testnet or staging cluster.

---

## Contributing

1. Fork and branch: `git checkout -b feat/your-feature`
2. Commit: `git commit -m "feat: ..."`
3. Push & open PR: `git push origin feat/your-feature`
4. CI will validate and run tests.

---

## License

MIT License — see [LICENSE](LICENSE) for details.

