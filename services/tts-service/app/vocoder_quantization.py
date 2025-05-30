#!/usr/bin/env python3
"""
Quantize the TTS vocoder model to 8-bit using dynamic quantization,
and export TorchScript and ONNX versions.
"""
import os
import torch
from app.config import Config


def load_torchscript_model():
    """Load pre-trained TorchScript vocoder model"""
    model = torch.jit.load(Config.VOCODER_MODEL_PATH, map_location='cpu')
    model.eval()
    return model


def quantize_dynamic(model):
    """Apply dynamic quantization to a TorchScript model for weight-only quantization"""
    # Target Linear layers for quantization
    q_model = torch.quantization.quantize_dynamic(
        model, {torch.nn.Linear}, dtype=torch.qint8
    )
    return q_model


def export_torchscript(model, output_path):
    """Save TorchScript model"""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    torch.jit.save(model, output_path)
    print(f"Saved TorchScript model to {output_path}")


def export_onnx(model, example_input, output_path):
    """Export model to ONNX"""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    torch.onnx.export(
        model,
        example_input,
        output_path,
        input_names=['mel'],
        output_names=['audio'],
        dynamic_axes={
            'mel': {2: 'mel_length'},
            'audio': {1: 'audio_length'}
        },
        opset_version=13
    )
    print(f"Exported ONNX model to {output_path}")


def main():
    # Prepare example input: dummy mel-spectrogram
    example = torch.randn(
        1,
        Config.VOCODER_NUM_MELS,
        Config.VOCODER_SAMPLE_LENGTH,
        dtype=torch.float32
    )

    # Load FP32 model
    model_fp32 = load_torchscript_model()
    # Export FP32 TorchScript & ONNX
    ts_fp32 = os.path.join(Config.QUANTIZED_VOCODER_DIR, 'vocoder_fp32.ts')
    onnx_fp32 = os.path.join(Config.QUANTIZED_VOCODER_DIR, 'vocoder_fp32.onnx')
    export_torchscript(model_fp32, ts_fp32)
    export_onnx(model_fp32, example, onnx_fp32)

    # Quantize to INT8
    model_int8 = quantize_dynamic(model_fp32)
    # Export INT8 TorchScript & ONNX
    ts_int8 = os.path.join(Config.QUANTIZED_VOCODER_DIR, 'vocoder_int8.ts')
    onnx_int8 = os.path.join(Config.QUANTIZED_VOCODER_DIR, 'vocoder_int8.onnx')
    export_torchscript(model_int8, ts_int8)
    export_onnx(model_int8, example, onnx_int8)

    print("Quantization and export completed.")

if __name__ == '__main__':
    main()
