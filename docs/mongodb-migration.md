# MongoDB Migration for YAP Pronunciation Services

This document outlines the implementation of MongoDB as a replacement for DynamoDB in the YAP pronunciation assessment services.

## Overview

As part of Phase 5 of the Pronunciation Assessment Implementation Plan, we've migrated the storage layer of multiple microservices to use MongoDB instead of DynamoDB/S3. This change leverages the existing MongoDB infrastructure already used by the learning service.

## Affected Services

1. **TTS Service**
   - Replaced DynamoDB cache with MongoDB collection
   - Replaced S3 storage with GridFS for audio files

2. **Alignment Service**
   - Replaced S3 storage with MongoDB for alignment data
   - Implemented MongoDB-based cache

3. **Pronunciation Scorer Service**
   - Replaced DynamoDB/S3 storage with MongoDB
   - Implemented MongoDB-based cache for scoring results

4. **Learning Service**
   - Already using MongoDB for pronunciation attempts storage
   - No changes needed

## Implementation Details

### MongoDB Client

Each service implements a `MongoDBClient` singleton class that:
- Manages connection pooling to the MongoDB server
- Handles connection retries and error handling
- Provides a consistent interface for accessing collections

### Cache Implementation

Each service implements a MongoDB-based cache that:
- Maintains the same interface as the existing in-memory caches
- Uses TTL indexes for automatic cache expiration
- Supports all the existing cache operations (get, put, delete, clear)

### Storage Implementation

Each service implements MongoDB storage that:
- Uses GridFS for binary data (audio files)
- Uses regular collections for structured data (alignments, scoring results)
- Maintains the same interface as the existing S3/DynamoDB storage

## Configuration

Services can be configured to use MongoDB with the following environment variables:

```
MONGODB_ENABLED=true
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/
MONGO_DB_NAME=yap
```

## Kubernetes Deployment

A new Kubernetes manifest has been created (`mongodb-services.yaml`) that:
- Configures all services to use MongoDB
- Injects MongoDB connection details from secrets
- Disables the legacy AWS services

## Benefits

1. **Reduced Complexity**: Using a single database technology across services
2. **Improved Performance**: Lower latency by using a shared MongoDB instance
3. **Cost Efficiency**: Eliminating multiple AWS services
4. **Simplified Development**: Consistent data access patterns
5. **Better Testing**: Easier to use MongoDB for local development

## Future Improvements

1. Add monitoring and metrics for MongoDB operations
2. Implement connection pooling optimizations
3. Add automated backup and restore procedures
4. Consider sharding for horizontal scaling
