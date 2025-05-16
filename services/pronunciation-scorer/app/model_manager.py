import logging
import os
import time
import threading
import gc
from typing import Dict, Any, Optional
import psutil

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ModelManager:
    """
    Manages pronunciation scoring models with optimized loading and unloading.
    
    Features:
    - Lazy loading of models only when needed
    - Resource monitoring to prevent OOM issues
    - LRU cache eviction for unused models
    - Thread safety for concurrent access
    """
    
    _instance = None
    _lock = threading.RLock()
    
    @classmethod
    def get_instance(cls):
        """Get singleton instance."""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance
    
    def __init__(self):
        """Initialize model manager."""
        self.models = {}
        self.model_access_times = {}
        self.model_locks = {}
        self.max_memory_usage_pct = 80  # Maximum memory usage percentage
        self.min_available_memory_mb = 1000  # Minimum available memory in MB
        self.max_model_count = 5  # Maximum number of loaded models
        self.model_base_path = os.environ.get("MODEL_BASE_PATH", "./models")
        self.monitor_thread = None
        
        # Start resource monitoring thread
        self._start_resource_monitor()
    
    def _start_resource_monitor(self):
        """Start a thread to monitor resource usage and unload models if needed."""
        if self.monitor_thread is not None and self.monitor_thread.is_alive():
            return
        
        def monitor_resources():
            while True:
                try:
                    self._check_and_free_resources()
                except Exception as e:
                    logger.error(f"Error in resource monitor: {e}")
                time.sleep(30)  # Check every 30 seconds
        
        self.monitor_thread = threading.Thread(target=monitor_resources, daemon=True)
        self.monitor_thread.start()
        logger.info("Resource monitor thread started")
    
    def _check_and_free_resources(self):
        """Check resource usage and free memory if needed."""
        mem = psutil.virtual_memory()
        mem_used_pct = mem.percent
        mem_available_mb = mem.available / (1024 * 1024)
        
        logger.debug(f"Memory usage: {mem_used_pct}%, Available: {mem_available_mb} MB")
        
        if mem_used_pct > self.max_memory_usage_pct or mem_available_mb < self.min_available_memory_mb:
            logger.warning(f"High memory usage ({mem_used_pct}%), unloading unused models")
            self._unload_least_recently_used()
    
    def _unload_least_recently_used(self):
        """Unload least recently used models."""
        with self._lock:
            if not self.models:
                return
            
            # Calculate the number of models to unload (at least one)
            num_to_unload = max(1, len(self.models) // 4)
            
            # Sort models by access time
            sorted_models = sorted(self.model_access_times.items(), key=lambda x: x[1])
            
            # Unload the least recently used models
            for i in range(min(num_to_unload, len(sorted_models))):
                model_name = sorted_models[i][0]
                try:
                    model_lock = self.model_locks.get(model_name)
                    if model_lock and model_lock.acquire(blocking=False):
                        try:
                            if model_name in self.models:
                                logger.info(f"Unloading model: {model_name}")
                                del self.models[model_name]
                                del self.model_access_times[model_name]
                        finally:
                            model_lock.release()
                except Exception as e:
                    logger.error(f"Error unloading model {model_name}: {e}")
            
            # Force garbage collection
            gc.collect()
    
    def get_model(self, language_code: str, model_type: str = "default") -> Any:
        """
        Get a model for the specified language and type.
        
        Args:
            language_code: Language code (e.g., "en-US", "es-ES")
            model_type: Type of model (e.g., "default", "large", "small")
            
        Returns:
            Loaded model object
        """
        model_name = f"{language_code}_{model_type}"
        
        # Ensure we have a lock for this model
        if model_name not in self.model_locks:
            with self._lock:
                if model_name not in self.model_locks:
                    self.model_locks[model_name] = threading.RLock()
        
        # Check if we need to load the model
        if model_name not in self.models:
            with self.model_locks[model_name]:
                if model_name not in self.models:
                    # Check resource usage before loading
                    mem = psutil.virtual_memory()
                    if mem.percent > self.max_memory_usage_pct:
                        logger.warning(f"High memory usage ({mem.percent}%) before loading model")
                        self._unload_least_recently_used()
                    
                    # Check if we have too many models loaded
                    if len(self.models) >= self.max_model_count:
                        logger.info(f"Maximum number of models loaded ({len(self.models)}), unloading LRU model")
                        self._unload_least_recently_used()
                    
                    # Load the model
                    logger.info(f"Loading model: {model_name}")
                    start_time = time.time()
                    model = self._load_model(language_code, model_type)
                    elapsed_time = time.time() - start_time
                    logger.info(f"Model {model_name} loaded in {elapsed_time:.2f}s")
                    
                    self.models[model_name] = model
        
        # Update access time
        self.model_access_times[model_name] = time.time()
        
        return self.models[model_name]
    
    def _load_model(self, language_code: str, model_type: str) -> Any:
        """
        Load a pronunciation scoring model.
        
        Args:
            language_code: Language code (e.g., "en-US", "es-ES")
            model_type: Type of model (e.g., "default", "large", "small")
            
        Returns:
            Loaded model object
        """
        # This is a placeholder for your actual model loading code
        # Replace with your specific model loading implementation
        
        # Example for Kaldi-based pronunciation scoring
        model_path = os.path.join(self.model_base_path, language_code, model_type)
        
        # Ensure model directory exists
        if not os.path.exists(model_path):
            logger.warning(f"Model path does not exist: {model_path}")
            # Create fallback or default model
            return {"name": f"{language_code}_{model_type}", "type": "fallback"}
        
        # Simulate model loading with a delay
        time.sleep(1)
        
        # Return a placeholder model object
        # In a real implementation, this would return the actual loaded model
        return {"name": f"{language_code}_{model_type}", "path": model_path, "loaded_at": time.time()}
    
    def unload_all_models(self):
        """Unload all loaded models."""
        with self._lock:
            model_names = list(self.models.keys())
            for model_name in model_names:
                try:
                    logger.info(f"Unloading model: {model_name}")
                    del self.models[model_name]
                except Exception as e:
                    logger.error(f"Error unloading model {model_name}: {e}")
            
            self.model_access_times.clear()
            
            # Force garbage collection
            gc.collect()
    
    def get_resource_usage(self) -> Dict[str, Any]:
        """Get current resource usage statistics."""
        mem = psutil.virtual_memory()
        cpu = psutil.cpu_percent(interval=0.1)
        
        return {
            "memory_used_percent": mem.percent,
            "memory_available_mb": mem.available / (1024 * 1024),
            "cpu_percent": cpu,
            "loaded_models_count": len(self.models),
            "loaded_models": list(self.models.keys())
        }
