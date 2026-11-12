import os
import uuid
import tempfile
from typing import List, Dict, Any
import chainlit as cl
from chainlit.server import app as fastapi_app
from fastapi import UploadFile, File
from fastapi.responses import JSONResponse, Response
from dotenv import load_dotenv
from langgraph.checkpoint.memory import MemorySaver
from src.graph import create_research_graph
from src.utils.exporter import export_report_to_pdf
from src.utils.document_loader import load_uploaded_documents

load_dotenv()

# Initialize LangGraph for fully autonomous, uninterrupted multi-agent research
research_graph = create_research_graph()

# ─────────────────── Voice Assistant Speech-to-Text Fallback ───────────────────
@fastapi_app.post("/api/voice/transcribe")
async def transcribe_voice(file: UploadFile = File(...)):
    """Transcribes user voice queries via Google Gemini as an accurate speech-to-text fallback."""
    try:
        import re
        audio_bytes = await file.read()
        if not audio_bytes or len(audio_bytes) < 300:
            return JSONResponse({"text": "", "error": "Audio clip too short or empty", "success": False}, status_code=400)
            
        import google.genai as genai
        from google.genai import types
        api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        if not api_key:
            return JSONResponse({"text": "", "error": "Gemini API key not configured", "success": False}, status_code=500)
            
        client = genai.Client(api_key=api_key)
        model_name = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
        
        mime_type = file.content_type or "audio/webm"
        if ";" in mime_type:
            mime_type = mime_type.split(";")[0].strip()
            
        prompt = (
            "You are an expert speech recognition model. Transcribe the spoken audio query verbatim into clean, accurate English text.\n"
            "CRITICAL INSTRUCTIONS:\n"
            "1. Output ONLY the exact transcribed speech without any quotes, explanations, or metadata.\n"
            "2. If the audio is silent, inaudible, or contains only background noise, breathing, static, or hum, return EXACTLY empty string: \"\"\n"
            "3. DO NOT return '<noise>', '[noise]', '<silence>', or any sound event labels.\n"
            "4. Transcribe accurately even if the user speaks with an accent or conversational cadence."
        )

        response = client.models.generate_content(
            model=model_name,
            contents=[
                types.Part.from_bytes(data=audio_bytes, mime_type=mime_type),
                prompt
            ]
        )
        raw_text = response.text.strip() if response.text else ""
        
        # Clean noise or sound event labels
        clean_text = raw_text.strip()
        clean_text = re.sub(r"^[<\[(]?(?:noise|silence|music|inaudible|whispering|laughter|sigh)[>\])]?", "", clean_text, flags=re.IGNORECASE).strip()
        clean_text = clean_text.strip("\"'").strip()
        
        # Check against common noise artifacts
        if clean_text.lower() in ("<noise>", "[noise]", "(noise)", "noise", "<silence>", "silence", "inaudible", "none"):
            clean_text = ""
            
        return JSONResponse({"text": clean_text, "success": True})
    except Exception as e:
        print(f"[Voice STT Error]: {e}")
        return JSONResponse({"text": "", "error": str(e), "success": False}, status_code=500)

@fastapi_app.get("/public/custom.js")
async def get_custom_js():
    """Serves the latest voice assistant JavaScript with strict anti-caching headers."""
    js_path = os.path.join(os.path.dirname(__file__), "public", "custom.js")
    if os.path.exists(js_path):
        with open(js_path, "r", encoding="utf-8") as f:
            content = f.read()
        return Response(
            content=content,
            media_type="application/javascript",
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
                "Pragma": "no-cache",
                "Expires": "0",
            },
        )
    return Response(status_code=404)


@fastapi_app.get("/public/custom.css")
async def get_custom_css():
    """Serves the latest CSS with strict anti-caching headers."""
    css_path = os.path.join(os.path.dirname(__file__), "public", "custom.css")
    if os.path.exists(css_path):
        with open(css_path, "r", encoding="utf-8") as f:
            content = f.read()
        return Response(
            content=content,
            media_type="text/css",
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
                "Pragma": "no-cache",
                "Expires": "0",
            },
        )
    return Response(status_code=404)


