"""
FastAPI server for security metrics and health endpoints
"""

from fastapi import FastAPI, HTTPException, Depends
from fastapi.responses import JSONResponse
import uvicorn
import threading
import logging
from typing import Dict, Any
from app.security import get_security_metrics

logger = logging.getLogger(__name__)

app = FastAPI(
    title="Alignment Service Security API",
    description="Security metrics and monitoring endpoints",
    version="1.0.0"
)

@app.get("/security/metrics")
async def security_metrics() -> Dict[str, Any]:
    """Get security metrics"""
    try:
        metrics = get_security_metrics()
        return {
            "status": "success",
            "metrics": metrics
        }
    except Exception as e:
        logger.error(f"Error getting security metrics: {e}")
        raise HTTPException(status_code=500, detail="Failed to get security metrics")

@app.get("/health")
async def health_check() -> Dict[str, Any]:
    """Health check endpoint"""
    try:
        metrics = get_security_metrics()
        return {
            "status": "healthy",
            "service": "alignment-service",
            "security_status": "enabled",
            "uptime": metrics.get("uptime_seconds", 0)
        }
    except Exception as e:
        logger.error(f"Health check error: {e}")
        return {
            "status": "unhealthy",
            "service": "alignment-service",
            "error": str(e)
        }

def run_metrics_server(port: int = 8001):
    """Run the FastAPI metrics server in a separate thread"""
    def start_server():
        uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
    
    thread = threading.Thread(target=start_server, daemon=True)
    thread.start()
    logger.info(f"Security metrics server started on port {port}")
    return thread
