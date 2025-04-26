from pydantic import BaseModel, Field
from typing import List, Literal, Optional, Union

class Issue(BaseModel):
    offset: int
    length: int
    type: str
    message: str

class EvalRequest(BaseModel):
    text: str = Field(..., example="I has a apple")
    lang: str = Field("en", example="en")         # ISO code
    level: Optional[Literal["A1","A2","B1","B2","C1","C2"]] = None  # future use

class EvalResponse(BaseModel):
    corrected: str
    score: float      # 0-1 quality (1 = perfect)
    issues: List[Issue]
