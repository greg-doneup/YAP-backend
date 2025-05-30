import os
import torch
import tempfile
import pytest
from app.config import Config
from app.tts_provider import MozillaTTSProvider


def test_lora_adapter_application(tmp_path, monkeypatch):
    # Prepare dummy adapter state dict
    user_id = 'test_user'
    adapter_weights = torch.tensor([[1.0, 2.0], [3.0, 4.0]])
    adapter_state = {'weight': adapter_weights}

    # Create temporary adapter file
    adapter_dir = tmp_path / 'adapters'
    adapter_dir.mkdir()
    adapter_file = adapter_dir / f"{user_id}.pt"
    torch.save(adapter_state, str(adapter_file))

    # Monkeypatch config to use our temp adapter dir
    monkeypatch.setenv('LORA_ADAPTER_DIR', str(adapter_dir))
    # Reload Config to pick up env var
    monkeypatch.setattr(Config, 'LORA_ADAPTER_DIR', str(adapter_dir))
    monkeypatch.setattr(Config, 'USE_LORA_ADAPTER', True)

    # Initialize provider with a simple model
    provider = MozillaTTSProvider()
    # Stub tts_model with a weight attribute
    class DummyModel:
        def __init__(self):
            self.weight = torch.zeros_like(adapter_weights)
    provider.tts_model = DummyModel()

    # Load and apply adapter
    provider._load_adapter(user_id)
    provider._apply_adapter(user_id)

    # Verify adapter application
    assert hasattr(provider.tts_model, 'weight')
    result = provider.tts_model.weight
    assert torch.allclose(result, adapter_weights), f"Expected {adapter_weights}, got {result}"
