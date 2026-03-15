from sentence_transformers import SentenceTransformer
import numpy as np

MODEL_NAME = "all-MiniLM-L6-v2"

print(f"[embeddings] Loading embedding model '{MODEL_NAME}'...")
model = SentenceTransformer(MODEL_NAME)
print(f"[embeddings] Model loaded successfully.")


def embed_chunks(chunks: list) -> np.ndarray:
    texts = [chunk["text"] for chunk in chunks]
    print(f"[embeddings] Generating embeddings for {len(texts)} chunks...")
    embeddings = model.encode(texts, convert_to_numpy=True, show_progress_bar=True)
    print(f"[embeddings] Done. Embedding shape: {embeddings.shape}")
    return embeddings


def embed_query(query: str) -> np.ndarray:
    print(f"[embeddings] Embedding query: '{query}'")
    embedding = model.encode([query], convert_to_numpy=True)
    return embedding