"""
Example integration of Voice Token middleware into Voice Score Service

This shows how to modify the existing VoiceScoreServicer class to include
token validation for voice features.
"""

import grpc
import logging
from proto import voice_pb2, voice_pb2_grpc
from app.voice_token_integration import VoiceServiceMixin, require_voice_tokens

logger = logging.getLogger(__name__)

class EnhancedVoiceScoreServicer(voice_pb2_grpc.VoiceScoreServicer, VoiceServiceMixin):
    """Enhanced Voice Score Servicer with token integration"""
    
    def __init__(self):
        # Initialize existing voice score functionality
        super().__init__()
        # Initialize token integration
        VoiceServiceMixin.__init__(self)
        
        logger.info("Enhanced Voice Score Service initialized with token integration")
    
    @require_voice_tokens("pronunciation")
    async def EvaluateDetailed(self, request, context):
        """
        Enhanced pronunciation evaluation with token validation
        
        This method now includes:
        - Token validation for detailed analysis
        - Automatic transaction recording
        - Allowance checking
        """
        try:
            # Get validation result from decorator
            validation = getattr(context, 'validation_result', {})
            
            logger.info(f"Processing detailed evaluation - Cost: {validation.get('tokenCost', 0)} tokens")
            
            # Call existing evaluation logic
            result = await self._perform_detailed_evaluation(request)
            
            # Enhance result with token information
            enhanced_result = voice_pb2.DetailedEvaluationResponse(
                overall_score=result.overall_score,
                word_scores=result.word_scores,
                phoneme_scores=result.phoneme_scores,
                recommendations=result.recommendations,
                # Add token information
                token_cost=validation.get('tokenCost', 0),
                analysis_type=request.analysis_type if hasattr(request, 'analysis_type') else 'detailed',
                success=True
            )
            
            logger.info(f"Detailed evaluation completed successfully")
            return enhanced_result
            
        except Exception as e:
            logger.error(f"Error in detailed evaluation: {e}")
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(f"Evaluation failed: {str(e)}")
            return voice_pb2.DetailedEvaluationResponse(
                success=False,
                error_message=str(e)
            )
    
    @require_voice_tokens("speech_chat")
    async def EvaluateSpeechChat(self, request, context):
        """
        Evaluate speech for AI chat with time-based token validation
        
        This method includes:
        - Daily speech time allowance validation (15 min/day free)
        - Token cost for excess usage
        - Speech quality evaluation
        """
        try:
            validation = getattr(context, 'validation_result', {})
            
            logger.info(f"Processing speech chat evaluation - Duration: {getattr(request, 'duration_minutes', 0)} min")
            
            # Call existing speech evaluation logic
            result = await self._perform_speech_chat_evaluation(request)
            
            # Calculate remaining allowance
            remaining_allowance = validation.get('allowanceRemaining', 0)
            
            enhanced_result = voice_pb2.SpeechChatResponse(
                speech_score=result.speech_score,
                clarity_score=result.clarity_score,
                pronunciation_feedback=result.pronunciation_feedback,
                # Add allowance information
                daily_allowance_remaining=remaining_allowance,
                token_cost=validation.get('tokenCost', 0),
                requires_tokens=validation.get('requiresTokens', False),
                success=True
            )
            
            logger.info(f"Speech chat evaluation completed - Remaining allowance: {remaining_allowance} min")
            return enhanced_result
            
        except Exception as e:
            logger.error(f"Error in speech chat evaluation: {e}")
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(f"Speech evaluation failed: {str(e)}")
            return voice_pb2.SpeechChatResponse(
                success=False,
                error_message=str(e)
            )
    
    async def GetUserVoiceStatus(self, request, context):
        """
        Get user's voice service status including allowances and token costs
        """
        try:
            user_id = request.user_id
            
            # Get current allowance status
            speech_status = await self.token_validator.validate_speech_time_allowance(user_id, 0)
            
            # Get pronunciation analysis status
            basic_analysis = await self.token_validator.validate_pronunciation_analysis(user_id, "basic")
            detailed_analysis = await self.token_validator.validate_pronunciation_analysis(user_id, "detailed")
            premium_analysis = await self.token_validator.validate_pronunciation_analysis(user_id, "premium")
            
            status_response = voice_pb2.VoiceStatusResponse(
                user_id=user_id,
                daily_speech_allowance_remaining=speech_status.get('allowanceRemaining', 0),
                pronunciation_costs={
                    'basic': basic_analysis.get('tokenCost', 0),
                    'detailed': detailed_analysis.get('tokenCost', 0),
                    'premium': premium_analysis.get('tokenCost', 0)
                },
                last_updated=int(datetime.utcnow().timestamp()),
                success=True
            )
            
            return status_response
            
        except Exception as e:
            logger.error(f"Error getting voice status: {e}")
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(f"Failed to get voice status: {str(e)}")
            return voice_pb2.VoiceStatusResponse(
                success=False,
                error_message=str(e)
            )
    
    # Cleanup method
    async def cleanup(self):
        """Cleanup resources"""
        await VoiceServiceMixin.cleanup(self)
    
    # Private methods (existing logic would be refactored here)
    async def _perform_detailed_evaluation(self, request):
        """Existing detailed evaluation logic"""
        # This would contain the current evaluation implementation
        pass
    
    async def _perform_speech_chat_evaluation(self, request):
        """Existing speech chat evaluation logic"""
        # This would contain the current speech evaluation implementation
        pass

