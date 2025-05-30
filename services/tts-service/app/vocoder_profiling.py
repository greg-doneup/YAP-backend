#!/usr/bin/env python3
"""
Profile FP32 vs INT8 models locally via Triton Inference Server
"""
import time
import numpy as np
from tritonclient.grpc import InferenceServerClient, InferInput, InferRequestedOutput
from app.config import Config

def profile_model(model_name: str, input_data: np.ndarray, url: str = 'localhost:8001'):
    client = InferenceServerClient(url=url)
    inputs = []
    inputs.append(InferInput('mel', input_data.shape, 'FP32'))
    inputs[0].set_data_from_numpy(input_data.astype(np.float32))
    outputs = [InferRequestedOutput('audio', binary_data=False)]

    # warmup
    for _ in range(10):
        client.infer(model_name, inputs, outputs=outputs)

    # profile
    N = 50
    durations = []
    for _ in range(N):
        start = time.time()
        client.infer(model_name, inputs, outputs=outputs)
        durations.append((time.time() - start) * 1000)

    avg = sum(durations) / len(durations)
    print(f"{model_name}: avg latency {avg:.2f} ms")
    return avg

if __name__ == '__main__':
    import torch
    # Prepare dummy input
    example = torch.randn(1, Config.VOCODER_NUM_MELS, Config.VOCODER_SAMPLE_LENGTH).numpy()
    # Profile both models
    for model in ['vocoder_fp32', 'vocoder_int8']:
        profile_model(model, example)
