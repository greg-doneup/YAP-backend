"""
Azure Cognitive Services pronunciation assessment module.

This module serves as a fallback when the GOP algorithm is not suitable or available.
It uses Azure's Pronunciation Assessment API to score pronunciation quality.
"""

import os
import logging
import tempfile
import json
import time
from typing import Dict, List, Tuple, Any, Optional
import uuid

try:
    import azure.cognitiveservices.speech as speechsdk
    AZURE_AVAILABLE = True
except ImportError:
    AZURE_AVAILABLE = False
    logging.warning("Azure Speech SDK not available, fallback won't work")

# Configure logging
logger = logging.getLogger(__name__)

class AzureScorer:
    """
    Implementation of pronunciation assessment using Azure Cognitive Services.
    """
    
    def __init__(self, language_code: str, azure_key: str = None, azure_region: str = None):
        """
        Initialize the Azure scorer.
        
        Args:
            language_code: Language code for the pronunciation assessment
            azure_key: Azure Cognitive Services key
            azure_region: Azure region (e.g., 'eastus')
        """
        self.language_code = self._normalize_language_code(language_code)
        self.azure_key = azure_key or os.environ.get('AZURE_SPEECH_KEY')
        self.azure_region = azure_region or os.environ.get('AZURE_SERVICE_REGION', 'eastus')
        
        if not AZURE_AVAILABLE:
            logger.error("Azure Speech SDK is not installed. Cannot use Azure fallback.")
        
        if not self.azure_key:
            logger.error("Azure Speech Key is not set. Cannot use Azure fallback.")
    
    def _normalize_language_code(self, language_code: str) -> str:
        """
        Convert language code to Azure format (e.g., 'en' -> 'en-US').
        
        Args:
            language_code: Source language code
            
        Returns:
            str: Azure-formatted language code
        """
        # Map of language codes to Azure language codes
        language_map = {
            'en': 'en-US',
            'es': 'es-ES',
            'fr': 'fr-FR',
            'de': 'de-DE',
            'zh': 'zh-CN',
            'ja': 'ja-JP',
            'ko': 'ko-KR',
            'ar': 'ar-SA',
            'ru': 'ru-RU',
            'pt': 'pt-BR',
            'hi': 'hi-IN'
        }
        
        # If already in the format like 'en-US', return as is
        if '-' in language_code:
            return language_code
        
        # Otherwise, map to the Azure format
        return language_map.get(language_code, 'en-US')
    
    def score_pronunciation(self, 
                           audio_data: bytes,
                           text: str, 
                           alignments: Dict[str, Any],
                           scoring_level: str = "phoneme") -> Dict[str, Any]:
        """
        Score pronunciation quality using Azure Cognitive Services.
        
        Args:
            audio_data: Raw audio bytes
            text: Reference text
            alignments: Word and phoneme alignments from the alignment service
            scoring_level: Level of detail for scoring ("word", "phoneme", or "sentence")
            
        Returns:
            Dict[str, Any]: Scoring results
        """
        if not AZURE_AVAILABLE or not self.azure_key:
            logger.error("Azure scoring unavailable - missing SDK or credentials")
            raise RuntimeError("Azure scoring unavailable - missing SDK or credentials")
        
        logger.info(f"Scoring pronunciation with Azure for language {self.language_code}")
        
        try:
            # Save audio to a temporary file
            temp_file_path = None
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_file:
                temp_file.write(audio_data)
                temp_file_path = temp_file.name
            
            # Create speech config with Azure credentials
            speech_config = speechsdk.SpeechConfig(
                subscription=self.azure_key, 
                region=self.azure_region
            )
            
            # Set the language
            speech_config.speech_recognition_language = self.language_code
            
            # Create pronunciation assessment config
            pronunciation_config = speechsdk.PronunciationAssessmentConfig(
                reference_text=text,
                grading_system=speechsdk.PronunciationAssessmentGradingSystem.HundredMark,
                granularity=speechsdk.PronunciationAssessmentGranularity.Phoneme,
                enable_miscue=True  # To detect additions/omissions
            )
            
            # Create audio configuration
            audio_config = speechsdk.audio.AudioConfig(filename=temp_file_path)
            
            # Create speech recognizer
            speech_recognizer = speechsdk.SpeechRecognizer(
                speech_config=speech_config, 
                audio_config=audio_config
            )
            
            # Apply pronunciation assessment config
            pronunciation_config.apply_to(speech_recognizer)
            
            # Start recognition
            result_future = speech_recognizer.recognize_once_async()
            
            # Get the result
            result = result_future.get()
            
            # Check result
            if result.reason == speechsdk.ResultReason.RecognizedSpeech:
                pronunciation_result = speechsdk.PronunciationAssessmentResult(result)
                
                # Process the result
                overall_score = pronunciation_result.pronunciation_score
                
                # Determine feedback
                feedback = []
                if overall_score >= 90:
                    feedback.append("Excellent pronunciation according to Azure!")
                elif overall_score >= 75:
                    feedback.append("Good pronunciation overall according to Azure.")
                elif overall_score >= 60:
                    feedback.append("Fair pronunciation with some issues according to Azure.")
                else:
                    feedback.append("Pronunciation needs improvement according to Azure.")
                
                # Process word-level results
                word_scores = []
                phoneme_scores = []
                
                # Get the detailed assessment result
                detailed_result = json.loads(result.properties.get(speechsdk.PropertyId.SpeechServiceResponse_JsonResult))
                
                # Process word-level results
                if 'NBest' in detailed_result and detailed_result['NBest']:
                    nbest = detailed_result['NBest'][0]  # Take the best recognition result
                    
                    if 'Words' in nbest:
                        for word_result in nbest['Words']:
                            word = word_result['Word']
                            word_score = word_result.get('PronunciationAssessment', {}).get('AccuracyScore', 0)
                            
                            # Find timing from our alignments
                            word_timing = next((w for w in alignments.get('word_alignments', []) if w['word'].lower() == word.lower()), None)
                            
                            if word_timing:
                                start_time = word_timing['start_time']
                                end_time = word_timing['end_time']
                            else:
                                # Use placeholder timings if not found
                                start_time = 0.0
                                end_time = 0.0
                            
                            # Add issues based on score
                            issues = []
                            if word_score < 60:
                                issues.append(f"Mispronounced word")
                            elif word_score < 75:
                                issues.append(f"Slightly incorrect pronunciation")
                            
                            word_scores.append({
                                'word': word,
                                'score': word_score,
                                'issues': issues,
                                'start_time': start_time,
                                'end_time': end_time
                            })
                            
                            # Process phoneme-level results if available
                            if 'Phonemes' in word_result:
                                for phoneme_result in word_result['Phonemes']:
                                    phoneme = phoneme_result['Phoneme']
                                    phoneme_score = phoneme_result.get('PronunciationAssessment', {}).get('AccuracyScore', 0)
                                    
                                    # Generate issue description
                                    issue = ""
                                    if phoneme_score < 60:
                                        issue = f"Mispronounced '{phoneme}'"
                                    elif phoneme_score < 75:
                                        issue = f"Slightly incorrect '{phoneme}'"
                                    
                                    # Use approximate timing based on word
                                    phoneme_scores.append({
                                        'phoneme': phoneme,
                                        'word': word,
                                        'score': phoneme_score,
                                        'issue': issue,
                                        'start_time': start_time,  # Approximate
                                        'end_time': end_time       # Approximate
                                    })
                
                # Clean up temporary file
                if temp_file_path and os.path.exists(temp_file_path):
                    os.unlink(temp_file_path)
                
                return {
                    'overall_score': {
                        'score': overall_score,
                        'feedback': feedback
                    },
                    'word_scores': word_scores,
                    'phoneme_scores': phoneme_scores,
                    'scoring_id': str(uuid.uuid4())
                }
            
            else:
                error_message = f"Azure speech recognition failed: {result.reason}"
                logger.error(error_message)
                
                # Clean up temporary file
                if temp_file_path and os.path.exists(temp_file_path):
                    os.unlink(temp_file_path)
                    
                raise RuntimeError(error_message)
                
        except Exception as e:
            logger.error(f"Error in Azure scoring: {str(e)}")
            
            # Clean up temporary file if it exists
            if 'temp_file_path' in locals() and temp_file_path and os.path.exists(temp_file_path):
                os.unlink(temp_file_path)
                
            raise
