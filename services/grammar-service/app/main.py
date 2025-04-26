from fastapi import FastAPI, HTTPException
from .schemas import EvalRequest, EvalResponse
from .grammar import evaluate

app = FastAPI(title="Grammar Service", version="0.1.0")

@app.post("/grammar/evaluate", response_model=EvalResponse)
def grammar_eval(req: EvalRequest):
    try:
        corrected, score, issues = evaluate(req.text, req.lang)
        return EvalResponse(corrected=corrected, score=score, issues=issues)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/healthz")
def health():
    return "ok"
