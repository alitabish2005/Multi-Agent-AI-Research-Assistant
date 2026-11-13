from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
                                PageBreak, Flowable, KeepTogether)

INDIGO, CYAN, VIOLET, DARK = colors.HexColor("#4f46e5"), colors.HexColor("#0891b2"), colors.HexColor("#7c3aed"), colors.HexColor("#0f172a")
GREY = colors.HexColor("#475569")
ss = getSampleStyleSheet()
H1 = ParagraphStyle("H1", parent=ss["Heading1"], fontSize=18, textColor=INDIGO, spaceBefore=6, spaceAfter=8)
H2 = ParagraphStyle("H2", parent=ss["Heading2"], fontSize=13, textColor=VIOLET, spaceBefore=8, spaceAfter=4)
B = ParagraphStyle("B", parent=ss["BodyText"], fontSize=10, leading=14.5, textColor=DARK)
BUL = ParagraphStyle("BUL", parent=B, leftIndent=14, bulletIndent=4, spaceAfter=2)
SM = ParagraphStyle("SM", parent=B, fontSize=8.5, leading=11, textColor=GREY)
CELL = ParagraphStyle("CELL", parent=B, fontSize=8.8, leading=11.5)
CELLH = ParagraphStyle("CELLH", parent=CELL, textColor=colors.white, fontName="Helvetica-Bold")
SCRIPT = ParagraphStyle("SCRIPT", parent=B, backColor=colors.HexColor("#eef2ff"), borderPadding=6, leftIndent=6, rightIndent=6, spaceAfter=8, fontName="Helvetica-Oblique")

def P(t, s=B): return Paragraph(t, s)
def bullets(items): return [Paragraph(i, BUL, bulletText="•") for i in items]
def table(rows, widths, head=True):
    data = [[Paragraph(str(c), CELLH if (head and r == 0) else CELL) for c in row] for r, row in enumerate(rows)]
    t = Table(data, colWidths=widths, repeatRows=1 if head else 0)
    st = [("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")), ("VALIGN", (0, 0), (-1, -1), "TOP"),
          ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
          ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]
    if head: st.append(("BACKGROUND", (0, 0), (-1, 0), INDIGO))
    t.setStyle(TableStyle(st)); return t

class Box:
    pass

