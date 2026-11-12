from typing import Dict, Any
from langchain_core.prompts import ChatPromptTemplate
from src.agents.llm_factory import get_llm
from src.schemas.state import AgentState, CriticEvaluation

CRITIC_PROMPT = """You are the Senior Peer Reviewer, Verification Critic & Scientific Integrity Lead in an autonomous research team.
Your objective is to critically assess whether the accumulated empirical and academic evidence is sufficiently rigorous, factually backed, and technically rich to author a publication-grade research report.

User Research Topic:
{query}

Subtasks Planned:
{plan}

Raw Evidence Excerpts:
{findings}

Current Review Iteration: {retry_count}

Rigorous Evaluation Protocol:
1. Depth & Grounding: Does the evidence provide concrete architectural mechanics, mathematical formulas, and quantitative benchmark statistics, or is it merely superficial prose?
2. Diagram & Architectural Modeling Feasibility: Is the evidence detailed enough to construct an accurate architectural workflow or pipeline diagram (e.g. system modules, computational data flows, kernel stages, state transitions)?
3. Multi-Perspective Balance: Does the evidence address both the celebrated breakthroughs AND the empirical trade-offs, compute costs, failure modes, and hardware bottlenecks?
4. Source Authenticity: Are there valid academic pre-prints (arXiv), verified documentation, or authoritative technical disclosures present?
5. Termination Logic:
   - If retry_count == 0 AND evidence lacks critical comparative metrics or technical mechanics, mark `is_sufficient = False` and provide 1-2 laser-targeted `refinement_queries` specifically searching for the missing quantitative metrics or algorithms.
   - If retry_count >= 1 OR if at least 2 substantive, informative sources are verified, mark `is_sufficient = True` and synthesize actionable, constructive guidance for the Synthesis Writer, specifying the core architectural pipeline and subsystems to illustrate in the mandatory Mermaid diagram.
"""

def critic_node(state: AgentState) -> Dict[str, Any]:
    """Critic Agent: Verifies factual soundness, enforces rigor, and guides synthesis."""
    llm = get_llm(temperature=0.0)
    structured_llm = llm.with_structured_output(CriticEvaluation)
    
    prompt = ChatPromptTemplate.from_template(CRITIC_PROMPT)
    chain = prompt | structured_llm
    
    retry_count = state.get("retry_count", 0)
    raw_findings = state.get("raw_findings", [])
    
    # Filter out error entries or uninformative blanks
    valid_findings = [
        item for item in raw_findings
        if not item.get("id", "").endswith("_error")
        and not item.get("id", "").endswith("missing_key")
        and len(item.get("content", "").strip()) > 30
    ]
    
    findings_str = "\n".join([
        f"- [{item.get('source_type', 'web').upper()}] {item.get('title')}: {item.get('content')[:400]}..."
        for item in valid_findings
    ])
    
    evaluation: CriticEvaluation = chain.invoke({
        "query": state["query"],
        "plan": str(state.get("plan", [])),
        "findings": findings_str if findings_str else "No valid evidence retrieved.",
        "retry_count": retry_count
    })
    
    return {
        "critic_evaluation": evaluation.model_dump(),
        "verified_findings": valid_findings if valid_findings else raw_findings,
        "retry_count": retry_count + 1
    }
