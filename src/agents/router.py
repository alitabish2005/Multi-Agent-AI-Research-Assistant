from typing import Dict, Any, Optional
from pydantic import BaseModel, Field
from langchain_core.prompts import ChatPromptTemplate
from src.agents.llm_factory import get_llm
from src.schemas.state import AgentState

class IntentClassification(BaseModel):
    intent: str = Field(
        description=(
            "Must be one of: 'research', 'conversational', 'direct_qa', or 'follow_up'. "
            "- 'follow_up': Questions or prompts referring to the previous conversation, previous report, or asking to elaborate/clarify/compare based on prior context. "
            "- 'research': Deep technical, academic, scientific, or exploratory topics that warrant fresh web search and arXiv literature review. "
            "- 'conversational': Greetings (hi/hello), chit-chat, banter, insults, slang, or playful remarks. "
            "- 'direct_qa': Very simple standalone factual/math/conversion questions that require a direct 1-2 sentence answer."
        )
    )
    reasoning: str = Field(
        description="Brief explanation of why this intent was identified."
    )
    direct_reply: Optional[str] = Field(
        default="",
        description=(
            "Required if intent is 'conversational', 'direct_qa', or 'follow_up'. "
            "For 'follow_up' or technical 'direct_qa', formulate an insightful, well-structured answer. "
            "Whenever explaining workflows, pipelines, concepts, or comparisons, include a suitable Mermaid diagram (```mermaid ... ```) "
            "with double-quoted node labels and an accompanying step-by-step diagram explanation. "
            "For 'conversational' or banter, reply with charm, wit, and good vibes. "
            "Never generate a scientific report on insults or greetings."
        )
    )
    refined_topic: Optional[str] = Field(
        default="",
        description="If intent is 'research', provide an academically precise, scoped version of the research topic."
    )

ROUTER_PROMPT = """You are the Chief Intelligence & Intent Classifier for an autonomous multi-agent research system.
Your job is to analyze the incoming user message, evaluate conversation history, examine attached files, and determine the optimal handling strategy before any heavy research tools are invoked.

System Context:
This system is an Agentic AI Research Assistant capable of deep academic investigations, multi-source literature review, code analysis, and conversational memory across turns.

Conversation History & Context:
{history_context}

Attached Files & Documents:
{docs_context}

User Message:
{query}

Guidelines:
1. If documents or files are attached (e.g. Jupyter Notebook, PDF, code file) and the user asks to explain, analyze, summarize, or inspect them (e.g. "explain this to me", "what does this code do", "analyze this notebook", "summarize"):
   - Set intent = 'research'.
   - In refined_topic, formulate an in-depth, scoped technical inquiry incorporating the document title and contents (e.g. "Detailed architectural, algorithmic, and statistical analysis of the uploaded notebook: [document title]").
2. If the user message is a follow-up referring to the previous report or discussion (e.g. "elaborate on section 3", "compare this with X", "can you explain more?", "summarize in 5 bullet points"):
   - Set intent = 'follow_up'.
   - In direct_reply, provide a comprehensive, insightful, and detailed technical answer directly using the previous conversation context. Include a suitable Mermaid diagram and diagram explanation whenever clarifying architectures or workflows.
3. If the user uses slang, curses, or playful banter:
   - Set intent = 'conversational'.
   - Reply with wit, humor, and charm without taking offense, gently nudging them toward research.
4. If the user sends a greeting ("hi", "hello") or asks about you:
   - Set intent = 'conversational'. Introduce yourself as an autonomous multi-agent researcher and invite them to explore complex topics.
5. If it is a new complex research inquiry or technical topic:
   - Set intent = 'research'. Formulate a refined, academically clear scope in refined_topic.
"""

def router_node(state: AgentState) -> Dict[str, Any]:
    """Router Agent: Assesses user intent, handles chit-chat/follow-ups directly, or routes to research."""
    llm = get_llm(temperature=0.3)
    structured_llm = llm.with_structured_output(IntentClassification)
    
    # Format history context
    history = state.get("history") or []
    if history:
        history_lines = []
        for h in history[-4:]:
            role = h.get("role", "user").capitalize()
            content = h.get("content", "")[:300]
            history_lines.append(f"{role}: {content}")
        history_context = "\n".join(history_lines)
    else:
        history_context = "No previous conversation context (new session)."
        
    # Format uploaded documents context
    uploaded_docs = state.get("uploaded_docs") or []
    if uploaded_docs:
        doc_summaries = []
        for d in uploaded_docs[:6]:
            title = d.get("title", "Attached File")
            preview = d.get("content", "")[:250].replace("\n", " ").strip()
            doc_summaries.append(f"- **{title}**: {preview}...")
        docs_context = "\n".join(doc_summaries)
    else:
        docs_context = "No documents or files currently attached."
        
    prompt = ChatPromptTemplate.from_template(ROUTER_PROMPT)
    chain = prompt | structured_llm
    
    result: IntentClassification = chain.invoke({
        "query": state["query"],
        "history_context": history_context,
        "docs_context": docs_context
    })
    
    intent = result.intent.lower().strip()
    if intent not in ("research", "conversational", "direct_qa", "follow_up"):
        intent = "research"
        
    updates: Dict[str, Any] = {
        "intent": intent,
        "intent_reasoning": result.reasoning
    }
    
    if intent in ("conversational", "direct_qa", "follow_up"):
        updates["final_report"] = result.direct_reply or "Here is what you requested regarding our previous discussion."
        updates["citations"] = []
    else:
        if result.refined_topic and len(result.refined_topic.strip()) > 3:
            updates["query"] = result.refined_topic.strip()
            
    return updates
