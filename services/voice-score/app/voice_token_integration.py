"""
Voice Service Token Integration

Integrates the YAP token system into voice-related services:
- AI speech chat time limits (15 minutes/day free)
- Pronunciation scoring costs
- TTS generation allowances
- Premium voice features
- Voice evaluation detailed analysis
"""

import logging
import asyncio
import aiohttp
import json
from typing import Dict, Any, Optional, Tuple
from datetime import datetime, timedelta
from functools import wraps

logger = logging.getLogger(__name__)

class VoiceTokenValidator:
    """Token validation for voice services"""
    
    def __init__(self, shared_service_url: str = "http://shared-services:8080"):
        self.shared_service_url = shared_service_url
        self.session = None
        
    async def _get_session(self):
        """Get or create aiohttp session"""
        if self.session is None:
            self.session = aiohttp.ClientSession()
        return self.session
        
    async def close(self):
        """Close aiohttp session"""
        if self.session:
            await self.session.close()
            
    async def validate_speech_time_allowance(self, user_id: str, requested_minutes: float) -> Dict[str, Any]:
        """
        Validate user's daily speech time allowance
        
        Args:
            user_id: User identifier
            requested_minutes: Minutes of speech processing requested
            
        Returns:
            Dict with validation result
        """
        try:
            logger.info(f"[VOICE-TOKEN] Validating speech time for user {user_id}: {requested_minutes} min")
            
            session = await self._get_session()
            
            # Call shared allowance validator
            async with session.post(f"{self.shared_service_url}/allowance/validate", json={
                "userId": user_id,
                "featureId": "ai_speech_chat",
                "quantity": requested_minutes,
                "unit": "minutes"
            }) as response:
                
                if response.status == 200:
                    data = await response.json()
                    return {
                        "canProcess": data.get("canUseAllowance", False),
                        "allowanceRemaining": data.get("allowanceRemaining", 0),
                        "requiresTokens": not data.get("canUseAllowance", False),
                        "tokenCost": data.get("tokenCost", 0),
                        "reason": data.get("reason", "Unknown")
                    }
                else:
                    # Fallback for service unavailable
                    logger.warning(f"Allowance service unavailable, using fallback validation")
                    return await self._fallback_speech_validation(user_id, requested_minutes)
                    
        except Exception as e:
            logger.error(f"Error validating speech allowance: {e}")
            return await self._fallback_speech_validation(user_id, requested_minutes)
            
    async def _fallback_speech_validation(self, user_id: str, requested_minutes: float) -> Dict[str, Any]:
        """Fallback validation when shared services are unavailable"""
        # Mock daily allowance tracking (15 minutes/day)
        daily_limit = 15.0
        # In real implementation, this would query local cache or database
        used_today = 5.0  # Mock usage
        
        remaining = max(0, daily_limit - used_today)
        
        if requested_minutes <= remaining:
            return {
                "canProcess": True,
                "allowanceRemaining": remaining - requested_minutes,
                "requiresTokens": False,
                "tokenCost": 0,
                "reason": f"Daily allowance sufficient ({remaining:.1f} min remaining)"
            }
        else:
            excess_minutes = requested_minutes - remaining
            token_cost = int(excess_minutes * 2)  # 2 tokens per minute over allowance
            return {
                "canProcess": True,  # Assume user has tokens for now
                "allowanceRemaining": 0,
                "requiresTokens": True,
                "tokenCost": token_cost,
                "reason": f"Exceeds daily allowance by {excess_minutes:.1f} min"
            }
            
    async def validate_pronunciation_analysis(self, user_id: str, analysis_type: str = "basic") -> Dict[str, Any]:
        """
        Validate pronunciation analysis request
        
        Args:
            user_id: User identifier
            analysis_type: Type of analysis (basic, detailed, premium)
            
        Returns:
            Dict with validation result
        """
        try:
            logger.info(f"[VOICE-TOKEN] Validating pronunciation analysis for user {user_id}: {analysis_type}")
            
            feature_costs = {
                "basic": 0,        # Free basic analysis
                "detailed": 3,     # 3 tokens for detailed analysis
                "premium": 8       # 8 tokens for premium analysis with coaching
            }
            
            cost = feature_costs.get(analysis_type, 3)
            
            if cost == 0:
                return {
                    "canProcess": True,
                    "tokenCost": 0,
                    "requiresPayment": False,
                    "reason": "Free basic analysis"
                }
            
            session = await self._get_session()
            
            # Validate token spending
            async with session.post(f"{self.shared_service_url}/tokens/validate-spending", json={
                "userId": user_id,
                "amount": cost,
                "featureId": f"pronunciation_{analysis_type}"
            }) as response:
                
                if response.status == 200:
                    data = await response.json()
                    return {
                        "canProcess": data.get("canSpend", False),
                        "tokenCost": cost,
                        "requiresPayment": True,
                        "currentBalance": data.get("currentBalance", 0),
                        "reason": data.get("reason", "Unknown")
                    }
                else:
                    # Fallback
                    return {
                        "canProcess": True,  # Assume sufficient tokens
                        "tokenCost": cost,
                        "requiresPayment": True,
                        "reason": "Token service unavailable, assuming sufficient balance"
                    }
                    
        except Exception as e:
            logger.error(f"Error validating pronunciation analysis: {e}")
            return {
                "canProcess": False,
                "tokenCost": 0,
                "requiresPayment": False,
                "reason": f"Validation error: {str(e)}"
            }
            
    async def validate_tts_generation(self, user_id: str, text_length: int, voice_type: str = "standard") -> Dict[str, Any]:
        """
        Validate TTS generation request
        
        Args:
            user_id: User identifier
            text_length: Length of text to synthesize
            voice_type: Type of voice (standard, premium, neural)
            
        Returns:
            Dict with validation result
        """
        try:
            logger.info(f"[VOICE-TOKEN] Validating TTS for user {user_id}: {text_length} chars, {voice_type}")
            
            # Calculate cost based on text length and voice type
            base_cost_per_100_chars = {
                "standard": 0,     # Free standard voices
                "premium": 1,      # 1 token per 100 chars for premium
                "neural": 2        # 2 tokens per 100 chars for neural
            }
            
            base_cost = base_cost_per_100_chars.get(voice_type, 1)
            total_cost = max(1, (text_length // 100) * base_cost) if base_cost > 0 else 0
            
            if total_cost == 0:
                return {
                    "canProcess": True,
                    "tokenCost": 0,
                    "requiresPayment": False,
                    "reason": "Free standard voice"
                }
            
            session = await self._get_session()
            
            # Validate token spending
            async with session.post(f"{self.shared_service_url}/tokens/validate-spending", json={
                "userId": user_id,
                "amount": total_cost,
                "featureId": f"tts_{voice_type}"
            }) as response:
                
                if response.status == 200:
                    data = await response.json()
                    return {
                        "canProcess": data.get("canSpend", False),
                        "tokenCost": total_cost,
                        "requiresPayment": True,
                        "textLength": text_length,
                        "voiceType": voice_type,
                        "reason": data.get("reason", "Unknown")
                    }
                else:
                    # Fallback
                    return {
                        "canProcess": True,  # Assume sufficient tokens
                        "tokenCost": total_cost,
                        "requiresPayment": True,
                        "reason": "Token service unavailable, assuming sufficient balance"
                    }
                    
        except Exception as e:
            logger.error(f"Error validating TTS generation: {e}")
            return {
                "canProcess": False,
                "tokenCost": 0,
                "requiresPayment": False,
                "reason": f"Validation error: {str(e)}"
            }

    async def record_voice_transaction(self, user_id: str, transaction_data: Dict[str, Any]) -> bool:
        """
        Record voice service transaction
        
        Args:
            user_id: User identifier
            transaction_data: Transaction details
            
        Returns:
            True if recorded successfully
        """
        try:
            logger.info(f"[VOICE-TOKEN] Recording transaction for user {user_id}")
            
            session = await self._get_session()
            
            # Record transaction
            async with session.post(f"{self.shared_service_url}/transactions/record", json={
                "userId": user_id,
                "service": "voice",
                "timestamp": datetime.utcnow().isoformat(),
                **transaction_data
            }) as response:
                
                return response.status == 200
                
        except Exception as e:
            logger.error(f"Error recording voice transaction: {e}")
            return False

# Decorator for token validation
def require_voice_tokens(feature_type: str):
    """
    Decorator for voice service methods that require token validation
    
    Args:
        feature_type: Type of feature (speech_chat, pronunciation, tts)
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(self, request, context):
            try:
                # Extract user ID from request metadata or request itself
                user_id = None
                
                # Try to get user ID from gRPC metadata
                metadata = context.invocation_metadata()
                for key, value in metadata:
                    if key == 'user-id':
                        user_id = value
                        break
                
                # Try to get user ID from request object
                if not user_id and hasattr(request, 'user_id'):
                    user_id = request.user_id
                
                if not user_id:
                    context.set_code(grpc.StatusCode.UNAUTHENTICATED)
                    context.set_details('User ID required for token validation')
                    return voice_pb2.VoiceResponse(
                        success=False,
                        error_message="Authentication required"
                    )
                
                # Initialize token validator if not exists
                if not hasattr(self, 'token_validator'):
                    self.token_validator = VoiceTokenValidator()
                
                # Validate based on feature type
                validation_result = None
                
                if feature_type == "speech_chat":
                    # Extract speech duration from request
                    duration_minutes = getattr(request, 'duration_minutes', 1.0)
                    validation_result = await self.token_validator.validate_speech_time_allowance(
                        user_id, duration_minutes
                    )
                elif feature_type == "pronunciation":
                    # Extract analysis type from request
                    analysis_type = getattr(request, 'analysis_type', 'basic')
                    validation_result = await self.token_validator.validate_pronunciation_analysis(
                        user_id, analysis_type
                    )
                elif feature_type == "tts":
                    # Extract text and voice type from request
                    text_length = len(getattr(request, 'text', ''))
                    voice_type = getattr(request, 'voice_type', 'standard')
                    validation_result = await self.token_validator.validate_tts_generation(
                        user_id, text_length, voice_type
                    )
                
                if not validation_result or not validation_result.get("canProcess", False):
                    context.set_code(grpc.StatusCode.PERMISSION_DENIED)
                    context.set_details(validation_result.get("reason", "Token validation failed"))
                    return voice_pb2.VoiceResponse(
                        success=False,
                        error_message=validation_result.get("reason", "Insufficient tokens"),
                        token_cost=validation_result.get("tokenCost", 0)
                    )
                
                # Store validation result for later use
                context.validation_result = validation_result
                
                # Call the original function
                result = await func(self, request, context)
                
                # Record transaction if tokens were spent
                if validation_result.get("requiresPayment", False) or validation_result.get("requiresTokens", False):
                    await self.token_validator.record_voice_transaction(user_id, {
                        "type": "spend",
                        "amount": validation_result.get("tokenCost", 0),
                        "feature": feature_type,
                        "details": {
                            "analysis_type": getattr(request, 'analysis_type', None),
                            "voice_type": getattr(request, 'voice_type', None),
                            "duration_minutes": getattr(request, 'duration_minutes', None)
                        }
                    })
                
                return result
                
            except Exception as e:
                logger.error(f"Token validation error in {func.__name__}: {e}")
                context.set_code(grpc.StatusCode.INTERNAL)
                context.set_details(f"Token validation error: {str(e)}")
                return voice_pb2.VoiceResponse(
                    success=False,
                    error_message="Token validation error"
                )
        
        return wrapper
    return decorator

# Usage examples for voice services
class VoiceServiceMixin:
    """Mixin class for voice services with token integration"""
    
    def __init__(self):
        self.token_validator = VoiceTokenValidator()
    
    async def cleanup(self):
        """Cleanup method to close token validator session"""
        if hasattr(self, 'token_validator'):
            await self.token_validator.close()
