#!/usr/bin/env python3
"""
Kafka consumer to stream feedback, quality, and device metadata events
into Redis-backed feature store.
"""
import json
import logging
from kafka import KafkaConsumer
from app.config import Config
from app.feature_store import get_feature_store

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


def start_stream_loader():
    # Subscribe to all feature topics
    topics = [
        Config.KAFKA_TOPIC_FEEDBACK,
        Config.KAFKA_TOPIC_QUALITY,
        Config.KAFKA_TOPIC_DEVICE_METADATA,
    ]
    consumer = KafkaConsumer(
        *topics,
        bootstrap_servers=Config.KAFKA_BOOTSTRAP_SERVERS,
        auto_offset_reset='earliest',
        enable_auto_commit=True,
        group_id='tts-feature-loader',
        value_deserializer=lambda m: json.loads(m.decode('utf-8'))
    )
    feature_store = get_feature_store()
    logger.info(f"Stream loader subscribed to topics: {topics}")
    for msg in consumer:
        topic = msg.topic
        data = msg.value
        try:
            if topic == Config.KAFKA_TOPIC_FEEDBACK:
                feature_store.put_feedback(
                    user_id=data['user_id'],
                    feedback_score=float(data['feedback_score']),
                    event_timestamp=data['event_timestamp'],
                    comment=data.get('comment')
                )
                logger.info(f"Processed feedback event: {data}")
            elif topic == Config.KAFKA_TOPIC_QUALITY:
                feature_store.put_quality(
                    request_id=data['request_id'],
                    quality_score=float(data['quality_score']),
                    event_timestamp=data['event_timestamp'],
                    model_version=data.get('model_version', '')
                )
                logger.info(f"Processed quality event: {data}")
            elif topic == Config.KAFKA_TOPIC_DEVICE_METADATA:
                feature_store.put_device_metadata(
                    request_id=data['request_id'],
                    device_type=data.get('device_type', ''),
                    os=data.get('os', ''),
                    browser=data.get('browser', ''),
                    event_timestamp=data['event_timestamp'],
                )
                logger.info(f"Processed device metadata event: {data}")
        except Exception as e:
            logger.error(f"Error processing message from topic {topic}: {e}")


if __name__ == '__main__':
    start_stream_loader()
