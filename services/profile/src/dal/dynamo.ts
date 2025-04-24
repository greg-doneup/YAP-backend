import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const REGION = process.env.AWS_REGION || 'us-east-1';

export const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: REGION })
);

export const TABLE = process.env.DDB_TABLE!;
