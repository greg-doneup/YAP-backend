import logging
import time
import threading
import psutil
from typing import Dict, List, Any, Optional
from concurrent.futures import ThreadPoolExecutor

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ResourceMonitor:
    """
    Monitors system resources and provides throttling mechanisms.
    
    Features:
    - CPU and memory usage monitoring
    - Request rate tracking and throttling
    - Adaptive concurrency limits
    - Health status reporting
    """
    
    _instance = None
    _lock = threading.Lock()
    
    @classmethod
    def get_instance(cls):
        """Get singleton instance."""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance
    
    def __init__(self):
        """Initialize resource monitor."""
        self.request_history = []
        self.request_history_max_size = 1000
        self.request_history_window_seconds = 60
        
        self.cpu_high_threshold = 85  # Percentage
        self.memory_high_threshold = 80  # Percentage
        self.max_requests_per_minute = 300  # Adjust based on service capacity
        
        self.throttling_enabled = True
        self.throttling_status = False
        
        self.circuit_breaker_enabled = True
        self.circuit_breaker_status = False
        self.circuit_breaker_cooldown_seconds = 30
        self.circuit_breaker_last_triggered = 0
        
        self.adaptive_concurrency_enabled = True
        self.current_max_concurrency = 10  # Starting value
        self.min_concurrency = 1
        self.max_concurrency = 100
        
        self.monitor_thread = None
        
        # Start monitoring thread
        self._start_monitoring_thread()
        
        logger.info("Resource monitor initialized")
    
    def _start_monitoring_thread(self):
        """Start a background thread for continuous resource monitoring."""
        if self.monitor_thread is not None and self.monitor_thread.is_alive():
            return
        
        def monitor_resources():
            while True:
                try:
                    # Update metrics
                    self._update_metrics()
                    
                    # Adjust throttling based on current resource usage
                    self._adjust_throttling()
                    
                    # Adjust concurrency limits if enabled
                    if self.adaptive_concurrency_enabled:
                        self._adjust_concurrency_limits()
                    
                    # Clean up old request history entries
                    self._clean_request_history()
                except Exception as e:
                    logger.error(f"Error in resource monitor thread: {e}")
                
                time.sleep(5)  # Check every 5 seconds
        
        self.monitor_thread = threading.Thread(target=monitor_resources, daemon=True)
        self.monitor_thread.start()
        logger.info("Resource monitoring thread started")
    
    def _update_metrics(self):
        """Update resource usage metrics."""
        # Sample CPU and memory usage
        try:
            self.current_cpu = psutil.cpu_percent(interval=0.1)
            self.current_memory = psutil.virtual_memory().percent
            
            # Get network stats
            net = psutil.net_io_counters()
            self.current_net_sent = net.bytes_sent
            self.current_net_recv = net.bytes_recv
        except Exception as e:
            logger.warning(f"Error updating metrics: {e}")
    
    def _adjust_throttling(self):
        """Adjust throttling status based on current resource usage."""
        if not self.throttling_enabled:
            self.throttling_status = False
            return
        
        # Check resource thresholds
        cpu_overloaded = self.current_cpu > self.cpu_high_threshold
        memory_overloaded = self.current_memory > self.memory_high_threshold
        
        # Check request rate
        current_rate = self.get_request_rate()
        rate_overloaded = current_rate > self.max_requests_per_minute
        
        # Update throttling status
        new_throttling_status = cpu_overloaded or memory_overloaded or rate_overloaded
        
        if new_throttling_status != self.throttling_status:
            if new_throttling_status:
                logger.warning(
                    f"Throttling activated: CPU={self.current_cpu}%, "
                    f"Memory={self.current_memory}%, "
                    f"RequestRate={current_rate}/min"
                )
            else:
                logger.info(
                    f"Throttling deactivated: CPU={self.current_cpu}%, "
                    f"Memory={self.current_memory}%, "
                    f"RequestRate={current_rate}/min"
                )
            
            self.throttling_status = new_throttling_status
        
        # Check circuit breaker conditions (extreme overload)
        if self.circuit_breaker_enabled:
            extreme_cpu = self.current_cpu > 95
            extreme_memory = self.current_memory > 95
            current_time = time.time()
            
            # Only trigger if not recently triggered
            cooldown_expired = (current_time - self.circuit_breaker_last_triggered) > self.circuit_breaker_cooldown_seconds
            
            if (extreme_cpu or extreme_memory) and cooldown_expired:
                logger.critical(
                    f"Circuit breaker triggered: CPU={self.current_cpu}%, "
                    f"Memory={self.current_memory}%"
                )
                self.circuit_breaker_status = True
                self.circuit_breaker_last_triggered = current_time
            elif self.circuit_breaker_status and cooldown_expired:
                logger.info("Circuit breaker reset after cooldown period")
                self.circuit_breaker_status = False
    
    def _adjust_concurrency_limits(self):
        """Dynamically adjust concurrency limits based on resource usage."""
        if not self.adaptive_concurrency_enabled:
            return
        
        # Simple heuristic: decrease concurrency as CPU/memory usage increases
        cpu_factor = max(0, 1 - (self.current_cpu / 100))
        memory_factor = max(0, 1 - (self.current_memory / 100))
        
        # Combined factor (weighted)
        resource_factor = (0.7 * cpu_factor) + (0.3 * memory_factor)
        
        # Calculate new concurrency value
        new_concurrency = int(self.min_concurrency + resource_factor * (self.max_concurrency - self.min_concurrency))
        
        # Smooth the transition by not changing too drastically
        max_change_pct = 0.2  # Max 20% change at once
        max_change = max(1, int(self.current_max_concurrency * max_change_pct))
        
        if new_concurrency > self.current_max_concurrency:
            new_concurrency = min(new_concurrency, self.current_max_concurrency + max_change)
        else:
            new_concurrency = max(new_concurrency, self.current_max_concurrency - max_change)
        
        # Apply bounds
        new_concurrency = max(self.min_concurrency, min(new_concurrency, self.max_concurrency))
        
        # Update if changed
        if new_concurrency != self.current_max_concurrency:
            logger.info(
                f"Adjusting concurrency limit: {self.current_max_concurrency} -> {new_concurrency} "
                f"(CPU={self.current_cpu}%, Memory={self.current_memory}%)"
            )
            self.current_max_concurrency = new_concurrency
    
    def _clean_request_history(self):
        """Remove old entries from request history."""
        current_time = time.time()
        cutoff_time = current_time - self.request_history_window_seconds
        
        with self._lock:
            self.request_history = [r for r in self.request_history if r > cutoff_time]
    
    def record_request(self):
        """Record a new request for rate tracking."""
        with self._lock:
            self.request_history.append(time.time())
            
            # Trim if history gets too large
            if len(self.request_history) > self.request_history_max_size:
                self.request_history = self.request_history[-self.request_history_max_size:]
    
    def get_request_rate(self) -> float:
        """Get the current request rate per minute."""
        current_time = time.time()
        cutoff_time = current_time - self.request_history_window_seconds
        
        with self._lock:
            # Count requests in the window
            recent_requests = sum(1 for t in self.request_history if t > cutoff_time)
            
            # Convert to requests per minute
            rate_per_minute = (recent_requests / self.request_history_window_seconds) * 60
            
            return rate_per_minute
    
    def should_throttle(self) -> bool:
        """Check if the request should be throttled."""
        # Always record the request
        self.record_request()
        
        # Circuit breaker takes precedence
        if self.circuit_breaker_status:
            return True
        
        return self.throttling_status
    
    def get_executor(self) -> ThreadPoolExecutor:
        """Get a thread pool executor with appropriate concurrency limits."""
        return ThreadPoolExecutor(max_workers=self.current_max_concurrency)
    
    def get_status(self) -> Dict[str, Any]:
        """Get the current status of the resource monitor."""
        try:
            current_rate = self.get_request_rate()
            
            return {
                "cpu_usage_percent": self.current_cpu,
                "memory_usage_percent": self.current_memory,
                "request_rate_per_minute": current_rate,
                "throttling_active": self.throttling_status,
                "circuit_breaker_active": self.circuit_breaker_status,
                "current_max_concurrency": self.current_max_concurrency,
                "network_bytes_sent": self.current_net_sent,
                "network_bytes_received": self.current_net_recv
            }
        except Exception as e:
            logger.error(f"Error getting resource monitor status: {e}")
            return {
                "error": str(e),
                "throttling_active": True  # Fail closed
            }

class GrpcResourceInterceptor:
    """
    gRPC interceptor for resource throttling.
    
    This interceptor:
    - Monitors system resource usage
    - Throttles requests when resources are constrained
    - Records request metrics
    - Implements circuit breaker pattern
    """
    
    def __init__(self):
        self.resource_monitor = ResourceMonitor.get_instance()
        logger.info("Resource interceptor initialized")
    
    def intercept_service(self, continuation, handler_call_details):
        """Intercept and potentially throttle incoming gRPC requests."""
        # Check if we should throttle
        if self.resource_monitor.should_throttle():
            # Return a handler that rejects the request with RESOURCE_EXHAUSTED
            def throttled_handler(request, context):
                context.set_code(grpc.StatusCode.RESOURCE_EXHAUSTED)
                context.set_details("Service temporarily throttled due to resource constraints")
                return None
            
            logger.warning(f"Throttling request to {handler_call_details.method}")
            return throttled_handler
        
        # Continue with the normal handler
        return continuation(handler_call_details)
