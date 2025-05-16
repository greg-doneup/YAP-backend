"""
Storage module for pronunciation scoring results.

This module handles storing scoring results in S3 and DynamoDB.
"""

import json
import boto3
import logging
import os
from botocore.exceptions import ClientError
from typing import Dict, Any, Optional
from datetime import datetime

from app.config import Config

# Configure logging
logger = logging.getLogger(__name__)

class ScoringStorage:
    """
    Handles storage operations for pronunciation scoring results.
    """
    
    def __init__(self):
        """
        Initialize S3 and DynamoDB clients.
        """
        # Initialize S3 client
        self.s3_client = boto3.client(
            's3',
            region_name=Config.AWS_REGION,
            aws_access_key_id=os.environ.get('AWS_ACCESS_KEY_ID'),
            aws_secret_access_key=os.environ.get('AWS_SECRET_ACCESS_KEY')
        )
        
        # Initialize DynamoDB client
        self.dynamodb = boto3.resource(
            'dynamodb',
            region_name=Config.AWS_REGION,
            aws_access_key_id=os.environ.get('AWS_ACCESS_KEY_ID'),
            aws_secret_access_key=os.environ.get('AWS_SECRET_ACCESS_KEY')
        )
        
        # Get the pronunciation attempts table
        self.attempts_table = self.dynamodb.Table('PronunciationAttempts')
    
    def store_result(self, 
                     scoring_id: str, 
                     wallet_address: str, 
                     language_code: str,
                     result: Dict[str, Any]) -> bool:
        """
        Store scoring result in S3 and record metadata in DynamoDB.
        
        Args:
            scoring_id: Unique identifier for the scoring result
            wallet_address: User's wallet address
            language_code: Language code
            result: Scoring result to store
            
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            # Store detailed results in S3
            s3_key = f"scores/{wallet_address}/{scoring_id}.json"
            self.s3_client.put_object(
                Bucket=Config.S3_BUCKET_NAME,
                Key=s3_key,
                Body=json.dumps(result),
                ContentType='application/json',
                ServerSideEncryption='AES256'
            )
            
            # Record metadata in DynamoDB
            timestamp = datetime.now().isoformat()
            overall_score = result.get('overall_score', {}).get('score', 0.0)
            
            self.attempts_table.put_item(
                Item={
                    'wallet_address': wallet_address,
                    'timestamp': timestamp,
                    'scoring_id': scoring_id,
                    'language_code': language_code,
                    'overall_score': overall_score,
                    's3_path': s3_key
                }
            )
            
            logger.info(f"Stored scoring result {scoring_id} for wallet {wallet_address}")
            return True
            
        except Exception as e:
            logger.error(f"Error storing scoring result: {str(e)}")
            return False
    
    def retrieve_result(self, scoring_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve scoring result from S3.
        
        Args:
            scoring_id: Unique identifier for the scoring result
            
        Returns:
            Optional[Dict[str, Any]]: Scoring result or None if not found
        """
        try:
            # First, query DynamoDB to find the S3 path
            response = self.attempts_table.scan(
                FilterExpression='scoring_id = :sid',
                ExpressionAttributeValues={':sid': scoring_id}
            )
            
            if 'Items' not in response or not response['Items']:
                logger.warning(f"Scoring result {scoring_id} not found in DynamoDB")
                return None
            
            # Get the S3 path from the first matching item
            s3_path = response['Items'][0].get('s3_path')
            
            if not s3_path:
                logger.warning(f"S3 path not found for scoring result {scoring_id}")
                return None
            
            # Retrieve from S3
            s3_response = self.s3_client.get_object(
                Bucket=Config.S3_BUCKET_NAME,
                Key=s3_path
            )
            
            # Parse JSON
            json_data = s3_response['Body'].read().decode('utf-8')
            result = json.loads(json_data)
            
            logger.info(f"Retrieved scoring result {scoring_id}")
            return result
            
        except ClientError as e:
            if e.response['Error']['Code'] == 'NoSuchKey':
                logger.warning(f"Scoring result {scoring_id} not found in S3")
            else:
                logger.error(f"Error retrieving scoring result: {str(e)}")
            return None
        
        except Exception as e:
            logger.error(f"Error retrieving scoring result: {str(e)}")
            return None
