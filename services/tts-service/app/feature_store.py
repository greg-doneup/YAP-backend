"""
Feature Store for TTS service using Redis.
"""
import json
import logging
from app.config import Config
try:
    import redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False

logger = logging.getLogger(__name__)

class FeatureStore:
    """Redis-based feature store."""
    def __init__(self):
        if not REDIS_AVAILABLE:
            logger.error("Redis library not available, feature store disabled")
            self.client = None
        else:
            self.client = redis.Redis(host=Config.REDIS_HOST, port=Config.REDIS_PORT)

    def get_features(self, key: str):
        """Retrieve features by key."""
        if not self.client:
            return None
        try:
            data = self.client.get(key)
            if data:
                return json.loads(data)
        except Exception as e:
            logger.error(f"Error fetching features from store: {e}")
        return None

    def put_features(self, key: str, features: dict):
        """Store features under key."""
        if not self.client:
            return
        try:
            self.client.set(key, json.dumps(features))
        except Exception as e:
            logger.error(f"Error storing features to store: {e}")

    def put_feedback(self, user_id: str, feedback_score: float, event_timestamp: str, comment: str = None):
        """Store user feedback feature in Redis"""
        if not self.client:
            return
        key = f"feedback:{user_id}:{event_timestamp}"
        payload = {
            "user_id": user_id,
            "feedback_score": feedback_score,
            "event_timestamp": event_timestamp,
        }
        if comment:
            payload["comment"] = comment
        try:
            self.client.set(key, json.dumps(payload))
            logger.debug(f"Feedback stored under {key}")
        except Exception as e:
            logger.error(f"Error storing feedback: {e}")

    def put_quality(self, request_id: str, quality_score: float, event_timestamp: str, model_version: str):
        """Store audio quality prediction feature in Redis"""
        if not self.client:
            return
        key = f"quality:{request_id}:{event_timestamp}"
        payload = {
            "request_id": request_id,
            "quality_score": quality_score,
            "event_timestamp": event_timestamp,
            "model_version": model_version,
        }
        try:
            self.client.set(key, json.dumps(payload))
            logger.debug(f"Quality stored under {key}")
        except Exception as e:
            logger.error(f"Error storing audio quality: {e}")

    def put_device_metadata(self, request_id: str, device_type: str, os: str, browser: str, event_timestamp: str):
        """Store device metadata feature in Redis"""
        if not self.client:
            return
        key = f"device:{request_id}:{event_timestamp}"
        payload = {
            "request_id": request_id,
            "device_type": device_type,
            "os": os,
            "browser": browser,
            "event_timestamp": event_timestamp,
        }
        try:
            self.client.set(key, json.dumps(payload))
            logger.debug(f"Device metadata stored under {key}")
        except Exception as e:
            logger.error(f"Error storing device metadata: {e}")

# Singleton
_store = None

def get_feature_store() -> FeatureStore:
    global _store
    if _store is None:
        _store = FeatureStore()
    return _store