class Flow(Flowable):
    """Architecture flow diagram drawn with vector shapes."""
    W, H = 17 * cm, 11.2 * cm
    def wrap(self, *a): return self.W, self.H
    def box(self, c, x, y, w, h, text, fill, sub=None):
        c.setFillColor(fill); c.setStrokeColor(fill); c.roundRect(x, y, w, h, 7, fill=1, stroke=0)
        c.setFillColor(colors.white); c.setFont("Helvetica-Bold", 8.5)
        c.drawCentredString(x + w / 2, y + h / 2 + (2 if sub else -3), text)
        if sub:
            c.setFont("Helvetica", 6.8); c.drawCentredString(x + w / 2, y + h / 2 - 8, sub)
    def arrow(self, c, x1, y1, x2, y2, label=None, col=GREY):
        c.setStrokeColor(col); c.setFillColor(col); c.setLineWidth(1.2); c.line(x1, y1, x2, y2)
        import math
        a = math.atan2(y2 - y1, x2 - x1)
        p = c.beginPath(); p.moveTo(x2, y2)
        p.lineTo(x2 - 6 * math.cos(a - .4), y2 - 6 * math.sin(a - .4))
        p.lineTo(x2 - 6 * math.cos(a + .4), y2 - 6 * math.sin(a + .4)); p.close(); c.drawPath(p, fill=1, stroke=0)
        if label:
            c.setFont("Helvetica-Oblique", 7); c.setFillColor(col); c.drawString((x1 + x2) / 2 + 4, (y1 + y2) / 2 + 2, label)
    def draw(self):
        c = self.canv; w = 5.2 * cm; h = 1.1 * cm; cx = 5.6 * cm
        ys = [10.0, 8.0, 6.0, 4.0, 2.0, 0.1]
        self.box(c, 0.2 * cm, ys[0] * cm, 4.5 * cm, h, "USER (Chainlit UI)", DARK, "text / voice / files")
        self.box(c, cx, ys[0] * cm, w, h, "1. ROUTER / TRIAGE", INDIGO, "classify intent, scope topic")
        self.box(c, cx, ys[1] * cm, w, h, "2. PLANNER", VIOLET, "2-4 sub-tasks: web/arxiv/doc")
        self.box(c, cx, ys[2] * cm, w, h, "3. RESEARCHER", CYAN, "parallel threads: Tavily, arXiv, docs")
        self.box(c, cx, ys[3] * cm, w, h, "4. CRITIC", colors.HexColor("#db2777"), "is evidence sufficient?")
        self.box(c, cx, ys[4] * cm, w, h, "5. SYNTHESIS", colors.HexColor("#059669"), "report + [1][2] citations")
        self.box(c, cx, ys[5] * cm, w, h, "OUTPUT: report + PDF", DARK, "shown in UI, downloadable")
        mid = cx + w / 2
        self.arrow(c, 4.7 * cm, (ys[0] + .55) * cm, cx, (ys[0] + .55) * cm)
        for i in range(5): self.arrow(c, mid, ys[i] * cm, mid, (ys[i + 1] + h / cm * cm) , None) if False else self.arrow(c, mid, ys[i] * cm, mid, ys[i + 1] * cm + h)
        # critic loop back to researcher
        c.setStrokeColor(colors.HexColor("#db2777")); c.setLineWidth(1.2)
        rx = cx + w + 1.0 * cm
        c.line(cx + w, (ys[3] + .55) * cm, rx, (ys[3] + .55) * cm); c.line(rx, (ys[3] + .55) * cm, rx, (ys[2] + .55) * cm)
        self.arrow(c, rx, (ys[2] + .55) * cm, cx + w, (ys[2] + .55) * cm, None, colors.HexColor("#db2777"))
        c.setFont("Helvetica-Oblique", 7); c.setFillColor(colors.HexColor("#db2777"))
        c.drawString(rx + 3, (ys[3] + 1.45) * cm, "NO: re-search"); c.drawString(rx + 3, (ys[3] + 1.1) * cm, "(retry guard)")
        # router bypass
        bx = cx + w + 3.6 * cm
        c.setStrokeColor(GREY); c.setDash(3, 2)
        c.line(cx + w, (ys[0] + .55) * cm, bx, (ys[0] + .55) * cm); c.line(bx, (ys[0] + .55) * cm, bx, (ys[5] + .55) * cm)
        c.setDash(); self.arrow(c, bx, (ys[5] + .55) * cm, cx + w, (ys[5] + .55) * cm)
        c.setFont("Helvetica-Oblique", 7); c.setFillColor(GREY)
        c.drawString(bx + 3, (ys[1] + .3) * cm, "chat / simple Q&A /"); c.drawString(bx + 3, (ys[1]) * cm, "follow-up: direct reply")
        # shared state
        c.setFillColor(colors.HexColor("#eef2ff")); c.setStrokeColor(INDIGO); c.setLineWidth(.8)
        c.roundRect(0.2 * cm, 3.0 * cm, 4.5 * cm, 3.4 * cm, 6, fill=1, stroke=1)
        c.setFillColor(INDIGO); c.setFont("Helvetica-Bold", 8); c.drawCentredString(2.45 * cm, 6.0 * cm, "SHARED STATE (AgentState)")
        c.setFillColor(DARK); c.setFont("Helvetica", 7)
        for i, t in enumerate(["query, intent, history", "plan[]", "raw_findings[]", "verified_findings[]", "critic_evaluation", "retry_count (loop guard)", "final_report, citations[]"]):
            c.drawString(0.45 * cm, (5.6 - i * .36) * cm, "- " + t)

