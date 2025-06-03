import grpc
from concurrent.futures import ThreadPoolExecutor
import voice_pb2, voice_pb2_grpc
from model import transcribe
from scorer import similarity

# Import security middleware
try:
    from security import create_voice_score_security_interceptor, get_voice_score_security_metrics
    SECURITY_AVAILABLE = True
except ImportError:
    SECURITY_AVAILABLE = False
    print("Security middleware not available - running without security")

THRESHOLD = 0.8

class Service(voice_pb2_grpc.VoiceScoreServicer):
    def Evaluate(self, request, context):
        txt = transcribe(request.audio)
        sc  = similarity(txt, request.expected_phrase)
        return voice_pb2.EvalResponse(transcript=txt, score=sc, pass_=sc>=THRESHOLD)

def serve():
    """Start the gRPC server with optional security"""
    # Create security interceptor if available
    interceptors = []
    if SECURITY_AVAILABLE:
        try:
            security_interceptor = create_voice_score_security_interceptor()
            interceptors.append(security_interceptor)
            print("Voice score service starting with security enabled")
        except Exception as e:
            print(f"Failed to initialize security: {e}")
    else:
        print("Voice score service starting without security")
    
    # Create server with optional security interceptors
    s = grpc.server(
        ThreadPoolExecutor(max_workers=8),
        interceptors=interceptors
    )
    
    voice_pb2_grpc.add_VoiceScoreServicer_to_server(Service(), s)
    s.add_insecure_port("[::]:50051")
    print("Voice score service listening on port 50051")
    s.start()
    s.wait_for_termination()

if __name__ == "__main__":
    serve()
