import os
from faster_whisper import WhisperModel

_model = None

def get_model():
    global _model
    if _model is None:
        _model = WhisperModel(
            model_size_or_path=os.getenv("WHISPER_MODEL", "base"),
            device="cuda" if os.getenv("USE_GPU") == "1" else "cpu",
            compute_type="float16" if os.getenv("USE_GPU") == "1" else "int8",
        )
    return _model

def transcribe(audio_bytes: bytes) -> str:
    segments, _ = get_model().transcribe(audio_bytes, beam_size=5)
    return "".join(s.text for s in segments).strip().lower()
