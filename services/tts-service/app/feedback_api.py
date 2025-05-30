"""
HTTP API for submitting user feedback events (Flask)
"""
from flask import Flask, request, jsonify
import os
import json
import logging
from kafka import KafkaProducer
from app.config import Config

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Initialize Kafka producer
try:
    producer = KafkaProducer(
        bootstrap_servers=Config.KAFKA_BOOTSTRAP_SERVERS,
        value_serializer=lambda v: json.dumps(v).encode('utf-8')
    )
    logger.info("KafkaProducer initialized for feedback API")
except Exception as e:
    logger.error(f"Failed to initialize KafkaProducer: {e}")
    producer = None

@app.route('/feedback', methods=['POST'])
def submit_feedback():
    data = request.get_json()
    required_fields = ['user_id', 'request_id', 'feedback_score']
    if not all(field in data for field in required_fields):
        return jsonify({'success': False, 'message': 'Missing required field'}), 400

    event = {
        'user_id': data['user_id'],
        'request_id': data['request_id'],
        'feedback_score': data['feedback_score'],
        'comment': data.get('comment', ''),
        'event_timestamp': data.get('event_timestamp', datetime.datetime.utcnow().isoformat())
    }
    try:
        if producer:
            producer.send(Config.KAFKA_TOPIC_FEEDBACK, value=event)
            producer.flush()
            logger.info(f"Feedback event sent: {event}")
            return jsonify({'success': True, 'message': 'Feedback submitted'}), 200
        else:
            raise Exception('Kafka producer unavailable')
    except Exception as e:
        logger.error(f"Error sending feedback event: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('FEEDBACK_API_PORT', 5001)))
