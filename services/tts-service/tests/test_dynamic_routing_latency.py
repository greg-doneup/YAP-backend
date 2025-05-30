import os
import time
import pytest
import grpc
from proto import tts_pb2, tts_pb2_grpc

# Assumes TTSService is running locally on port 50051
def send_request(stub):
    request = tts_pb2.TTSRequest(
        text="Hello world",
        language_code="en-US",
        voice_id="default",
        audio_format="wav",
        speaking_rate=1.0,
        pitch=0.0,
        use_neural_voice=False,
        user_id="test_user",
        user_params={"device_type": "desktop"}
    )
    response = stub.GenerateSpeech(request)
    assert response.success

@pytest.mark.parametrize("dynamic_routing", [False, True])
def test_dynamic_routing_latency(dynamic_routing):
    # Toggle dynamic routing via env var
    os.environ['USE_DYNAMIC_ROUTING'] = '1' if dynamic_routing else '0'

    channel = grpc.insecure_channel('localhost:50051')
    stub = tts_pb2_grpc.TTSServiceStub(channel)

    # Warm-up
    for _ in range(5):
        send_request(stub)

    # Measure N requests
    N = 50
    durations = []
    for _ in range(N):
        start = time.time()
        send_request(stub)
        durations.append((time.time() - start) * 1000)  # ms

    avg_latency = sum(durations) / len(durations)
    print(f"Dynamic routing={dynamic_routing} avg latency: {avg_latency:.2f}ms")

    # Store baseline and dynamic latencies
    if not dynamic_routing:
        global baseline_latency
        pytest.baseline_latency = avg_latency
    else:
        # dynamic added latency should be under 5ms
        delta = avg_latency - pytest.baseline_latency
        assert delta < 5.0, f"Dynamic routing overhead too high: {delta:.2f}ms"
