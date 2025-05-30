"""
Model optimization utilities for TTS service.

This module provides functions to optimize Coqui TTS models
(e.g., convert to TorchScript) for improved inference performance.
"""
import os
import logging
from app.config import Config

logger = logging.getLogger(__name__)


def optimize_models():
    """Optimize all language models and save to optimized directory."""
    base_path = Config.MOZILLA_TTS_MODEL_PATH
    opt_dir = Config.OPTIMIZED_MODEL_DIR
    os.makedirs(opt_dir, exist_ok=True)

    # Iterate through languages
    for lang_code, model_rel in Config.DEFAULT_VOICES_BY_LANGUAGE.items():
        model_path = os.path.join(base_path, model_rel)
        if not os.path.isdir(model_path):
            logger.warning(f"Model path not found for {lang_code}: {model_path}")
            continue
        logger.info(f"Optimizing model for {lang_code}")
        try:
            # Load Coqui TTS model
            from TTS.api import TTS
            tts = TTS(model_name=model_rel, progress_bar=False, gpu=False)
            # Access underlying PyTorch model
            pytorch_model = tts.tts_model.model
            # Script the model
            import torch
            scripted = torch.jit.script(pytorch_model)
            # Save TorchScript file
            lang_opt_dir = os.path.join(opt_dir, lang_code)
            os.makedirs(lang_opt_dir, exist_ok=True)
            ts_file = os.path.join(lang_opt_dir, 'model.ts')
            scripted.save(ts_file)
            logger.info(f"Saved optimized model to {ts_file}")
        except Exception as e:
            logger.error(f"Failed to optimize model for {lang_code}: {e}")


if __name__ == '__main__':
    optimize_models()
