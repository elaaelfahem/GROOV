import os
import json
import numpy as np
import faiss

from app.rag.embeddings import embed_query

INDEX_PATH    = "data/index/faiss.index"
METADATA_PATH = "data/metadata/chunks.json"


def load_index_and_metadata():
    if not os.path.exists(INDEX_PATH):
        raise FileNotFoundError(
            "FAISS index not found. Please upload and ingest at least one PDF first."
        )

    if not os.path.exists(METADATA_PATH):
        raise FileNotFoundError(
            "Metadata file not found. Please upload and ingest at least one PDF first."
        )

    index = faiss.read_index(INDEX_PATH)
    print(f"[retrieve] Loaded FAISS index with {index.ntotal} vectors.")

    with open(METADATA_PATH, "r", encoding="utf-8") as f:
        metadata = json.load(f)
    print(f"[retrieve] Loaded {len(metadata)} chunk metadata entries.")

    return index, metadata


def retrieve(query: str, top_k: int = 5) -> list:
    index, metadata = load_index_and_metadata()

    query_vector = embed_query(query)
    query_vector = np.array(query_vector, dtype=np.float32)

    distances, indices = index.search(query_vector, top_k)

    distances = distances[0]
    indices   = indices[0]

    results = []

    for rank, (idx, dist) in enumerate(zip(indices, distances)):
        if idx == -1:
            continue

        chunk = metadata[idx]

        results.append({
            "rank":        rank + 1,
            "score":       float(dist),
            "chunk_id":    chunk["chunk_id"],
            "text":        chunk["text"],
            "source":      chunk["source"],
            "page_number": chunk["page_number"]
        })

    print(f"[retrieve] Returning {len(results)} results for query: '{query}'")
    return results