# Usage example for TTS Service integration
class EnhancedTTSServicer:
    """Enhanced TTS Servicer with token integration"""
    
    def __init__(self):
        self.token_validator = VoiceTokenValidator()
        logger.info("Enhanced TTS Service initialized with token integration")
    
    @require_voice_tokens("tts")
    async def GenerateSpeech(self, request, context):
        """
        Generate speech with token validation based on text length and voice type
        """
        try:
            validation = getattr(context, 'validation_result', {})
            
            text_length = len(request.text)
            voice_type = request.voice_type
            
            logger.info(f"Generating speech - Length: {text_length} chars, Voice: {voice_type}")
            
            # Call existing TTS generation logic
            audio_data = await self._generate_speech_audio(request)
            
            result = tts_pb2.SpeechResponse(
                audio_data=audio_data,
                duration_seconds=len(audio_data) / 16000,  # Assuming 16kHz sample rate
                voice_type=voice_type,
                text_length=text_length,
                token_cost=validation.get('tokenCost', 0),
                success=True
            )
            
            logger.info(f"Speech generation completed - Cost: {validation.get('tokenCost', 0)} tokens")
            return result
            
        except Exception as e:
            logger.error(f"Error generating speech: {e}")
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(f"Speech generation failed: {str(e)}")
            return tts_pb2.SpeechResponse(
                success=False,
                error_message=str(e)
            )
    
    async def _generate_speech_audio(self, request):
        """Existing TTS generation logic"""
        # This would contain the current TTS implementation
        pass

# Integration instructions for existing services:
"""
To integrate token validation into existing voice services:

1. Add voice_token_integration.py to your service
2. Inherit from VoiceServiceMixin in your servicer class
3. Add @require_voice_tokens decorator to methods that need validation
4. Update proto files to include token cost and allowance fields
5. Update client calls to include user_id in metadata or request
6. Handle token validation responses in your clients

Example client call with user ID:
```python
metadata = [('user-id', 'user123')]
response = stub.EvaluateDetailed(request, metadata=metadata)
```

Required proto updates:
```protobuf
message DetailedEvaluationResponse {
  // ... existing fields ...
  int32 token_cost = 10;
  string analysis_type = 11;
  bool success = 12;
  string error_message = 13;
}

message SpeechChatResponse {
  // ... existing fields ...
  float daily_allowance_remaining = 10;
  int32 token_cost = 11;
  bool requires_tokens = 12;
  bool success = 13;
  string error_message = 14;
}
```
"""
