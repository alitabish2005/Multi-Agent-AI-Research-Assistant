import os
from typing import List, Dict, Any
from pypdf import PdfReader

def extract_text_from_pdf(file_path: str, max_pages: int = 20) -> List[Dict[str, Any]]:
    """Extracts text content page-by-page from an uploaded PDF document."""
    chunks = []
    file_name = os.path.basename(file_path)
    try:
        reader = PdfReader(file_path)
        total_pages = min(len(reader.pages), max_pages)
        for page_idx in range(total_pages):
            page = reader.pages[page_idx]
            text = (page.extract_text() or "").strip()
            if len(text) > 40:
                chunks.append({
                    "id": f"doc_p{page_idx + 1}",
                    "title": f"{file_name} (Page {page_idx + 1})",
                    "url": f"local://{file_name}#page={page_idx + 1}",
                    "content": text[:2000],
                    "source_type": "document"
                })
    except Exception as e:
        print(f"Error parsing PDF '{file_path}': {e}")
        chunks.append({
            "id": "doc_error",
            "title": f"{file_name} (Parsing Notice)",
            "url": f"local://{file_name}",
            "content": f"Notice: Error reading PDF text: {str(e)}",
            "source_type": "document"
        })
    return chunks

def extract_content_from_image(file_path: str) -> List[Dict[str, Any]]:
    """Extracts visual and text content from photos, diagrams, and screenshots using Gemini vision."""
    file_name = os.path.basename(file_path)
    ext = os.path.splitext(file_path)[1].lower().replace(".", "")
    mime_type = f"image/{ext}" if ext != "jpg" else "image/jpeg"
    
    # Try multimodal extraction with Gemini
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if api_key:
        try:
            import google.genai as genai
            from google.genai import types
            
            client = genai.Client(api_key=api_key)
            model_name = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
            
            with open(file_path, "rb") as f:
                img_bytes = f.read()
                
            prompt = (
                "You are an academic research assistant analyzing an attached image for a research swarm. "
                "Provide a comprehensive, highly detailed breakdown of this image: "
                "1. Transcribe any visible text, code snippets, equations, tables, labels, and citations verbatim. "
                "2. If it is an architecture, system diagram, or flowchart, explain each module, connection, and data flow. "
                "3. If it is a plot, benchmark, or chart, extract all axes, metrics, baseline comparisons, and numerical data. "
                "4. Summarize key technical insights for the research team."
            )
            
            response = client.models.generate_content(
                model=model_name,
                contents=[
                    types.Part.from_bytes(data=img_bytes, mime_type=mime_type),
                    prompt
                ]
            )
            analysis = response.text.strip() if response.text else ""
            if analysis:
                return [{
                    "id": f"img_{file_name}",
                    "title": f"📸 {file_name} (Visual & Diagram Analysis)",
                    "url": f"local://{file_name}",
                    "content": analysis,
                    "source_type": "image"
                }]
        except Exception as e:
            print(f"Error analyzing image '{file_path}' with Gemini: {e}")
            
    # Fallback to image metadata
    file_size_kb = os.path.getsize(file_path) / 1024
    return [{
        "id": f"img_{file_name}",
        "title": f"📸 {file_name} (Image)",
        "url": f"local://{file_name}",
        "content": f"Uploaded Image: {file_name} ({ext.upper()}, {file_size_kb:.1f} KB). Image attached for research context.",
        "source_type": "image"
    }]

def extract_content_from_audio(file_path: str) -> List[Dict[str, Any]]:
    """Transcribes uploaded audio files (voice notes, interviews, recordings) using Gemini STT."""
    file_name = os.path.basename(file_path)
    ext = os.path.splitext(file_path)[1].lower().replace(".", "")
    mime_type = f"audio/{ext}" if ext != "mp3" else "audio/mpeg"
    
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if api_key:
        try:
            import google.genai as genai
            from google.genai import types
            
            client = genai.Client(api_key=api_key)
            model_name = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
            
            with open(file_path, "rb") as f:
                audio_bytes = f.read()
                
            prompt = "Transcribe this audio recording into clean, structured English academic research notes with speakers and key timestamps if discernible."
            response = client.models.generate_content(
                model=model_name,
                contents=[
                    types.Part.from_bytes(data=audio_bytes, mime_type=mime_type),
                    prompt
                ]
            )
            transcript = response.text.strip() if response.text else ""
            if transcript:
                return [{
                    "id": f"audio_{file_name}",
                    "title": f"🎵 {file_name} (Audio Transcript)",
                    "url": f"local://{file_name}",
                    "content": transcript,
                    "source_type": "audio"
                }]
        except Exception as e:
            print(f"Error transcribing audio '{file_path}': {e}")
            
    file_size_mb = os.path.getsize(file_path) / (1024 * 1024)
    return [{
        "id": f"audio_{file_name}",
        "title": f"🎵 {file_name} (Audio Recording)",
        "url": f"local://{file_name}",
        "content": f"Uploaded Audio File: {file_name} ({ext.upper()}, {file_size_mb:.2f} MB).",
        "source_type": "audio"
    }]

