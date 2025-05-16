"""
Benchmarking module for TTS service.

This module provides tools to measure and track performance metrics
for different TTS providers.
"""

import time
from typing import Dict, Any, Optional, List
import logging
import json
import os
import statistics
from datetime import datetime

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class BenchmarkTracker:
    """
    Tracks and stores performance metrics for TTS providers.
    """

    def __init__(self, results_dir: str = "benchmark_results"):
        """
        Initialize the benchmark tracker.
        
        Args:
            results_dir: Directory where benchmark results will be stored
        """
        self.results_dir = results_dir
        self.current_benchmark = None
        self.metrics = []
        
        # Create the results directory if it doesn't exist
        os.makedirs(self.results_dir, exist_ok=True)
        
    def start_benchmark(self, provider: str, operation: str, language: str, 
                       voice_id: Optional[str] = None) -> None:
        """
        Start a benchmark timing for a TTS operation.
        
        Args:
            provider: The TTS provider name
            operation: The operation being performed (e.g., "synthesize_speech", "synthesize_phoneme")
            language: The language code
            voice_id: Optional voice ID
        """
        self.current_benchmark = {
            "provider": provider,
            "operation": operation,
            "language": language,
            "voice_id": voice_id,
            "start_time": time.time(),
            "end_time": None,
            "duration": None,
            "audio_duration": None,
            "audio_size_bytes": None,
            "success": False,
            "timestamp": datetime.utcnow().isoformat()
        }
        
    def end_benchmark(self, success: bool, audio_duration: Optional[float] = None, 
                     audio_size_bytes: Optional[int] = None) -> Dict[str, Any]:
        """
        End a benchmark timing and record metrics.
        
        Args:
            success: Whether the operation succeeded
            audio_duration: The duration of the generated audio in seconds
            audio_size_bytes: The size of the generated audio in bytes
            
        Returns:
            Dict[str, Any]: The benchmark results
        """
        if self.current_benchmark is None:
            logger.warning("No active benchmark to end")
            return {}
        
        end_time = time.time()
        duration = end_time - self.current_benchmark["start_time"]
        
        self.current_benchmark.update({
            "end_time": end_time,
            "duration": duration,
            "audio_duration": audio_duration,
            "audio_size_bytes": audio_size_bytes,
            "success": success
        })
        
        # Calculate realtime factor if audio duration is available
        if audio_duration is not None and audio_duration > 0:
            self.current_benchmark["realtime_factor"] = duration / audio_duration
        
        self.metrics.append(self.current_benchmark.copy())
        
        # Log the benchmark results
        log_message = (
            f"BENCHMARK: {self.current_benchmark['provider']} - "
            f"{self.current_benchmark['operation']} - "
            f"{self.current_benchmark['language']} - "
            f"Processing Time: {duration:.4f}s"
        )
        
        if "realtime_factor" in self.current_benchmark:
            log_message += f" - RTF: {self.current_benchmark['realtime_factor']:.4f}"
            
        if not success:
            log_message += " - FAILED"
            
        logger.info(log_message)
        
        benchmark_result = self.current_benchmark
        self.current_benchmark = None
        return benchmark_result
    
    def save_results(self, filename: Optional[str] = None) -> str:
        """
        Save benchmark results to a file.
        
        Args:
            filename: Optional custom filename, default is a timestamp
            
        Returns:
            str: Path to saved results file
        """
        if not self.metrics:
            logger.warning("No metrics to save")
            return ""
            
        if filename is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"benchmark_{timestamp}.json"
            
        file_path = os.path.join(self.results_dir, filename)
        
        with open(file_path, "w") as f:
            json.dump(self.metrics, f, indent=2)
            
        logger.info(f"Benchmark results saved to {file_path}")
        return file_path
    
    def compute_statistics(self, provider: Optional[str] = None) -> Dict[str, Any]:
        """
        Compute statistics from collected metrics.
        
        Args:
            provider: Optional provider name to filter results
            
        Returns:
            Dict[str, Any]: Statistics for collected metrics
        """
        if not self.metrics:
            logger.warning("No metrics available for statistics")
            return {}
            
        filtered_metrics = self.metrics
        if provider:
            filtered_metrics = [m for m in self.metrics if m["provider"] == provider]
            
        if not filtered_metrics:
            logger.warning(f"No metrics found for provider {provider}")
            return {}
        
        # Group by operation
        operations = set(m["operation"] for m in filtered_metrics)
        result = {"overall": {}, "operations": {}}
        
        # Calculate overall statistics
        durations = [m["duration"] for m in filtered_metrics if m["duration"] is not None]
        if durations:
            result["overall"] = {
                "min_duration": min(durations),
                "max_duration": max(durations),
                "avg_duration": statistics.mean(durations),
                "median_duration": statistics.median(durations),
                "total_operations": len(durations),
                "success_rate": sum(1 for m in filtered_metrics if m["success"]) / len(filtered_metrics)
            }
            
            rtf_values = [m.get("realtime_factor") for m in filtered_metrics if m.get("realtime_factor") is not None]
            if rtf_values:
                result["overall"]["avg_rtf"] = statistics.mean(rtf_values)
                result["overall"]["median_rtf"] = statistics.median(rtf_values)
        
        # Calculate per-operation statistics
        for op in operations:
            op_metrics = [m for m in filtered_metrics if m["operation"] == op]
            op_durations = [m["duration"] for m in op_metrics if m["duration"] is not None]
            
            if not op_durations:
                continue
                
            result["operations"][op] = {
                "min_duration": min(op_durations),
                "max_duration": max(op_durations),
                "avg_duration": statistics.mean(op_durations),
                "median_duration": statistics.median(op_durations),
                "total_operations": len(op_durations),
                "success_rate": sum(1 for m in op_metrics if m["success"]) / len(op_metrics)
            }
            
            op_rtf = [m.get("realtime_factor") for m in op_metrics if m.get("realtime_factor") is not None]
            if op_rtf:
                result["operations"][op]["avg_rtf"] = statistics.mean(op_rtf)
                result["operations"][op]["median_rtf"] = statistics.median(op_rtf)
                
        return result
        
# Singleton instance
_benchmarker = None

def get_benchmarker() -> BenchmarkTracker:
    """
    Get or create the benchmark tracker.
    
    Returns:
        BenchmarkTracker: The benchmark tracker singleton
    """
    global _benchmarker
    if _benchmarker is None:
        _benchmarker = BenchmarkTracker()
    return _benchmarker
