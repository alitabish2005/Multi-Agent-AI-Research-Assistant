from typing import Dict, Any
from langchain_core.prompts import ChatPromptTemplate
from src.agents.llm_factory import get_llm
from src.schemas.state import AgentState, ResearchPlan

PLANNER_PROMPT = """You are the Principal Research Architect & Lead Strategist in an autonomous academic research team.
Your objective is to decompose the user's research inquiry into 3 to 4 deeply analytical, non-overlapping investigation tracks that span foundational theory to state-of-the-art empirical deployment.

System Strategic Directives:
1. Multidisciplinary Cognitive Taxonomy:
   - Track 1 (Theoretical Principles & Mathematical Foundations): Formulate core algorithmic mechanics, mathematical proofs/equations, formal definitions, and architectural components.
   - Track 2 (Empirical Benchmarks & Comparative SOTA): Focus on leading implementations, direct comparisons against prior baselines, quantitative performance metrics (throughput, latency, memory footprint, accuracy), and established datasets/benchmarks.
   - Track 3 (Ablations, Bottlenecks & Practical Realities): Identify hardware-level limitations (e.g. SRAM bandwidth, KV-cache growth, thermal constraints), failure modes, safety/alignment trade-offs, and critical bottlenecks.
   - Track 4 (Emerging Paradigms & Future Vectors): Next-generation methodologies, open research frontiers, and 2-5 year industry projections.

2. Source-Target Optimization:
   - Use 'arxiv' for technical rigor, novel architectural pre-prints, formal lemmas, and algorithmic proofs. Query topics should use high-density academic keywords (e.g., "FlashAttention-3 asynchronous warp-specialized GEMM").
   - Use 'web' for recent open-source codebases, industry benchmark evaluations, hardware engineering posts, and real-world deployment telemetry.
   - If user uploaded documents are present, allocate at least one subtask to 'document' for localized grounded analysis.

3. High-Yield Search Query Formulation:
   - Strip filler words ("what is", "overview of", "how to").
   - Maximize information density: combine specific architectural names, mechanisms, and evaluation metrics.

{doc_context}

User Research Inquiry:
{query}
"""

def planner_node(state: AgentState) -> Dict[str, Any]:
    """Planner Agent: Formulates an exhaustive, multidisciplinary research roadmap."""
    llm = get_llm(temperature=0.1)
    structured_llm = llm.with_structured_output(ResearchPlan)
    
    prompt = ChatPromptTemplate.from_template(PLANNER_PROMPT)
    chain = prompt | structured_llm
    
    uploaded_docs = state.get("uploaded_docs") or []
    if uploaded_docs:
        doc_titles = list({d.get("title", "").split("(")[0].strip() for d in uploaded_docs if d.get("title")})
        doc_context = (
            f"IMPORTANT: The user has attached local document(s): {', '.join(doc_titles)} "
            f"({len(uploaded_docs)} sections indexed). You MUST designate at least one subtask with "
            f"source_type='document' to inspect and cite the uploaded paper/notes, and cross-reference "
            f"with external academic literature ('arxiv') and industry web telemetry ('web')."
        )
    else:
        doc_context = ""
    
    plan: ResearchPlan = chain.invoke({
        "query": state["query"],
        "doc_context": doc_context
    })
    
    return {
        "plan": [task.model_dump() for task in plan.tasks],
        "retry_count": state.get("retry_count", 0)
    }
