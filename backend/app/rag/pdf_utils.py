import pypdf

def extract_text_from_pdf(pdf_path: str) -> list:
    pages = []
    source_name = pdf_path.split("/")[-1].split("\\")[-1]

    try:
        with open(pdf_path, "rb") as pdf_file:
            reader = pypdf.PdfReader(pdf_file)
            total_pages = len(reader.pages)
            print(f"[pdf_utils] Found {total_pages} pages in '{source_name}'")

            for page_index in range(total_pages):
                page = reader.pages[page_index]
                text = page.extract_text()

                if text and text.strip():
                    pages.append({
                        "page_number": page_index + 1,
                        "text": text,
                        "source": source_name
                    })
                else:
                    print(f"[pdf_utils] Page {page_index + 1} is empty, skipping.")

    except FileNotFoundError:
        print(f"[pdf_utils] ERROR: Could not find file at path: {pdf_path}")
        raise
    except Exception as e:
        print(f"[pdf_utils] ERROR while reading PDF: {e}")
        raise

    print(f"[pdf_utils] Successfully extracted text from {len(pages)} pages.")
    return pages