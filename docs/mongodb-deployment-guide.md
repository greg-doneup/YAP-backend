# MongoDB Deployment Guide for YAP Services

This guide outlines the steps needed to deploy the MongoDB-enabled versions of the YAP pronunciation services.

## Prerequisites

1. Existing MongoDB deployment or MongoDB Atlas account
2. Kubernetes cluster with access to the MongoDB instance
3. `kubectl` configured to access your cluster

## Creating MongoDB Credentials Secret

Create a Kubernetes secret with MongoDB connection information:

```bash
kubectl create secret generic mongodb-secrets \
  --from-literal=MONGO_URI="mongodb+srv://username:password@cluster.mongodb.net/" \
  --from-literal=MONGO_DB_NAME="yap"
```

For local development, you can use:
```bash
kubectl create secret generic mongodb-secrets \
  --from-literal=MONGO_URI="mongodb://localhost:27017" \
  --from-literal=MONGO_DB_NAME="yap"
```

## Deploying MongoDB-Enabled Services

Deploy the services using the MongoDB-specific Kubernetes manifest:

```bash
kubectl apply -f infra/k8s/mongodb-services.yaml
```

This manifest includes all the necessary configuration to:
- Enable MongoDB instead of DynamoDB/S3
- Connect to your MongoDB instance using the secret
- Configure appropriate resource limits for each service

## Configuring Environment Variables

Each service can be configured with the following environment variables:

| Environment Variable | Description | Default Value |
|---------------------|-------------|---------------|
| MONGODB_ENABLED | Flag to enable MongoDB storage | False |
| MONGO_URI | MongoDB connection URI | mongodb://localhost:27017 |
| MONGO_DB_NAME | MongoDB database name | yap |

## Verification

To verify that services are using MongoDB correctly:

1. Check service logs for MongoDB connection success:
   ```bash
   kubectl logs deployment/tts-service
   kubectl logs deployment/alignment-service
   kubectl logs deployment/pronunciation-scorer
   ```

2. Verify data is being stored in MongoDB:
   ```bash
   # Using MongoDB shell
   mongo <MONGO_URI>
   use yap
   db.getCollectionNames()  # Should show collections like tts_cache, alignments, etc.
   ```

## Monitoring

Monitor MongoDB performance using the MongoDB Atlas dashboard or a tool like MongoDB Compass.

Key metrics to monitor:
- Connection count
- Query performance
- Disk usage
- Index usage

## Troubleshooting

Common issues and solutions:

1. **Connection failures**: 
   - Verify network connectivity between K8s pods and MongoDB
   - Check if MongoDB credentials are correct
   - Ensure IP allowlisting if using MongoDB Atlas

2. **Performance issues**:
   - Check if indexes are properly configured
   - Verify that TTL indexes are working for cache collections
   - Monitor connection pooling efficiency

3. **Storage issues**:
   - Check GridFS chunk size configuration
   - Monitor disk space usage
   - Set up alerts for approaching storage limits
