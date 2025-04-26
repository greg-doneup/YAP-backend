import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

const REGION = process.env.AWS_REGION || 'us-east-1';
const USE_LOCAL_DB = process.env.USE_LOCAL_DB === 'true';

// Create a client with the appropriate configuration
let ddbClient: DynamoDBClient;

if (USE_LOCAL_DB) {
  console.log('Using local development mode for DynamoDB');
  // For local development, we'll use a mock or local endpoint
  ddbClient = new DynamoDBClient({ 
    region: REGION,
    endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000'
  });
} else {
  // For production, use standard AWS configuration
  ddbClient = new DynamoDBClient({ region: REGION });
}

export const ddb = DynamoDBDocumentClient.from(ddbClient);

export const TABLE = process.env.DDB_TABLE || 'Profiles';

// In-memory fallback for local development without DynamoDB
const localDB = new Map<string, any>();

// Helper methods that handle local development transparently
export async function getItem(userId: string) {
  if (USE_LOCAL_DB) {
    console.log(`[LOCAL] Getting item for user: ${userId}`);
    return { Item: localDB.get(userId) };
  }
  
  return ddb.send(new GetCommand({
    TableName: TABLE,
    Key: { userId }
  }));
}

export async function putItem(item: any) {
  if (USE_LOCAL_DB) {
    console.log(`[LOCAL] Putting item for user: ${item.userId}`);
    localDB.set(item.userId, item);
    return { };
  }
  
  return ddb.send(new PutCommand({
    TableName: TABLE,
    Item: item
  }));
}

export async function updateItem(params: any) {
  if (USE_LOCAL_DB) {
    console.log(`[LOCAL] Updating item with key: ${JSON.stringify(params.Key)}`);
    const userId = params.Key.userId;
    const item = localDB.get(userId) || {};
    
    // Basic implementation of update expression
    if (params.UpdateExpression?.includes('SET')) {
      const attrMap = params.ExpressionAttributeNames || {};
      const valueMap = params.ExpressionAttributeValues || {};
      
      // Very simple parser for basic SET operations
      const setParts = params.UpdateExpression.replace('SET ', '').split(',');
      setParts.forEach((part: string) => {
        const [path, value] = part.trim().split('=');
        const resolvedPath = path.trim().replace(/#(\w+)/g, (_, name) => attrMap[`#${name}`]);
        const resolvedValue = value.trim().replace(/:(\w+)/g, (_, name) => valueMap[`:${name}`]);
        
        // Extremely simplified - only handles direct assignments
        if (resolvedPath && resolvedValue) {
          item[resolvedPath.trim()] = resolvedValue.trim();
        }
      });
    }
    
    localDB.set(userId, item);
    return { Attributes: item };
  }
  
  return ddb.send(new UpdateCommand({
    TableName: TABLE,
    ...params
  }));
}

export async function deleteItem(userId: string) {
  if (USE_LOCAL_DB) {
    console.log(`[LOCAL] Deleting item for user: ${userId}`);
    localDB.delete(userId);
    return { };
  }
  
  return ddb.send(new DeleteCommand({
    TableName: TABLE,
    Key: { userId }
  }));
}
