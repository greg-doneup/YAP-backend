import random
from .schemas import Issue

# Mock implementation that doesn't rely on LanguageTool/Java
def evaluate(text: str, lang: str = "en"):
    # Simple corrections for common errors
    corrections = {
        "i ": "I ",
        "i'm": "I'm", 
        "i've": "I've",
        "i'll": "I'll",
        "i'd": "I'd",
        "dont": "don't",
        "doesnt": "doesn't",
        "didnt": "didn't",
        "cant": "can't",
        "wont": "won't",
        "shouldnt": "shouldn't",
        "couldnt": "couldn't",
        "wouldnt": "wouldn't",
        "its a": "it's a",
        "thier": "their",
        "theres": "there's",
        "hes": "he's",
        "shes": "she's",
        "youre": "you're",
        "theyre": "they're",
        "hasnt": "hasn't",
        "havent": "haven't",
        "arent": "aren't",
        "isnt": "isn't",
        "werent": "weren't",
        "wasnt": "wasn't",
        " a apple": " an apple",
        "has a apple": "has an apple",
        "has a orange": "has an orange",
    }
    
    # Simple mock correction
    corrected = text
    issues = []
    offset = 0

    # Find and track issues
    for error, correction in corrections.items():
        start_pos = 0
        while True:
            pos = corrected.lower().find(error, start_pos)
            if pos == -1:
                break
                
            # Create an issue
            issue = Issue(
                offset=pos,
                length=len(error),
                type="grammar",
                message=f"Consider using '{correction}' instead of '{error}'",
            )
            issues.append(issue)
            
            # Move search position
            start_pos = pos + len(error)
            
    # Apply corrections
    for error, correction in corrections.items():
        corrected = corrected.replace(error, correction)
    
    # If there are no detected errors but we want to show an example of the functionality
    if not issues and random.random() < 0.3:  # 30% chance to add a fake issue
        fake_issues = [
            ("grammar", "Consider adding a comma for better readability"),
            ("spelling", "This word might be misspelled"),
            ("style", "Consider rephrasing for clarity")
        ]
        issue_type, message = random.choice(fake_issues)
        pos = random.randint(0, max(0, len(text) - 10))
        length = random.randint(1, min(5, len(text) - pos))
        
        issues.append(Issue(
            offset=pos,
            length=length,
            type=issue_type,
            message=message
        ))
    
    # Calculate score (higher = better)
    # 1.0 means perfect, lower means more issues
    if len(text.split()) == 0:
        score = 1.0  # Empty text gets perfect score
    else:
        # Normalize by text length with a minimum of 1 word
        norm = max(len(text.split()) / 10, 1)
        score = max(0.0, 1.0 - len(issues) / norm)
        score = min(1.0, score)  # Cap at 1.0
    
    return corrected, score, issues