@cl.on_chat_start
async def on_chat_start():
    cl.user_session.set("history", [])
    cl.user_session.set("thread_id", str(uuid.uuid4()))


@cl.on_message
async def on_message(message: cl.Message):
    user_query = message.content.strip() if message.content else ""
    uploaded_docs = []
    
    if message.elements:
        file_paths = []
        for el in message.elements:
            if hasattr(el, "path") and el.path and os.path.exists(el.path):
                file_paths.append(el.path)
            elif hasattr(el, "content") and el.content:
                try:
                    temp_dir = tempfile.gettempdir()
                    fname = getattr(el, "name", "uploaded_document")
                    temp_path = os.path.join(temp_dir, f"{uuid.uuid4().hex[:8]}_{fname}")
                    content = el.content
                    if isinstance(content, str):
                        with open(temp_path, "w", encoding="utf-8") as f:
                            f.write(content)
                    elif isinstance(content, bytes):
                        with open(temp_path, "wb") as f:
                            f.write(content)
                    file_paths.append(temp_path)
                except Exception as ex:
                    print(f"Error persisting uploaded file in memory to disk: {ex}")
                    
        if file_paths:
            uploaded_docs = load_uploaded_documents(file_paths)
            
    if uploaded_docs:
        doc_names = list({d.get("title", "").split("(")[0].replace("📙", "").replace("📄", "").replace("📘", "").replace("📗", "").strip() for d in uploaded_docs if d.get("title")})
        doc_list_str = ", ".join(doc_names) if doc_names else "attached file"
        
        # If user didn't enter a query, or entered generic text like 'explain this to me'
        generic_prompts = {"", "explain this to me", "explain this", "what is this", "summarize this", "analyze this", "explain", "analyze", "break this down", "help me understand this", "tell me about this"}
        if not user_query or user_query.lower().strip() in generic_prompts:
            user_query = f"Provide a comprehensive technical analysis, architectural breakdown, and in-depth explanation of the uploaded document ({doc_list_str})"
        
    await execute_workflow(user_query, uploaded_docs=uploaded_docs)

