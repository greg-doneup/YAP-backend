"""
HTTP API for submitting user feedback events and security metrics (Flask)
"""
from flask import Flask, request, jsonify
import os
import json
import logging
import datetime
from kafka import KafkaProducer
from app.config import Config
from app.security import TTSSecurityMiddleware

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Initialize security middleware for metrics
security_middleware = TTSSecurityMiddleware()

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

@app.route('/security/metrics', methods=['GET'])
def security_metrics():
    """Get security metrics for the TTS service"""
    try:
        # Check for admin access token (simple security for metrics endpoint)
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({'error': 'Unauthorized access to security metrics'}), 401
            
        # Get security metrics from middleware
        metrics = security_middleware.get_security_metrics()
        
        return jsonify({
            'success': True,
            'service': 'tts-service',
            'timestamp': datetime.datetime.utcnow().isoformat(),
            'metrics': metrics
        }), 200
        
    except Exception as e:
        logger.error(f"Error retrieving security metrics: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint with security status"""
    try:
        # Get basic security status
        security_status = security_middleware.get_security_status()
        
        return jsonify({
            'success': True,
            'service': 'tts-service-api',
            'status': 'healthy',
            'security': security_status,
            'timestamp': datetime.datetime.utcnow().isoformat()
        }), 200
        
    except Exception as e:
        logger.error(f"Error in health check: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('FEEDBACK_API_PORT', 5001)))
