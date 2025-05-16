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

class AlignmentModelManager:
    """
    Manages alignment models with optimized loading and unloading.
    
    Features:
    - Lazy loading of WhisperX models only when needed
    - GPU memory management and CPU fallback
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
        self.gpu_available = self._check_gpu_availability()
        self.max_gpu_memory_usage_pct = 85  # Maximum GPU memory usage percentage
        self.max_cpu_memory_usage_pct = 80  # Maximum CPU memory usage percentage
        self.min_available_memory_mb = 1000  # Minimum available memory in MB
        self.max_model_count = 3  # Maximum number of loaded models
        self.model_base_path = os.environ.get("MODEL_BASE_PATH", "./models")
        self.monitor_thread = None
        
        # Start resource monitoring thread
        self._start_resource_monitor()
        
        logger.info(f"Alignment model manager initialized. GPU available: {self.gpu_available}")
    
    def _check_gpu_availability(self) -> bool:
        """Check if GPU is available for model inference."""
        try:
            import torch
            return torch.cuda.is_available()
        except ImportError:
            logger.warning("PyTorch not available, assuming no GPU")
            return False
        except Exception as e:
            logger.warning(f"Error checking GPU availability: {e}")
            return False
    
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
        # Check CPU memory
        mem = psutil.virtual_memory()
        mem_used_pct = mem.percent
        mem_available_mb = mem.available / (1024 * 1024)
        
        # Check GPU memory if available
        gpu_mem_used_pct = 0
        if self.gpu_available:
            try:
                import torch
                gpu_mem_used = torch.cuda.memory_allocated(0)
                gpu_mem_total = torch.cuda.get_device_properties(0).total_memory
                gpu_mem_used_pct = (gpu_mem_used / gpu_mem_total) * 100
                logger.debug(f"GPU memory usage: {gpu_mem_used_pct:.2f}%")
            except Exception as e:
                logger.warning(f"Error checking GPU memory: {e}")
        
        logger.debug(f"CPU memory usage: {mem_used_pct}%, Available: {mem_available_mb} MB")
        
        # Unload models if resources are low
        if ((self.gpu_available and gpu_mem_used_pct > self.max_gpu_memory_usage_pct) or 
            mem_used_pct > self.max_cpu_memory_usage_pct or 
            mem_available_mb < self.min_available_memory_mb):
            
            logger.warning(f"High memory usage (CPU: {mem_used_pct}%, GPU: {gpu_mem_used_pct}%), unloading unused models")
            self._unload_least_recently_used()
    
    def _unload_least_recently_used(self):
        """Unload least recently used models."""
        with self._lock:
            if not self.models:
                return
            
            # Calculate the number of models to unload (at least one)
            num_to_unload = max(1, len(self.models) // 2)
            
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
                                
                                # Special handling for PyTorch models to free GPU memory
                                model = self.models[model_name]
                                if hasattr(model, "to"):
                                    try:
                                        model.to("cpu")
                                    except Exception as e:
                                        logger.warning(f"Error moving model to CPU: {e}")
                                
                                del self.models[model_name]
                                del self.model_access_times[model_name]
                        finally:
                            model_lock.release()
                except Exception as e:
                    logger.error(f"Error unloading model {model_name}: {e}")
            
            # Force garbage collection
            gc.collect()
            
            # Clear CUDA cache if available
            if self.gpu_available:
                try:
                    import torch
                    torch.cuda.empty_cache()
                except Exception as e:
                    logger.warning(f"Error clearing CUDA cache: {e}")
    
    def get_model(self, model_name: str, use_gpu: bool = None) -> Any:
        """
        Get a WhisperX alignment model.
        
        Args:
            model_name: Name of the WhisperX model (e.g., "large-v2", "medium")
            use_gpu: Whether to use GPU. If None, uses GPU if available.
            
        Returns:
            Loaded WhisperX model object
        """
        # Determine device to use
        if use_gpu is None:
            use_gpu = self.gpu_available
        
        # If GPU requested but not available, log warning
        if use_gpu and not self.gpu_available:
            logger.warning("GPU requested but not available, falling back to CPU")
            use_gpu = False
        
        model_key = f"{model_name}_{use_gpu}"
        
        # Ensure we have a lock for this model
        if model_key not in self.model_locks:
            with self._lock:
                if model_key not in self.model_locks:
                    self.model_locks[model_key] = threading.RLock()
        
        # Check if we need to load the model
        if model_key not in self.models:
            with self.model_locks[model_key]:
                if model_key not in self.models:
                    # Check resource usage before loading
                    mem = psutil.virtual_memory()
                    if mem.percent > self.max_cpu_memory_usage_pct:
                        logger.warning(f"High CPU memory usage ({mem.percent}%) before loading model")
                        self._unload_least_recently_used()
                    
                    # Check GPU memory if planning to use GPU
                    if use_gpu:
                        try:
                            import torch
                            gpu_mem_used = torch.cuda.memory_allocated(0)
                            gpu_mem_total = torch.cuda.get_device_properties(0).total_memory
                            gpu_mem_used_pct = (gpu_mem_used / gpu_mem_total) * 100
                            
                            if gpu_mem_used_pct > self.max_gpu_memory_usage_pct:
                                logger.warning(f"High GPU memory usage ({gpu_mem_used_pct:.2f}%) before loading model")
                                self._unload_least_recently_used()
                        except Exception as e:
                            logger.warning(f"Error checking GPU memory: {e}")
                    
                    # Check if we have too many models loaded
                    if len(self.models) >= self.max_model_count:
                        logger.info(f"Maximum number of models loaded ({len(self.models)}), unloading LRU model")
                        self._unload_least_recently_used()
                    
                    # Load the model
                    logger.info(f"Loading model: {model_key}")
                    start_time = time.time()
                    model = self._load_whisperx_model(model_name, use_gpu)
                    elapsed_time = time.time() - start_time
                    logger.info(f"Model {model_key} loaded in {elapsed_time:.2f}s")
                    
                    self.models[model_key] = model
        
        # Update access time
        self.model_access_times[model_key] = time.time()
        
        return self.models[model_key]
    
    def _load_whisperx_model(self, model_name: str, use_gpu: bool) -> Any:
        """
        Load a WhisperX model.
        
        Args:
            model_name: Name of the WhisperX model (e.g., "large-v2", "medium")
            use_gpu: Whether to use GPU
            
        Returns:
            Loaded WhisperX model
        """
        # This is a placeholder for your actual WhisperX model loading code
        # In a real implementation, you would import WhisperX and load the model
        
        try:
            # Simulate importing WhisperX
            # import whisperx
            
            device = "cuda" if use_gpu else "cpu"
            logger.info(f"Loading {model_name} on {device}")
            
            # Simulate model loading with a delay
            time.sleep(2)
            
            # In a real implementation:
            # model = whisperx.load_model(model_name, device)
            
            # Return a placeholder model object
            return {
                "name": model_name,
                "device": device,
                "loaded_at": time.time(),
                
                # Add a mock 'to' method to simulate PyTorch model behavior
                "to": lambda device: None
            }
            
        except Exception as e:
            logger.error(f"Error loading WhisperX model {model_name}: {e}")
            # Return a minimal fallback model
            return {
                "name": model_name,
                "device": "cpu",
                "loaded_at": time.time(),
                "is_fallback": True,
                
                # Add a mock 'to' method
                "to": lambda device: None
            }
    
    def unload_all_models(self):
        """Unload all loaded models."""
        with self._lock:
            model_names = list(self.models.keys())
            for model_name in model_names:
                try:
                    model = self.models[model_name]
                    logger.info(f"Unloading model: {model_name}")
                    
                    # Handle PyTorch models
                    if hasattr(model, "to"):
                        try:
                            model.to("cpu")
                        except Exception as e:
                            logger.warning(f"Error moving model to CPU: {e}")
                    
                    del self.models[model_name]
                except Exception as e:
                    logger.error(f"Error unloading model {model_name}: {e}")
            
            self.model_access_times.clear()
            
            # Force garbage collection
            gc.collect()
            
            # Clear CUDA cache if available
            if self.gpu_available:
                try:
                    import torch
                    torch.cuda.empty_cache()
                except Exception as e:
                    logger.warning(f"Error clearing CUDA cache: {e}")
    
    def get_resource_usage(self) -> Dict[str, Any]:
        """Get current resource usage statistics."""
        mem = psutil.virtual_memory()
        cpu = psutil.cpu_percent(interval=0.1)
        
        result = {
            "memory_used_percent": mem.percent,
            "memory_available_mb": mem.available / (1024 * 1024),
            "cpu_percent": cpu,
            "loaded_models_count": len(self.models),
            "loaded_models": list(self.models.keys()),
            "gpu_available": self.gpu_available
        }
        
        # Add GPU stats if available
        if self.gpu_available:
            try:
                import torch
                gpu_mem_used = torch.cuda.memory_allocated(0)
                gpu_mem_reserved = torch.cuda.memory_reserved(0)
                gpu_mem_total = torch.cuda.get_device_properties(0).total_memory
                
                result.update({
                    "gpu_memory_used_bytes": int(gpu_mem_used),
                    "gpu_memory_reserved_bytes": int(gpu_mem_reserved),
                    "gpu_memory_total_bytes": int(gpu_mem_total),
                    "gpu_memory_used_percent": (gpu_mem_used / gpu_mem_total) * 100,
                    "gpu_name": torch.cuda.get_device_name(0)
                })
            except Exception as e:
                logger.warning(f"Error collecting GPU stats: {e}")
                result["gpu_error"] = str(e)
        
        return result