async def execute_workflow(user_query: str, uploaded_docs: List[dict] = None):
    uploaded_docs = uploaded_docs or []
    history = cl.user_session.get("history") or []
    run_thread_id = str(uuid.uuid4())
    config = {"configurable": {"thread_id": run_thread_id}}
    
    initial_state = {
        "query": user_query,
        "intent": "research",
        "intent_reasoning": "",
        "plan": [],
        "raw_findings": [],
        "verified_findings": [],
        "critic_evaluation": None,
        "retry_count": 0,
        "final_report": "",
        "citations": [],
        "uploaded_docs": uploaded_docs,
        "history": history
    }
    
    current_state = dict(initial_state)
    root_step = None
    
    try:
        async for event in research_graph.astream(initial_state):
            for node_name, node_output in event.items():
                if isinstance(node_output, dict):
                    current_state.update(node_output)
                
                if node_name == "router":
                    intent = current_state.get("intent", "research")
                    reasoning = current_state.get("intent_reasoning", "")
                    
                    if intent == "research":
                        root_step = cl.Step(name="🚀 Autonomous Multi-Agent Swarm")
                        await root_step.send()
                        
                        scoped = current_state.get("query", user_query)
                        async with cl.Step(name="🧠 0. Intent Triage & Scoping Agent", parent_id=root_step.id) as step:
                            step.output = (
                                f"**Status:** ✅ Confirmed Research Topic\n\n"
                                f"**Analysis:** {reasoning}\n\n"
                                f"**Scoped Problem:** `{scoped}`"
                            )

                elif node_name == "planner":
                    parent_id = root_step.id if root_step else None
                    async with cl.Step(name="🧭 1. Orchestrator / Planner Agent", parent_id=parent_id) as step:
                        tasks = current_state.get("plan", [])
                        plan_md = "\n".join([
                            f"- **`[{t.get('source_type', 'web').upper()}]`** {t.get('topic')}"
                            for t in tasks
                        ])
                        step.output = f"Decomposed inquiry into **{len(tasks)} targeted investigation tracks**:\n\n{plan_md}"

                elif node_name == "researcher":
                    parent_id = root_step.id if root_step else None
                    async with cl.Step(name="🔎 2. Parallel Researcher Agent", parent_id=parent_id) as step:
                        findings = current_state.get("raw_findings", [])
                        doc_count = sum(1 for f in findings if f.get('source_type') == 'document')
                        arxiv_count = sum(1 for f in findings if f.get('source_type') == 'arxiv')
                        web_count = sum(1 for f in findings if f.get('source_type') == 'web')
                        
                        output_lines = ["Concurrently queried local documents, academic papers, and live web:"]
                        if doc_count > 0:
                            output_lines.append(f"- 📂 **Local Documents:** `{doc_count}` sections indexed")
                        output_lines.append(f"- 📄 **arXiv Pre-prints:** `{arxiv_count}` papers retrieved")
                        output_lines.append(f"- 🌐 **Live Web & Encyclopedia:** `{web_count}` sources retrieved")
                        output_lines.append(f"- 📊 **Total Evidence Pool:** `{len(findings)}` citations collected")
                        
                        step.output = "\n".join(output_lines)
                
                elif node_name == "critic":
                    parent_id = root_step.id if root_step else None
                    async with cl.Step(name="⚖️ 3. Verification & Critic Agent", parent_id=parent_id) as step:
                        critique = current_state.get("critic_evaluation", {})
                        passed = critique.get("is_sufficient", True)
                        status_badge = (
                            "✅ **Factual Consistency & Coverage Check Passed**"
                            if passed else
                            "🔄 **Critic Loop Activated: Additional evidence required — Triggering targeted re-search**"
                        )
                        feedback = critique.get('critique', 'Findings verified and consistent across sources.')
                        refinements = critique.get('refinement_queries', [])
                        
                        out_text = f"**Verification Status:**\n{status_badge}\n\n**Critic Analysis:**\n{feedback}"
                        if refinements:
                            out_text += "\n\n**Directed Follow-up Searches:**\n" + "\n".join([f"- `{q}`" for q in refinements])
                        step.output = out_text
                
                elif node_name == "synthesis":
                    parent_id = root_step.id if root_step else None
                    async with cl.Step(name="✍️ 4. Synthesis & Technical Writer Agent", parent_id=parent_id) as step:
                        step.output = "Authored publication-grade academic report with numbered citations and comprehensive bibliography."

        if root_step:
            root_step.output = "✅ Multi-agent research pipeline completed successfully."
            await root_step.update()

        intent = current_state.get("intent", "research")
        
        # If conversational / direct QA / follow-up, answer directly without research report
        if intent in ("conversational", "direct_qa", "follow_up"):
            reply_text = current_state.get("final_report", "Response ready.")
            await cl.Message(content=reply_text).send()
            
            history.append({"role": "user", "content": user_query})
            history.append({"role": "assistant", "content": reply_text})
            cl.user_session.set("history", history)
            return

    except Exception as e:
        await cl.Message(
            content=f"⚠️ **Processing Notice:** An error or service interruption occurred: `{e}`. Please try your prompt again."
        ).send()
        return

    # ───────────────── PDF Generation & Final Attachments ─────────────────
    final_report = current_state.get("final_report", "Research completed.")
    elements = []
    try:
        temp_dir = tempfile.gettempdir()
        safe_name = "".join(x for x in user_query[:30] if x.isalnum() or x in " _-").strip() or "Research"
        pdf_path = os.path.join(temp_dir, f"Research_Report_{safe_name}.pdf")
        export_report_to_pdf(final_report, pdf_path)
        elements.append(
            cl.File(
                name=f"Research_Report_{safe_name}.pdf",
                path=pdf_path,
                display="inline"
            )
        )
    except Exception as e:
        print(f"Error creating PDF: {e}")

    # If message was already token-streamed live, send the downloadable PDF file attachment
    streamed_msg = current_state.get("_streamed_msg")
    if streamed_msg:
        if elements:
            await cl.Message(
                content="📥 **Download Publication Report (PDF):**",
                elements=elements
            ).send()
    else:
        await cl.Message(content=final_report, elements=elements).send()

    # Update conversation history for conversational follow-ups
    history.append({"role": "user", "content": user_query})
    history.append({"role": "assistant", "content": final_report[:1200]})
    cl.user_session.set("history", history)