def footer(canvas, doc):
    canvas.saveState(); canvas.setFont("Helvetica", 8); canvas.setFillColor(GREY)
    canvas.drawString(2 * cm, 1.2 * cm, "NexusAI - Multi-Agent Research Assistant | Mentor Presentation Guide")
    canvas.drawRightString(19 * cm, 1.2 * cm, f"Page {doc.page}"); canvas.restoreState()

S = []
# ---------- Title ----------
S += [Spacer(1, 3 * cm), P("<font size=34 color='#4f46e5'><b>Nexus</b></font><font size=34 color='#7c3aed'><b>AI</b></font>", ParagraphStyle("t", alignment=1, leading=40)),
      Spacer(1, .3 * cm), P("<font size=15>Autonomous Multi-Agent Research Assistant</font>", ParagraphStyle("t2", alignment=1, textColor=DARK)),
      Spacer(1, .2 * cm), P("Project explanation guide for mentor presentation", ParagraphStyle("t3", alignment=1, textColor=GREY)),
      Spacer(1, 1.2 * cm),
      table([["Tech stack", "LangGraph, Google Gemini, Tavily, arXiv API, Chainlit, ReportLab, Python"],
             ["Core idea", "A team of specialised AI agents that plan, search, verify and write a cited research report"],
             ["Key novelty", "Critic agent feedback loop, parallel retrieval, intent routing, document upload, voice input"]],
            [3.5 * cm, 13.5 * cm], head=False),
      PageBreak()]

# ---------- 1 ----------
S += [P("1. Problem Statement & Motivation", H1),
      P("A single prompt to an LLM is fast but unreliable for research. The main problems are:"),
      *bullets(["<b>Hallucination:</b> invents facts, papers and URLs that do not exist.",
                "<b>Outdated knowledge:</b> limited to its training cutoff, with no live web access.",
                "<b>No verification:</b> nobody checks whether the answer is complete or consistent.",
                "<b>Shallow coverage:</b> one pass covers only one angle of a topic.",
                "<b>No traceability:</b> the user cannot check where a claim came from."]),
      P("<b>Our solution:</b> split the job the way a human research team would. A planner decomposes the question, researchers fetch evidence in parallel, a critic reviews it (and sends it back if weak), and a writer produces a report with numbered citations.", B),
      P("Objectives", H2),
      *bullets(["Build an autonomous pipeline from a question to a cited report with no manual steps.",
                "Ground every claim in live sources (web and arXiv) or in user-uploaded documents.",
                "Add self-correction through a critic loop to reduce hallucination.",
                "Measure improvement against a single-prompt baseline.",
                "Provide a usable interface with live agent progress, history, voice and PDF export."]),
      P("<b>Say this to your mentor:</b>", H2),
      P("\"Sir, ChatGPT-style answers can hallucinate. I built a system where multiple specialised agents collaborate, much like a research team, so every claim is backed by retrieved evidence and reviewed before it reaches the user.\"", SCRIPT)]

# ---------- 2 ----------
S += [P("2. System Architecture & Flow", H1), Flow(), Spacer(1, .2 * cm),
      P("Figure 1: LangGraph state machine. Solid arrows are the research path, the pink arrow is the critic feedback loop, and the dashed arrow is the intent-router shortcut.", SM),
      P("Step-by-step flow", H2),
      table([["#", "Stage", "What happens"],
             ["0", "User input", "User types, speaks (voice) or attaches PDF, notebook, docx, excel, image, audio or video. Files are parsed into text chunks."],
             ["1", "Router / Triage", "LLM classifies intent as <i>research</i>, <i>conversational</i>, <i>direct_qa</i> or <i>follow_up</i>. Non-research queries are answered immediately; research queries get a scoped, precise topic."],
             ["2", "Planner", "Splits the topic into 2-4 sub-tasks, each tagged <i>web</i>, <i>arxiv</i> or <i>document</i> (structured output via Pydantic)."],
             ["3", "Researcher", "Runs all sub-tasks <b>in parallel</b> with ThreadPoolExecutor: Tavily web search, arXiv papers, relevant chunks of uploaded docs. Falls back to DuckDuckGo and Wikipedia if Tavily fails."],
             ["4", "Critic", "Peer-review step. Checks depth, balance, source authenticity. Returns <i>is_sufficient</i>, a critique and refinement queries."],
             ["4b", "Loop", "If insufficient and retry limit not reached, go back to Researcher with targeted queries; otherwise continue."],
             ["5", "Synthesis", "Writes the academic report with inline citations [1], [2], deduplicated references and Mermaid diagrams."],
             ["6", "Delivery", "Report rendered in Chainlit with a live agent trace; one-click PDF export; chat history saved for follow-ups."]],
            [1 * cm, 3 * cm, 13 * cm]),
      PageBreak()]