def extract_content_from_video(file_path: str) -> List[Dict[str, Any]]:
    """Processes uploaded video media files."""
    file_name = os.path.basename(file_path)
    ext = os.path.splitext(file_path)[1].lower().replace(".", "")
    file_size_mb = os.path.getsize(file_path) / (1024 * 1024)
    
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    # For small videos (<25MB), attempt direct multimodal video analysis
    if api_key and file_size_mb < 25:
        try:
            import google.genai as genai
            from google.genai import types
            client = genai.Client(api_key=api_key)
            model_name = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
            mime_type = f"video/{ext}" if ext in ("mp4", "webm") else "video/mp4"
            with open(file_path, "rb") as f:
                video_bytes = f.read()
            prompt = "Analyze this attached research video. Summarize key visual events, slides, experiments, diagrams, or presentations shown."
            response = client.models.generate_content(
                model=model_name,
                contents=[
                    types.Part.from_bytes(data=video_bytes, mime_type=mime_type),
                    prompt
                ]
            )
            if response.text:
                return [{
                    "id": f"video_{file_name}",
                    "title": f"🎥 {file_name} (Video Analysis)",
                    "url": f"local://{file_name}",
                    "content": response.text.strip(),
                    "source_type": "video"
                }]
        except Exception as e:
            print(f"Error analyzing video '{file_path}': {e}")
            
    return [{
        "id": f"video_{file_name}",
        "title": f"🎥 {file_name} (Video Media)",
        "url": f"local://{file_name}",
        "content": f"Uploaded Video File: {file_name} ({ext.upper()}, {file_size_mb:.2f} MB). Attached for research reference.",
        "source_type": "video"
    }]

def extract_content_from_ipynb(file_path: str) -> List[Dict[str, Any]]:
    """Extracts Markdown documentation, Python code cells, and execution outputs from Jupyter Notebooks."""
    import json
    file_name = os.path.basename(file_path)
    try:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            nb = json.load(f)
        
        cells = nb.get("cells", [])
        if not cells:
            return []
            
        chunks = []
        current_block = []
        cell_idx = 0
        
        for idx, cell in enumerate(cells):
            cell_type = cell.get("cell_type", "unknown")
            source = cell.get("source", "")
            if isinstance(source, list):
                source = "".join(source)
            source = source.strip()
            if not source:
                continue
                
            cell_text = f"### [{cell_type.upper()} Cell {idx + 1}]\n"
            if cell_type == "code":
                cell_text += f"```python\n{source}\n```"
                outputs = cell.get("outputs", [])
                out_texts = []
                for out in outputs:
                    if "text" in out:
                        t = out["text"]
                        out_texts.append("".join(t) if isinstance(t, list) else str(t))
                    elif "data" in out and "text/plain" in out["data"]:
                        t = out["data"]["text/plain"]
                        out_texts.append("".join(t) if isinstance(t, list) else str(t))
                if out_texts:
                    combined_out = "\n".join(out_texts).strip()
                    if combined_out:
                        cell_text += f"\n*Execution Output:*\n```\n{combined_out[:500]}\n```"
            else:
                cell_text += source
                
            current_block.append(cell_text)
            
            combined_len = sum(len(c) for c in current_block)
            if combined_len >= 2000 or idx == len(cells) - 1:
                cell_idx += 1
                chunks.append({
                    "id": f"ipynb_sec_{cell_idx}",
                    "title": f"📙 {file_name} (Notebook Section {cell_idx})",
                    "url": f"local://{file_name}#cell={idx + 1}",
                    "content": "\n\n".join(current_block),
                    "source_type": "document"
                })
                current_block = []
                
        return chunks
    except Exception as e:
        print(f"Error parsing Jupyter Notebook '{file_path}': {e}")
        return [{
            "id": "ipynb_error",
            "title": f"📙 {file_name} (Notebook)",
            "url": f"local://{file_name}",
            "content": f"Notice: Error reading Jupyter Notebook structure: {str(e)}",
            "source_type": "document"
        }]

