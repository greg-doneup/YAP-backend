"""
S3 storage integration for alignment service.

This module handles storing alignment results in S3 and retrieving them.
"""

import json
import boto3
import logging
import os
from botocore.exceptions import ClientError
from typing import Dict, Any, Optional

# Configure logging
logger = logging.getLogger(__name__)

class S3Storage:
    """
    Handles S3 operations for storing and retrieving alignment results.
    """
    
    def __init__(self):
        """
        Initialize S3 client and configure bucket name.
        """
        self.s3_client = boto3.client(
            's3',
            region_name=os.environ.get('AWS_REGION', 'us-east-1'),
            aws_access_key_id=os.environ.get('AWS_ACCESS_KEY_ID'),
            aws_secret_access_key=os.environ.get('AWS_SECRET_ACCESS_KEY')
        )
        self.bucket_name = os.environ.get('S3_BUCKET_NAME', 'yap-alignment-results')
    
    def store_alignment(self, alignment_id: str, alignment_data: Dict[str, Any]) -> bool:
        """
        Store alignment data in S3 bucket.
        
        Args:
            alignment_id: Unique identifier for the alignment
            alignment_data: Alignment data to store
            
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            # Convert to JSON
            json_data = json.dumps(alignment_data)
            
            # Store in S3
            key = f"alignments/{alignment_id}.json"
            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=key,
                Body=json_data,
                ContentType='application/json',
                ServerSideEncryption='AES256'  # Enable server-side encryption
            )
            
            logger.info(f"Stored alignment {alignment_id} in S3")
            return True
            
        except ClientError as e:
            logger.error(f"Error storing alignment in S3: {str(e)}")
            return False
    
    def retrieve_alignment(self, alignment_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve alignment data from S3 bucket.
        
        Args:
            alignment_id: Unique identifier for the alignment
            
        Returns:
            Optional[Dict[str, Any]]: Alignment data or None if not found
        """
        try:
            # Retrieve from S3
            key = f"alignments/{alignment_id}.json"
            response = self.s3_client.get_object(
                Bucket=self.bucket_name,
                Key=key
            )
            
            # Parse JSON
            json_data = response['Body'].read().decode('utf-8')
            alignment_data = json.loads(json_data)
            
            logger.info(f"Retrieved alignment {alignment_id} from S3")
            return alignment_data
            
        except ClientError as e:
            if e.response['Error']['Code'] == 'NoSuchKey':
                logger.warning(f"Alignment {alignment_id} not found in S3")
            else:
                logger.error(f"Error retrieving alignment from S3: {str(e)}")
            return None