# ---------- 3 ----------
S += [P("3. The Agents in Detail", H1),
      table([["Agent", "Input", "Output", "Key technique", "File"],
             ["Router", "query, history, attached docs", "intent, reasoning, direct reply or refined topic", "Structured output (IntentClassification); conversation-aware", "src/agents/router.py"],
             ["Planner", "scoped query, doc context", "2-4 SubTask objects", "Low temperature (0.1); forces a document subtask if files are attached", "src/agents/planner.py"],
             ["Researcher", "plan, uploaded docs, critic queries", "raw_findings list", "Concurrency; keyword-scored chunk retrieval; multi-source fallback", "src/agents/researcher.py"],
             ["Critic", "findings, plan, retry_count", "CriticEvaluation", "Temperature 0.0 (deterministic); filters error and empty records", "src/agents/critic.py"],
             ["Synthesis", "verified findings, critic guidance", "final_report, citations", "Numbered sources, URL dedup, critic-guided writing", "src/agents/synthesis.py"]],
            [2.1 * cm, 3.2 * cm, 3.6 * cm, 5.3 * cm, 2.8 * cm]),
      P("Shared state and memory", H2),
      P("All agents communicate only through one typed dictionary, <b>AgentState</b> (<i>src/schemas/state.py</i>). Each node reads what it needs and returns only the keys it changes; LangGraph merges them. This gives clean separation of concerns, easy debugging and no hidden coupling between agents. Conversation memory is kept in the Chainlit user session (<i>history</i>) and passed to the router so follow-up questions like \"elaborate on section 3\" work."),
      P("Why LangGraph (and not a simple chain)?", H2),
      *bullets(["Research is <b>iterative</b>: when evidence is weak a human searches again. A linear chain cannot loop; a graph can.",
                "<b>Conditional edges</b> (route_intent, decide_next_step) let the system choose its path at run time.",
                "Typed shared state, checkpointing support and streaming of each node's output to the UI.",
                "A retry cap prevents infinite loops and unbounded API cost."]),
      P("Reliability engineering", H2),
      *bullets(["<b>LLM fallback ladder</b> (llm_factory.py): primary Gemini model, then several lighter models, with automatic retries to survive rate limits.",
                "<b>Search fallback:</b> Tavily, then DuckDuckGo, then Wikipedia; errors never crash the pipeline.",
                "<b>Error filtering:</b> the Critic drops empty or error records before judging.",
                "<b>Try/except in the UI loop</b> returns a friendly notice instead of a stack trace."]),
      PageBreak()]

