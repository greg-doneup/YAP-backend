"""
ML monitoring module for TTS service.

This module provides monitoring capabilities for TTS models,
tracking metrics like success rate, latency, and quality metrics.
"""

import os
import time
import logging
from typing import Dict, Any, Optional, List
import threading
import json
from datetime import datetime

# Import monitoring libraries
try:
    import mlflow
    MLFLOW_AVAILABLE = True
except ImportError:
    MLFLOW_AVAILABLE = False

try:
    from evidently.metrics import ColumnDriftMetric
    from evidently.report import Report
    EVIDENTLY_AVAILABLE = True
except ImportError:
    EVIDENTLY_AVAILABLE = False

from prometheus_client import Counter, Histogram, Gauge

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Define Prometheus metrics
SYNTHESIS_REQUESTS = Counter(
    'tts_synthesis_requests_total', 
    'Total number of TTS requests',
    ['provider', 'language', 'status']
)

SYNTHESIS_LATENCY = Histogram(
    'tts_synthesis_latency_seconds',
    'Latency of TTS synthesis requests',
    ['provider', 'language'],
    buckets=(0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0)
)

MODEL_CACHE_HITS = Counter(
    'tts_model_cache_hits_total',
    'Number of TTS model cache hits'
)

MODEL_CACHE_MISSES = Counter(
    'tts_model_cache_misses_total',
    'Number of TTS model cache misses'
)

PROVIDER_AVAILABILITY = Gauge(
    'tts_provider_availability',
    'Availability status of TTS providers',
    ['provider']
)

# Reference values for monitoring
REFERENCE_METRICS = {
    'mean_latency': 0.8,  # seconds
    'p95_latency': 2.5,   # seconds
    'success_rate': 0.99  # 99% success
}