def extract_content_from_docx(file_path: str) -> List[Dict[str, Any]]:
    """Extracts text and tables from Word (.docx) documents."""
    file_name = os.path.basename(file_path)
    try:
        import docx
        doc = docx.Document(file_path)
        paragraphs = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
        for table in doc.tables:
            for row in table.rows:
                row_text = " | ".join(cell.text.strip() for cell in row.cells if cell.text.strip())
                if row_text:
                    paragraphs.append(row_text)
                    
        full_text = "\n\n".join(paragraphs)
        if not full_text:
            return []
            
        chunk_size = 1800
        chunks = []
        for i in range(0, min(len(full_text), 20000), chunk_size):
            chunk_text = full_text[i:i + chunk_size]
            sec = (i // chunk_size) + 1
            chunks.append({
                "id": f"docx_sec_{sec}",
                "title": f"📘 {file_name} (Section {sec})",
                "url": f"local://{file_name}#sec={sec}",
                "content": chunk_text,
                "source_type": "document"
            })
        return chunks
    except Exception as e:
        print(f"Error reading docx '{file_path}': {e}")
        return []

def extract_content_from_excel(file_path: str) -> List[Dict[str, Any]]:
    """Extracts sheets and tabular data from Excel (.xlsx, .xls) files."""
    file_name = os.path.basename(file_path)
    try:
        import openpyxl
        wb = openpyxl.load_workbook(file_path, data_only=True)
        chunks = []
        for sheet_idx, sheet in enumerate(wb.worksheets[:5]):
            rows = []
            for row in list(sheet.iter_rows(values_only=True))[:100]:
                valid_cells = [str(c).strip() for c in row if c is not None and str(c).strip()]
                if valid_cells:
                    rows.append(" | ".join(valid_cells))
            if rows:
                chunks.append({
                    "id": f"excel_sheet_{sheet_idx + 1}",
                    "title": f"📗 {file_name} (Sheet: {sheet.title})",
                    "url": f"local://{file_name}#sheet={sheet.title}",
                    "content": f"Sheet '{sheet.title}':\n" + "\n".join(rows[:60]),
                    "source_type": "document"
                })
        return chunks
    except Exception as e:
        print(f"Error reading Excel spreadsheet '{file_path}': {e}")
        return []

def extract_text_from_file(file_path: str) -> List[Dict[str, Any]]:
    """Extracts content from PDF, notebooks, docx, excel, images, videos, audio, or text documents."""
    ext = os.path.splitext(file_path)[1].lower()
    file_name = os.path.basename(file_path)
    
    # 1. PDFs
    if ext == ".pdf":
        return extract_text_from_pdf(file_path)
        
    # 2. Jupyter Notebooks (.ipynb)
    if ext == ".ipynb":
        return extract_content_from_ipynb(file_path)
        
    # 3. Word Documents (.docx)
    if ext in (".docx", ".doc"):
        return extract_content_from_docx(file_path)
        
    # 4. Excel Spreadsheets (.xlsx, .xls)
    if ext in (".xlsx", ".xls"):
        return extract_content_from_excel(file_path)
    
    # 5. Photos & Images
    if ext in (".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".svg", ".tiff", ".heic"):
        return extract_content_from_image(file_path)
        
    # 6. Audio files
    if ext in (".mp3", ".wav", ".m4a", ".webm", ".ogg", ".flac", ".aac"):
        return extract_content_from_audio(file_path)
        
    # 7. Video files
    if ext in (".mp4", ".mov", ".mkv", ".avi", ".wmv"):
        return extract_content_from_video(file_path)
    
    # 8. Text, code, and structured data
    code_and_text_exts = (
        ".txt", ".md", ".csv", ".tsv", ".json", ".log", ".py", ".js", ".ts",
        ".html", ".css", ".yaml", ".yml", ".xml", ".sql", ".sh", ".bash",
        ".r", ".c", ".cpp", ".h", ".hpp", ".java", ".kt", ".rs", ".go",
        ".rb", ".php", ".swift", ".m", ".scala", ".env", ".toml", ".ini",
        ".rst", ".tex", ".bib"
    )
    if ext in code_and_text_exts:
        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read().strip()
            if content:
                chunk_size = 1800
                chunks = []
                for i in range(0, min(len(content), 24000), chunk_size):
                    chunk_text = content[i:i + chunk_size]
                    section_num = (i // chunk_size) + 1
                    chunks.append({
                        "id": f"doc_sec_{section_num}",
                        "title": f"📄 {file_name} (Section {section_num})",
                        "url": f"local://{file_name}#sec={section_num}",
                        "content": chunk_text,
                        "source_type": "document"
                    })
                return chunks
        except Exception as e:
            print(f"Error reading text file '{file_path}': {e}")
            
    # 9. Safe universal text fallback (attempt utf-8 read)
    try:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            sample = f.read(4096)
            if sample and "\x00" not in sample:
                f.seek(0)
                content = f.read(20000).strip()
                if content:
                    return [{
                        "id": "doc_sec_1",
                        "title": f"📄 {file_name}",
                        "url": f"local://{file_name}",
                        "content": content[:3000],
                        "source_type": "document"
                    }]
    except Exception:
        pass
            
    return []

def load_uploaded_documents(file_paths: List[str]) -> List[Dict[str, Any]]:
    """Loads and formats all uploaded files into RAG evidence chunks."""
    all_chunks = []
    for path in file_paths:
        if os.path.exists(path):
            chunks = extract_text_from_file(path)
            all_chunks.extend(chunks)
    return all_chunks
