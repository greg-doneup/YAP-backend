import re, numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer

# Initialize vectorizer without pre-fitting
_vectorizer = TfidfVectorizer(analyzer="char", ngram_range=(2,3), stop_words=None)

def _clean(t: str) -> str: return re.sub(r"[^a-z]+", "", t.lower())

def similarity(a: str, b: str) -> float:
    # Make sure we have non-empty strings after cleaning
    clean_a = _clean(a)
    clean_b = _clean(b)
    
    # Handle edge cases
    if not clean_a or not clean_b:
        return 0.0 if clean_a != clean_b else 1.0
        
    # Fit and transform in the same call with actual data
    vec = _vectorizer.fit_transform([clean_a, clean_b]).toarray()
    return float(np.dot(vec[0], vec[1]) /
                (np.linalg.norm(vec[0])*np.linalg.norm(vec[1]) + 1e-9))
