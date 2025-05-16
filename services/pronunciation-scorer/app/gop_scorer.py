"""
GOP (Goodness of Pronunciation) scoring module.

This module implements the GOP algorithm for scoring pronunciation quality
at the phoneme level.
"""

import os
import logging
import numpy as np
from typing import Dict, List, Tuple, Any, Optional
import uuid

# Configure logging
logger = logging.getLogger(__name__)

class GOPScorer:
    """
    Implementation of Goodness of Pronunciation (GOP) algorithm for pronunciation scoring.
    
    GOP is defined as the posterior probability ratio between the forced-aligned
    phone and the most likely phone, normalized by the phone duration.
    """
    
    def __init__(self, language_code: str, lexicon_dir: str = '/app/lexicons'):
        """
        Initialize the GOP scorer.
        
        Args:
            language_code: Language code for the pronunciation model
            lexicon_dir: Directory containing phoneme lexicons
        """
        self.language_code = language_code
        self.lexicon_dir = lexicon_dir
        self.lexicon = {}
        self.acoustic_model = None
        
        # Load the phoneme lexicon for the specified language
        self._load_lexicon()
    
    def _load_lexicon(self) -> None:
        """
        Load the pronunciation lexicon for the specified language.
        """
        try:
            logger.info(f"Loading lexicon for language {self.language_code}")
            
            # Determine the lexicon file path
            lexicon_path = os.path.join(self.lexicon_dir, f"{self.language_code}.dict")
            
            # If the lexicon file doesn't exist, try a fallback
            if not os.path.exists(lexicon_path):
                logger.warning(f"Lexicon file not found at {lexicon_path}")
                lexicon_path = os.path.join(self.lexicon_dir, "en.dict")  # Fallback to English
                
                if not os.path.exists(lexicon_path):
                    logger.error("No lexicon files found, using empty lexicon")
                    return
            
            # Load the lexicon from the file
            with open(lexicon_path, 'r') as f:
                for line in f:
                    parts = line.strip().split()
                    if not parts:
                        continue
                    
                    word = parts[0].lower()
                    phonemes = parts[1:]
                    self.lexicon[word] = phonemes
            
            logger.info(f"Loaded {len(self.lexicon)} words in lexicon for {self.language_code}")
            
        except Exception as e:
            logger.error(f"Error loading lexicon: {str(e)}")
            # Create an empty lexicon
            self.lexicon = {}
    
    def _compute_gop_score(self, phoneme: str, audio_segment, alignment: Dict[str, Any]) -> float:
        """
        Compute the GOP score for a single phoneme.
        
        Args:
            phoneme: The phoneme to score
            audio_segment: The audio segment containing the phoneme
            alignment: The alignment information for the phoneme
            
        Returns:
            float: GOP score between 0 and 100
        """
        # In a real implementation, this would compute:
        # GOP(p) = |log(P(p|O) / max_q P(q|O))| / duration(p)
        # Where:
        # - p is the forced-aligned phoneme
        # - O is the observation (audio)
        # - q ranges over all possible phonemes
        
        # PLACEHOLDER: This is a simplified version that doesn't require the actual acoustic model
        # In a real implementation, we would:
        # 1. Extract features from the audio segment
        # 2. Compute the likelihood of the forced-aligned phoneme
        # 3. Compute the likelihood of all other phonemes
        # 4. Calculate the ratio and normalize by duration
        
        # For now, use the confidence from alignment and add some noise
        confidence = alignment.get('confidence', 0.8)
        
        # Add some randomness to simulate the GOP score
        random_factor = np.random.normal(0, 0.1)
        gop_score = min(max(confidence + random_factor, 0.0), 1.0)
        
        # Convert to a 0-100 scale
        return gop_score * 100.0
    
    def _detect_issues(self, phoneme: str, gop_score: float) -> Optional[str]:
        """
        Detect pronunciation issues based on GOP score.
        
        Args:
            phoneme: The phoneme
            gop_score: The GOP score (0-100)
            
        Returns:
            Optional[str]: Description of the issue or None if no issues
        """
        if gop_score < 50:
            return f"Mispronounced '{phoneme}'"
        elif gop_score < 70:
            return f"Slightly incorrect '{phoneme}'"
        return None
    
    def score_pronunciation(self, 
                            audio_data: bytes, 
                            alignments: Dict[str, Any],
                            scoring_level: str = "phoneme") -> Dict[str, Any]:
        """
        Score pronunciation quality using the GOP algorithm.
        
        Args:
            audio_data: Raw audio bytes
            alignments: Word and phoneme alignments from the alignment service
            scoring_level: Level of detail for scoring ("word", "phoneme", or "sentence")
            
        Returns:
            Dict[str, Any]: Scoring results
        """
        logger.info(f"Scoring pronunciation with GOP algorithm for language {self.language_code}")
        
        try:
            # Extract word and phoneme alignments
            word_alignments = alignments.get('word_alignments', [])
            phoneme_alignments = alignments.get('phoneme_alignments', [])
            
            # Score at phoneme level
            phoneme_scores = []
            for phoneme_align in phoneme_alignments:
                # Get the audio segment for this phoneme
                # In a real implementation, we would extract this from the audio_data
                
                # Compute GOP score for this phoneme
                score = self._compute_gop_score(
                    phoneme=phoneme_align['phoneme'],
                    audio_segment=None,  # Placeholder
                    alignment=phoneme_align
                )
                
                # Detect any pronunciation issues
                issue = self._detect_issues(phoneme_align['phoneme'], score)
                
                # Add to phoneme scores
                phoneme_scores.append({
                    'phoneme': phoneme_align['phoneme'],
                    'word': phoneme_align['word'],
                    'score': score,
                    'issue': issue if issue else "",
                    'start_time': phoneme_align['start_time'],
                    'end_time': phoneme_align['end_time']
                })
            
            # Score at word level by aggregating phoneme scores
            word_scores = []
            word_to_phonemes = {}
            
            # Group phonemes by word
            for ps in phoneme_scores:
                word = ps['word']
                if word not in word_to_phonemes:
                    word_to_phonemes[word] = []
                word_to_phonemes[word].append(ps)
            
            # Calculate word scores
            for word, phonemes in word_to_phonemes.items():
                # Get word timing from alignments
                word_timing = next((w for w in word_alignments if w['word'] == word), None)
                if not word_timing:
                    continue
                
                # Calculate average score for the word
                avg_score = sum(p['score'] for p in phonemes) / len(phonemes)
                
                # Collect issues
                issues = [p['issue'] for p in phonemes if p['issue']]
                
                word_scores.append({
                    'word': word,
                    'score': avg_score,
                    'issues': issues,
                    'start_time': word_timing['start_time'],
                    'end_time': word_timing['end_time']
                })
            
            # Calculate overall score
            if word_scores:
                overall_score = sum(w['score'] for w in word_scores) / len(word_scores)
            else:
                overall_score = 0.0
            
            # Generate feedback based on overall score
            feedback = []
            if overall_score >= 90:
                feedback.append("Excellent pronunciation!")
            elif overall_score >= 75:
                feedback.append("Good pronunciation overall.")
            elif overall_score >= 60:
                feedback.append("Fair pronunciation with some issues.")
            else:
                feedback.append("Pronunciation needs improvement.")
                
            # Add specific feedback for low-scoring phonemes
            low_scoring = [p for p in phoneme_scores if p['score'] < 60]
            if low_scoring:
                phoneme_feedback = f"Work on these sounds: {', '.join(p['phoneme'] for p in low_scoring[:3])}"
                feedback.append(phoneme_feedback)
            
            return {
                'overall_score': {
                    'score': overall_score,
                    'feedback': feedback
                },
                'word_scores': word_scores,
                'phoneme_scores': phoneme_scores,
                'scoring_id': str(uuid.uuid4())
            }
            
        except Exception as e:
            logger.error(f"Error in GOP scoring: {str(e)}")
            raise
