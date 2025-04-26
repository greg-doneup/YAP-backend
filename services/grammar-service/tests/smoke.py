import requests, base64, json
resp = requests.post("http://localhost:8000/grammar/evaluate",
                     json={"text": "I has a apple", "lang": "en"})
print(json.dumps(resp.json(), indent=2))
