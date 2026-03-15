import os
import json
import numpy as np
import faiss

from app.rag.pdf_utils import extract_text_from_pdf
from app.rag.chunking import chunk_text
from app.rag.embeddings import embed_chunks

INDEX_PATH    = "data/index/faiss.index"
METADATA_PATH = "data/metadata/chunks.json"


def load_existing_data():
    if os.path.exists(METADATA_PATH):
        with open(METADATA_PATH, "r", encoding="utf-8") as f:
            metadata = json.load(f)
        print(f"[ingest] Loaded {len(metadata)} existing chunks from metadata.")
    else:
        metadata = []
        print("[ingest] No existing metadata found. Starting fresh.")

    if os.path.exists(INDEX_PATH):
        index = faiss.read_index(INDEX_PATH)
        print(f"[ingest] Loaded existing FAISS index with {index.ntotal} vectors.")
    else:
        index = None
        print("[ingest] No existing FAISS index found. Will create a new one.")

    return index, metadata


def save_data(index, metadata: list):
    os.makedirs(os.path.dirname(INDEX_PATH), exist_ok=True)
    os.makedirs(os.path.dirname(METADATA_PATH), exist_ok=True)

    faiss.write_index(index, INDEX_PATH)
    print(f"[ingest] FAISS index saved to '{INDEX_PATH}'.")

    with open(METADATA_PATH, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)
    print(f"[ingest] Metadata saved to '{METADATA_PATH}'.")


def ingest_pdf(pdf_path: str):
    print(f"\n[ingest] Starting ingestion for: {pdf_path}")

    pages = extract_text_from_pdf(pdf_path)

    if not pages:
        print("[ingest] WARNING: No text was extracted from this PDF. Aborting.")
        return

    chunks = chunk_text(pages, chunk_size=500, overlap=50)

    if not chunks:
        print("[ingest] WARNING: No chunks were created. Aborting.")
        return

    embeddings = embed_chunks(chunks)
    embeddings = np.array(embeddings, dtype=np.float32)

    index, metadata = load_existing_data()

    embedding_dim = embeddings.shape[1]

    if index is None:
        index = faiss.IndexFlatL2(embedding_dim)
        print(f"[ingest] Created new FAISS index with dimension {embedding_dim}.")

    index.add(embeddings)
    print(f"[ingest] Added {len(embeddings)} vectors. Index now has {index.ntotal} total.")

    metadata.extend(chunks)

    save_data(index, metadata)

    print(f"[ingest] Ingestion complete for '{pdf_path}'.")