# ---------- 4 ----------
S += [P("4. Technology Stack & Features", H1),
      table([["Layer", "Technology", "Purpose"],
             ["Orchestration", "LangGraph (StateGraph)", "Cyclic multi-agent workflow with conditional edges"],
             ["LLM", "Google Gemini via langchain-google-genai", "Reasoning, planning, critique, writing, transcription, vision"],
             ["Web search", "Tavily API (+ DuckDuckGo, Wikipedia fallback)", "Live, up-to-date web evidence"],
             ["Academic search", "arXiv API", "Peer-reviewed / pre-print literature"],
             ["Schemas", "Pydantic + TypedDict", "Validated structured LLM outputs and typed state"],
             ["Concurrency", "concurrent.futures.ThreadPoolExecutor", "Parallel sub-task retrieval: latency from N x T down to max(T)"],
             ["UI", "Chainlit + custom CSS / JS, React components", "Chat interface, live agent steps, history drawer, voice, NexusAI branding"],
             ["Documents", "pypdf and custom loaders", "PDF, ipynb, docx, xlsx, image, audio, video ingestion"],
             ["Export", "ReportLab", "Academic-style PDF of the final report"]],
            [3 * cm, 6 * cm, 8 * cm]),
      P("Feature list", H2),
      *bullets(["<b>Intent-aware routing</b> so greetings and simple questions don't trigger expensive research.",
                "<b>Multi-source retrieval:</b> web, arXiv, and local files in one run.",
                "<b>Critic loop</b> with targeted refinement queries.",
                "<b>Cited reports</b> with numbered references and Mermaid diagrams.",
                "<b>Multimodal uploads:</b> PDF, notebooks, Word, Excel, images, audio, video.",
                "<b>Voice assistant</b> using speech-to-text (Gemini transcription endpoint).",
                "<b>Live thinking UI</b> that shows each agent as it works.",
                "<b>Research history drawer</b> (Cmd+H) and PDF download."]),
      P("Project structure", H2),
      P("<font face='Courier' size=8.5>app.py - Chainlit UI, event handlers, voice endpoint, graph streaming<br/>src/graph.py - builds the LangGraph state machine<br/>src/agents/ - router, planner, researcher, critic, synthesis, llm_factory<br/>src/tools/search_tools.py - Tavily, arXiv, DDG, Wikipedia<br/>src/schemas/state.py - AgentState and Pydantic models<br/>src/utils/ - document_loader.py, exporter.py (PDF)<br/>eval/benchmark.py - multi-agent vs single-prompt evaluation<br/>public/ - custom.css, custom.js, logos</font>", B)]

# ---------- 5 ----------
S += [PageBreak(), P("5. Evaluation: Is It Actually Better?", H1),
      P("<i>eval/benchmark.py</i> runs the same queries through (a) a <b>baseline</b>: one direct LLM prompt, and (b) the full <b>multi-agent graph</b>. Test queries include test-time compute vs pre-training scaling, multimodal agentic medical systems, and FlashAttention-3."),
      table([["Metric", "Single prompt", "Multi-agent system"],
             ["Traceable sources / URLs", "Often none, or hallucinated", "Real clickable arXiv and web links"],
             ["Live data", "Training cutoff only", "Live web plus latest arXiv"],
             ["Verification", "None", "Critic review plus re-search loop"],
             ["Coverage", "One angle", "2-4 decomposed angles, searched in parallel"],
             ["Metrics logged", "word count, has-URL flag", "sources count, retry count, word count"]],
            [5 * cm, 5.5 * cm, 6.5 * cm]),
      Spacer(1, .2 * cm),
      P("Run it with: <font face='Courier'>python eval/benchmark.py</font>. Put the numbers it prints in your slides.", SM),
      P("6. Limitations & Future Work", H1),
      *bullets(["Retrieval of uploaded documents uses keyword scoring; <b>embeddings plus a vector DB</b> would be more accurate.",
                "The critic is itself an LLM and can be wrong; add rule-based citation checks or a second reviewer.",
                "The retry cap is small to bound cost; make it adaptive.",
                "Conversation history is per-session; add persistent storage (database) and user accounts.",
                "Evaluation is small; add LLM-as-judge scoring, human ratings and larger query sets.",
                "Add more tools: code execution, Semantic Scholar, PubMed, knowledge graphs."]),
      P("7. Likely Mentor Questions & Answers", H1),
      table([["Question", "Answer"],
             ["Why multi-agent instead of one big prompt?", "Specialisation: each agent has one focused prompt and temperature, so outputs are better, testable and debuggable. Separation also allows verification, which a single call cannot do on itself."],
             ["How do you reduce hallucination?", "Grounding (answers come from retrieved text), the Critic review step, numbered citations the user can click, and filtering of empty or error evidence."],
             ["How do agents share data?", "Through one typed AgentState; each node returns partial updates that LangGraph merges."],
             ["How do you prevent infinite loops?", "retry_count is stored in state and decide_next_step forces synthesis once the limit is reached."],
             ["Where is parallelism?", "researcher_node submits each sub-task to a ThreadPoolExecutor, so latency is the slowest task, not the sum."],
             ["What if an API fails or is rate-limited?", "Gemini fallback ladder with retries; Tavily falls back to DuckDuckGo and Wikipedia; errors are caught and shown gently."],
             ["How does it handle casual chat?", "The Router detects non-research intent and replies directly, skipping the pipeline to save time and cost."],
             ["How is it evaluated?", "benchmark.py compares against a single-prompt baseline on traceability, coverage, sources, and report length."],
             ["What is your own contribution?", "Router agent, critic loop, document and multimodal ingestion, voice input, live-thinking UI, history, PDF export, and branding."]],
            [5 * cm, 12 * cm]),
      PageBreak()]

