import httpx
import time

payload = {
    "session_id": "bench-2",
    "topic": "photosynthesis",
    "mode": "quick_review",
    "user_message": "What is photosynthesis?",
}

print("Testing quick_review mode (2 personas)...")
start = time.time()
r = httpx.post("http://localhost:8000/session/respond", json=payload, timeout=300)
total = time.time() - start

data = r.json()
n = len(data["responses"])
print(f"\n=== TOTAL TIME: {total:.1f} seconds ===")
print(f"=== PERSONAS: {n} | AVG PER PERSONA: {total / n:.1f}s ===\n")

for resp in data["responses"]:
    snippet = resp["text"][:120].replace("\n", " ")
    print(f"  [{resp['speaker'].upper()}]: {snippet}...")
    print()
