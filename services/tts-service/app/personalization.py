"""
Personalization engine for TTS service.
"""
import os
import logging
from typing import Tuple, Optional, Dict
from app.config import Config

logger = logging.getLogger(__name__)

class PersonalizationEngine:
    """
    Engine to apply personalization to TTS requests.
    """
    def __init__(self):
        self.use_personalization = Config.USE_PERSONALIZATION
        self.model_base_path = Config.PERSONALIZATION_MODEL_PATH
        if self.use_personalization:
            logger.info(f"Personalization enabled, model path: {self.model_base_path}")
        else:
            logger.info("Personalization disabled")

    def apply(self,
              text: str,
              language_code: str,
              voice_id: Optional[str],
              use_neural: bool,
              ssml: Optional[str],
              user_id: Optional[str],
              voice_style: Optional[str],
              user_params: Optional[Dict[str, str]]) -> Tuple[str, Optional[str], Optional[str]]:
        """
        Apply personalization to the input parameters.
        Returns updated (text, voice_id, ssml).
        """
        # If disabled or no user, return original
        if not self.use_personalization or not user_id:
            return text, voice_id, ssml

        # Example: override voice model if user-specific model exists
        user_model_path = os.path.join(self.model_base_path, user_id)
        if os.path.isdir(user_model_path):
            logger.info(f"Using user-specific voice model for {user_id}")
            # Indicate to provider to load model from this path
            voice_id = f"personalized_{user_id}"

        # Example: wrap text in simple SSML for style
        if voice_style:
            logger.info(f"Applying style '{voice_style}' for user {user_id}")
            # Simple prosody adjustment based on style
            rate = {
                'cheerful': '1.2',
                'calm': '0.9',
                'energetic': '1.5'
            }.get(voice_style, '1.0')
            ssml_text = f"<speak><prosody rate='{rate}'>{text}</prosody></speak>"
            return text, voice_id, ssml_text

        return text, voice_id, ssml

# Singleton
_engine = None

def get_personalization_engine() -> PersonalizationEngine:
    global _engine
    if _engine is None:
        _engine = PersonalizationEngine()
    return _engine