# ---------- 8 ----------
S += [P("8. Presentation Script (5-7 minutes)", H1),
      P("<b>1. Hook (30 s)</b>", H2),
      P("\"If you ask an LLM for a literature review it may invent papers. I built NexusAI, an agent team that researches, verifies and then writes, with real citations.\"", SCRIPT),
      P("<b>2. Architecture (90 s)</b>", H2),
      P("Show Figure 1. \"The Router decides if it is research or just chat. The Planner splits the question into 2-4 sub-questions. The Researcher searches the web, arXiv and my uploaded files at the same time. The Critic acts like a reviewer: if evidence is weak it sends us back to search again, once. Then the Synthesis agent writes the cited report.\"", SCRIPT),
      P("<b>3. Why LangGraph (30 s)</b>", H2),
      P("\"Research needs loops, so I used a graph with conditional edges and a shared typed state, not a linear chain.\"", SCRIPT),
      P("<b>4. Live demo (2 min)</b>", H2),
      *bullets(["Run <font face='Courier'>chainlit run app.py -w</font> and open localhost:8000.",
                "Say \"hi\": instant reply (router shortcut).",
                "Ask a technical question, e.g. \"Explain FlashAttention-3 improvements\": show the live agent steps, then the cited report.",
                "Upload a PDF or notebook and ask \"explain this\"; show voice input; download the PDF."]),
      P("<b>5. Results and honesty (60 s)</b>", H2),
      P("\"Compared with a single prompt, we get verifiable links, live information and a review stage. Limitations: keyword retrieval for files and an LLM-based critic; next I would add embeddings and larger evaluations.\"", SCRIPT),
      P("<b>6. Close (15 s)</b>", H2),
      P("\"The key lesson: reliability in AI comes from structure: planning, parallel retrieval, verification and citation.\"", SCRIPT),
      P("How to run", H2),
      P("<font face='Courier' size=8.5>cp .env.example .env # add GEMINI_API_KEY and TAVILY_API_KEY<br/>source venv/bin/activate<br/>chainlit run app.py -w # open http://localhost:8000<br/>python eval/benchmark.py # reproduce evaluation</font>", B)]

doc = SimpleDocTemplate("/Users/tabishali/multi-agent-ai-research-assistant/docs/NexusAI_Project_Explanation.pdf", pagesize=A4,
                        leftMargin=2 * cm, rightMargin=2 * cm, topMargin=1.8 * cm, bottomMargin=2 * cm,
                        title="NexusAI Project Explanation", author="NexusAI")
doc.build(S, onFirstPage=footer, onLaterPages=footer)
print("ok")