class MLMonitor:
    """
    Monitor TTS model performance and log metrics.
    """
    
    def __init__(self, enable_mlflow: bool = False, tracking_uri: Optional[str] = None):
        """
        Initialize the ML monitor.
        
        Args:
            enable_mlflow: Whether to enable MLflow tracking
            tracking_uri: MLflow tracking URI
        """
        self.synthesis_history = []
        self.providers_status = {}
        self.last_report_time = time.time()
        self.report_interval = 3600  # Generate reports hourly
        
        # Setup MLflow if enabled
        self.mlflow_enabled = enable_mlflow and MLFLOW_AVAILABLE
        if self.mlflow_enabled:
            if tracking_uri:
                mlflow.set_tracking_uri(tracking_uri)
            mlflow.set_experiment("tts_service_monitoring")
        
        # Start background monitoring thread
        self.should_run = True
        self.monitor_thread = threading.Thread(target=self._background_monitoring)
        self.monitor_thread.daemon = True
        self.monitor_thread.start()
    
    def log_synthesis(self, 
                     provider: str, 
                     language: str, 
                     duration_ms: float, 
                     text_length: int,
                     success: bool,
                     error_type: Optional[str] = None,
                     metadata: Optional[Dict[str, Any]] = None) -> None:
        """
        Log a synthesis request.
        
        Args:
            provider: TTS provider name
            language: Language code
            duration_ms: Synthesis duration in milliseconds
            text_length: Length of synthesized text
            success: Whether synthesis was successful
            error_type: Type of error if not successful
            metadata: Additional metadata
        """
        try:
            # Update Prometheus metrics
            status = "success" if success else "failure"
            SYNTHESIS_REQUESTS.labels(provider=provider, language=language, status=status).inc()
            
            if success:
                # Convert ms to seconds for the histogram
                SYNTHESIS_LATENCY.labels(provider=provider, language=language).observe(duration_ms / 1000)
            
            # Store event for analysis
            event = {
                "timestamp": datetime.now().isoformat(),
                "provider": provider,
                "language": language,
                "duration_ms": duration_ms,
                "text_length": text_length,
                "success": success,
                "error_type": error_type,
                "metadata": metadata or {}
            }
            self.synthesis_history.append(event)
            
            # Limit history size
            if len(self.synthesis_history) > 10000:
                self.synthesis_history = self.synthesis_history[-10000:]
            
            # If it's an error, log it specially
            if not success and error_type:
                logger.warning(f"TTS synthesis error - Provider: {provider}, Language: {language}, "
                              f"Error type: {error_type}, Details: {metadata.get('error_details', 'N/A')}")
                
                # Record error to a dedicated error log file for easier analysis
                try:
                    with open("tts_errors.log", "a") as f:
                        error_log = f"{datetime.now().isoformat()} | {provider} | {language} | " \
                                    f"{error_type} | {metadata.get('error_details', 'N/A')}\n"
                        f.write(error_log)
                except Exception as e:
                    logger.error(f"Failed to write to error log file: {str(e)}")
            
            # Log to MLflow if enabled
            if self.mlflow_enabled:
                try:
                    with mlflow.start_run(run_name=f"tts_{provider}_{language}", nested=True):
                        # Log success/failure
                        mlflow.log_metric("success", 1 if success else 0)
                        
                        if success:
                            mlflow.log_metric("duration_ms", duration_ms)
                            mlflow.log_metric("text_length", text_length)
                            mlflow.log_metric("ms_per_char", duration_ms / max(1, text_length))
                        else:
                            mlflow.log_param("error_type", error_type or "unknown")
                            
                        # Log metadata
                        if metadata:
                            for key, value in metadata.items():
                                if isinstance(value, (int, float)):
                                    mlflow.log_metric(key, value)
                                elif isinstance(value, str):
                                    mlflow.log_param(key, value)
                except Exception as mlflow_error:
                    logger.error(f"MLflow logging error: {str(mlflow_error)}")
                    
        except Exception as e:
            # Catch-all to ensure monitoring never brings down the main service
            logger.error(f"Error in ML monitoring log_synthesis: {str(e)}")
            # Try to log this monitoring error itself
            try:
                with open("ml_monitoring_errors.log", "a") as f:
                    f.write(f"{datetime.now().isoformat()} | Error in log_synthesis: {str(e)}\n")
            except:
                pass  # If this fails, we've done our best
    
    def log_cache_event(self, hit: bool, key: Optional[str] = None, context: Optional[str] = None) -> None:
        """
        Log a cache hit or miss event.
        
        Args:
            hit: Whether the cache access was a hit (True) or miss (False)
            key: Optional cache key for debugging and analysis
            context: Optional context about the cache operation (e.g., "phoneme", "speech")
        """
        try:
            if hit:
                MODEL_CACHE_HITS.inc()
                if key and logger.isEnabledFor(logging.DEBUG):
                    logger.debug(f"Cache hit for key: {key} ({context or 'unknown context'})")
            else:
                MODEL_CACHE_MISSES.inc()
                if key and logger.isEnabledFor(logging.DEBUG):
                    logger.debug(f"Cache miss for key: {key} ({context or 'unknown context'})")
                    
            # For detailed analysis, we could store cache events with timestamps
            # but we'd need to be careful about memory usage
            
        except Exception as e:
            # Catch-all to ensure monitoring never brings down the main service
            logger.error(f"Error in ML monitoring log_cache_event: {str(e)}")
            try:
                with open("ml_monitoring_errors.log", "a") as f:
                    f.write(f"{datetime.now().isoformat()} | Error in log_cache_event: {str(e)}\n")
            except:
                pass  # If this fails, we've done our best
    
    def update_provider_status(self, provider: str, available: bool) -> None:
        """Update provider availability status."""
        self.providers_status[provider] = available
        PROVIDER_AVAILABILITY.labels(provider=provider).set(1 if available else 0)
    
    def _generate_reports(self) -> None:
        """Generate monitoring reports."""
        if not self.synthesis_history:
            return
        
        # Skip if not enough time has passed
        current_time = time.time()
        if current_time - self.last_report_time < self.report_interval:
            return
        
        self.last_report_time = current_time
        
        try:
            # Calculate basic statistics
            total_requests = len(self.synthesis_history)
            successful_requests = sum(1 for event in self.synthesis_history if event["success"])
            success_rate = successful_requests / total_requests if total_requests > 0 else 0
            
            # Log summary
            logger.info(f"TTS Monitoring Report:")
            logger.info(f"  Total Requests: {total_requests}")
            logger.info(f"  Success Rate: {success_rate:.2%}")
            
            # Provider-specific metrics
            provider_stats = {}
            for event in self.synthesis_history:
                provider = event["provider"]
                if provider not in provider_stats:
                    provider_stats[provider] = {"total": 0, "success": 0, "durations": []}
                
                provider_stats[provider]["total"] += 1
                if event["success"]:
                    provider_stats[provider]["success"] += 1
                    provider_stats[provider]["durations"].append(event["duration_ms"])
            
            # Log provider stats
            for provider, stats in provider_stats.items():
                success_rate = stats["success"] / stats["total"] if stats["total"] > 0 else 0
                avg_duration = sum(stats["durations"]) / len(stats["durations"]) if stats["durations"] else 0
                
                logger.info(f"  Provider {provider}:")
                logger.info(f"    Requests: {stats['total']}")
                logger.info(f"    Success Rate: {success_rate:.2%}")
                logger.info(f"    Avg Duration: {avg_duration:.2f}ms")
                
                # Check for performance degradation
                if avg_duration > REFERENCE_METRICS['mean_latency'] * 1000 * 1.5:  # 50% higher than reference
                    logger.warning(f"Performance degradation detected for {provider}: " +
                                  f"latency {avg_duration:.2f}ms (expected < {REFERENCE_METRICS['mean_latency'] * 1000 * 1.5:.2f}ms)")
            
            # Generate drift report if Evidently is available
            if EVIDENTLY_AVAILABLE and self.synthesis_history:
                try:
                    # This is a simplified example - in a real system, you'd compare to a reference dataset
                    current_data = {"duration_ms": [e["duration_ms"] for e in self.synthesis_history if e["success"]]}
                    drift_report = Report(metrics=[
                        ColumnDriftMetric(column_name="duration_ms")
                    ])
                    # In a real system, you'd need both reference and current data
                    # drift_report.run(reference_data=reference_data, current_data=current_data)
                    # logger.info(f"Drift report generated")
                except Exception as e:
                    logger.error(f"Error generating drift report: {str(e)}")
            
            # Save history snapshot for long-term analysis
            history_sample = self.synthesis_history[-1000:]  # Last 1000 events
            try:
                with open(f"tts_history_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json", "w") as f:
                    json.dump(history_sample, f)
            except Exception as e:
                logger.error(f"Error saving history snapshot: {str(e)}")
                
        except Exception as e:
            logger.error(f"Error generating monitoring reports: {str(e)}")
    
    def _background_monitoring(self) -> None:
        """Background monitoring thread."""
        while self.should_run:
            try:
                self._generate_reports()
            except Exception as e:
                logger.error(f"Error in background monitoring: {str(e)}")
            
            # Sleep for a while
            time.sleep(60)  # Check every minute
    
    def shutdown(self) -> None:
        """Shutdown the monitor."""
        self.should_run = False
        if self.monitor_thread.is_alive():
            self.monitor_thread.join(timeout=5)

# Global monitor instance
_monitor = None

def get_ml_monitor() -> MLMonitor:
    """Get the global ML monitor instance."""
    global _monitor
    if _monitor is None:
        # Check if MLflow tracking is configured
        tracking_uri = os.environ.get("MLFLOW_TRACKING_URI")
        enable_mlflow = tracking_uri is not None
        
        _monitor = MLMonitor(enable_mlflow=enable_mlflow, tracking_uri=tracking_uri)
    
    return _monitor
