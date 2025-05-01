import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const REGION = process.env.AWS_REGION || "us-east-1";
export const TABLE = process.env.DDB_TABLE!;

export const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: REGION })
);
