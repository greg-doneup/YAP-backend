"""
Scoring provider adapter module.

This module provides an adapter interface for different scoring backends,
allowing for easy switching between GOP and Azure scoring.
"""

import os
import logging
from typing import Dict, Any, List, Optional

from app.config import Config
from app.gop_scorer import GOPScorer
from app.azure_scorer import AzureScorer

# Configure logging
logger = logging.getLogger(__name__)

class ScoringProvider:
    """
    Adapter for pronunciation scoring providers.
    Supports multiple backends: GOP and Azure.
    """
    
    def __init__(self, language_code: str):
        """
        Initialize the scoring provider.
        
        Args:
            language_code: Language code for pronunciation assessment
        """
        self.language_code = language_code
        
        # Initialize available scoring backends
        self.gop_scorer = None
        if Config.USE_GOP:
            logger.info(f"Initializing GOP scorer for {language_code}")
            self.gop_scorer = GOPScorer(
                language_code=language_code,
                lexicon_dir=Config.PHONEME_LEXICON_DIR
            )
        
        self.azure_scorer = None
        if Config.USE_AZURE_FALLBACK:
            logger.info(f"Initializing Azure scorer for {language_code}")
            self.azure_scorer = AzureScorer(
                language_code=language_code,
                azure_key=Config.AZURE_SPEECH_KEY,
                azure_region=Config.AZURE_SERVICE_REGION
            )
    
    def score_pronunciation(self, 
                            audio_data: bytes,
                            text: str,
                            alignments: Dict[str, Any],
                            scoring_level: str = "phoneme") -> Dict[str, Any]:
        """
        Score pronunciation using the configured providers.
        
        Args:
            audio_data: Raw audio bytes
            text: Reference text
            alignments: Word and phoneme alignments from the alignment service
            scoring_level: Level of detail for scoring
            
        Returns:
            Dict[str, Any]: Scoring results
        """
        errors = []
        
        # Try the primary scoring method (GOP)
        if self.gop_scorer:
            try:
                logger.info(f"Attempting to score with GOP for {self.language_code}")
                return self.gop_scorer.score_pronunciation(
                    audio_data=audio_data,
                    alignments=alignments,
                    scoring_level=scoring_level
                )
            except Exception as e:
                error_msg = f"GOP scoring failed: {str(e)}"
                logger.error(error_msg)
                errors.append(error_msg)
        
        # If GOP fails or isn't available, try Azure
        if self.azure_scorer:
            try:
                logger.info(f"Attempting to score with Azure for {self.language_code}")
                return self.azure_scorer.score_pronunciation(
                    audio_data=audio_data,
                    text=text,
                    alignments=alignments,
                    scoring_level=scoring_level
                )
            except Exception as e:
                error_msg = f"Azure scoring failed: {str(e)}"
                logger.error(error_msg)
                errors.append(error_msg)
        
        # If both fail, raise an exception with all error messages
        raise RuntimeError(f"All scoring methods failed: {'; '.join(errors)}")
    
    @staticmethod
    def get_provider(language_code: str) -> 'ScoringProvider':
        """
        Factory method to get a scoring provider for a specific language.
        
        Args:
            language_code: Language code
            
        Returns:
            ScoringProvider: A scoring provider instance
        """
        return ScoringProvider(language_code)
