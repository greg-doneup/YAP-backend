import grpc
from concurrent.futures import ThreadPoolExecutor
import voice_pb2, voice_pb2_grpc
from model import transcribe
from scorer import similarity

THRESHOLD = 0.8

class Service(voice_pb2_grpc.VoiceScoreServicer):
    def Evaluate(self, request, context):
        txt = transcribe(request.audio)
        sc  = similarity(txt, request.expected_phrase)
        return voice_pb2.EvalResponse(transcript=txt, score=sc, pass_=sc>=THRESHOLD)

def serve():
    s = grpc.server(ThreadPoolExecutor(max_workers=8))
    voice_pb2_grpc.add_VoiceScoreServicer_to_server(Service(), s)
    s.add_insecure_port("[::]:50051")
    s.start(); s.wait_for_termination()

if __name__ == "__main__":
    serve()
