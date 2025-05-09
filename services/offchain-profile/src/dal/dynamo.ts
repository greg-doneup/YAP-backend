import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

// Initialize DynamoDB client
const client = new DynamoDBClient({ 
  region: process.env.AWS_REGION || 'us-west-2',
  // For local development with DynamoDB Local
  ...(process.env.DYNAMO_ENDPOINT && { 
    endpoint: process.env.DYNAMO_ENDPOINT,
    credentials: { accessKeyId: 'local', secretAccessKey: 'local' }
  })
});

// Create DocumentClient for easier interaction
export const ddb = DynamoDBDocumentClient.from(client);

// DynamoDB table name for profiles
export const TABLE = process.env.PROFILES_TABLE || 'profiles';

// Export types
export { QueryCommand };

// Define Profile interface
export interface Profile {
  userId: string;
  walletAddress: string;
  ethWalletAddress?: string;
  xp: number;
  streak: number;
  createdAt: string;
  updatedAt: string;
}
