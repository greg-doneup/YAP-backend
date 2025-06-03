from fastapi import FastAPI, HTTPException, Request
from .schemas import EvalRequest, EvalResponse
from .grammar import evaluate
from .security import (
    GrammarSecurityHTTPMiddleware, 
    grammar_security, 
    GrammarSecurityEventType
)

app = FastAPI(
    title="Grammar Service", 
    version="2.0.0",
    description="Grammar evaluation service with comprehensive security"
)

# Add security middleware
app.add_middleware(GrammarSecurityHTTPMiddleware, security_middleware=grammar_security)

@app.post("/grammar/evaluate", response_model=EvalResponse)
async def grammar_eval(req: EvalRequest, request: Request):
    """Evaluate grammar with security validation"""
    try:
        # Validate request through security middleware
        validation_result = await grammar_security.validate_grammar_request(
            request, {"text": req.text, "lang": req.lang}
        )
        
        if not validation_result["valid"]:
            # Log security violation
            context = grammar_security.create_security_context(
                request, GrammarSecurityEventType.DATA_VALIDATION_FAILED,
                validation_result["risk_score"],
                {"errors": validation_result["errors"]}
            )
            grammar_security.store.log_security_event(context)
            
            raise HTTPException(
                status_code=400, 
                detail={
                    "error": "Validation failed",
                    "details": validation_result["errors"]
                }
            )
        
        # Sanitize input
        sanitized_text = grammar_security.sanitize_text(req.text)
        
        # Perform grammar evaluation
        corrected, score, issues = evaluate(sanitized_text, req.lang)
        
        return EvalResponse(corrected=corrected, score=score, issues=issues)
        
    except ValueError as e:
        # Log application error
        context = grammar_security.create_security_context(
            request, GrammarSecurityEventType.SUSPICIOUS_ACTIVITY, 4,
            {"error": str(e), "error_type": "ValueError"}
        )
        grammar_security.store.log_security_event(context)
        
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # Log unexpected error
        context = grammar_security.create_security_context(
            request, GrammarSecurityEventType.SUSPICIOUS_ACTIVITY, 6,
            {"error": str(e), "error_type": type(e).__name__}
        )
        grammar_security.store.log_security_event(context)
        
        raise HTTPException(status_code=500, detail="Internal server error")

@app.get("/healthz")
def health():
    """Health check endpoint"""
    return {
        "status": "ok",
        "service": "grammar-service",
        "version": "2.0.0",
        "security_features": [
            "rate_limiting",
            "content_filtering", 
            "threat_detection",
            "input_sanitization",
            "audit_logging"
        ]
    }

@app.get("/security/metrics")
async def security_metrics():
    """Get security metrics (for monitoring)"""
    try:
        metrics = await grammar_security.get_security_metrics()
        return metrics
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to fetch security metrics")
