import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

export const TABLE = process.env.USAGE_TABLE!;
const REGION      = process.env.AWS_REGION || "us-east-1";

export const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: REGION })
);
