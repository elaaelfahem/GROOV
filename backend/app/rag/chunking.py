import re

def clean_text(text: str) -> str:
    text = re.sub(r'[\n\t\r]+', ' ', text)
    text = re.sub(r' +', ' ', text)
    text = text.strip()
    return text

def chunk_text(pages: list, chunk_size: int = 500, overlap: int = 50) -> list:
    all_chunks = []

    for page in pages:
        source = page["source"]
        page_number = page["page_number"]
        raw_text = page["text"]

        cleaned = clean_text(raw_text)

        if not cleaned:
            continue

        chunk_index = 0
        start = 0

        while start < len(cleaned):
            end = start + chunk_size
            chunk_text_content = cleaned[start:end]

            chunk_id = f"{source}_p{page_number}_c{chunk_index}"

            all_chunks.append({
                "chunk_id": chunk_id,
                "text": chunk_text_content,
                "source": source,
                "page_number": page_number
            })

            start += chunk_size - overlap
            chunk_index += 1

    print(f"[chunking] Created {len(all_chunks)} chunks total.")
    return all_chunks