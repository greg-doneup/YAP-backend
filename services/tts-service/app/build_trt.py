#!/usr/bin/env python3
"""
Compile TorchScript vocoder models into TensorRT engines using torch-tensorrt.
"""
import os
import torch
import torch_tensorrt
from app.config import Config

def compile_trt_engine(ts_path: str, engine_path: str, example_input: torch.Tensor, precision: str):
    print(f"Compiling {ts_path} -> {engine_path} ({precision})")
    model = torch.jit.load(ts_path).eval().cuda()
    # Select precision set
    if precision == 'int8':
        enabled_precisions = {torch.int8}
    else:
        enabled_precisions = {torch.float32}

    trt_ts = torch_tensorrt.compile(
        model,
        inputs=[torch_tensorrt.Input(example_input.shape, dtype=example_input.dtype, device="cuda")],
        enabled_precisions=enabled_precisions,
        workspace_size=1 << 20
    )
    os.makedirs(os.path.dirname(engine_path), exist_ok=True)
    # Serialize engine
    engine_bytes = trt_ts.serialize()
    with open(engine_path, 'wb') as f:
        f.write(engine_bytes)
    print(f"Saved TRT engine to {engine_path}")

if __name__ == '__main__':
    # Prepare dummy input
    example = torch.randn(1, Config.VOCODER_NUM_MELS, Config.VOCODER_SAMPLE_LENGTH, dtype=torch.float32).cuda()
    base_dir = Config.QUANTIZED_VOCODER_DIR
    trt_dir = os.path.join(base_dir, 'trt')
    # Compile FP32 engine
    ts_fp32 = os.path.join(base_dir, 'vocoder_fp32.ts')
    eng_fp32 = os.path.join(trt_dir, 'vocoder_fp32.trt')
    compile_trt_engine(ts_fp32, eng_fp32, example, precision='fp32')
    # Compile INT8 engine
    ts_int8 = os.path.join(base_dir, 'vocoder_int8.ts')
    eng_int8 = os.path.join(trt_dir, 'vocoder_int8.trt')
    compile_trt_engine(ts_int8, eng_int8, example, precision='int8')
