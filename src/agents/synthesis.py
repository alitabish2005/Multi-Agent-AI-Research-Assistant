from typing import Dict, Any, List
from langchain_core.prompts import ChatPromptTemplate
from src.agents.llm_factory import get_llm
from src.schemas.state import AgentState

SYNTHESIS_PROMPT = """You are the Principal Scientific Author & Distinguished Research Fellow leading an autonomous research team.
Your objective is to author an exhaustive, mathematically and architecturally rigorous research report answering the user's research topic.
Your synthesis must seamlessly integrate deep foundational principles with the verified literature and findings provided below.

User Research Topic:
{query}

Verified Findings & Literature:
{findings}

Peer Review Critic Feedback:
{critic_feedback}

Mandatory Publication-Grade Report Architecture:
1. Executive Abstract: High-level thesis, paradigm shift, core breakthroughs, and summary of findings.

2. Visual Architecture & Process Flow Diagram (MANDATORY DIAGRAM & EXPLANATION):
   - You MUST include a complete, syntactically flawless Mermaid diagram (enclosed in ```mermaid ... ```).
   - Use `flowchart TD`, `flowchart LR`, `graph TD`, or `sequenceDiagram` to visually depict the underlying system architecture, data flow pipeline, algorithmic lifecycle, or conceptual taxonomy.
   - STRICT SYNTAX RULES:
     * Node labels containing parentheses, brackets, colons, or punctuation MUST be enclosed in double quotes. Example:
       ```mermaid
       flowchart TD
           A["Input Query / Prompt"] --> B["Token Embeddings & Position Encodings"]
           B --> C["Transformer Layers (Multi-Head Self-Attention)"]
           C --> D["Feed-Forward Network (FFN / SwiGLU)"]
           D --> E["LayerNorm & Final Linear Projection"]
           E --> F["Softmax Output Probabilities"]
       ```
     * Never leave unquoted brackets or parentheses inside labels.
   - Comprehensive Diagram Walkthrough & Explanation (MANDATORY):
     * Immediately follow the diagram with an in-depth explanatory breakdown.
     * Component Decomposition: Explain what each block/subsystem represents, its input/output representations, and its internal operations.
     * Information Flow & Signal Propagation: Detail how data flows from stage to stage along each path/edge.
     * Critical Path & Computational Bottlenecks: Highlight where memory bandwidth, compute overhead, or latency constraints occur across the diagram.

3. Mathematical Foundations & Algorithmic Mechanics:
   - Provide formal definitions and mathematical equations in LaTeX (use `$formula$` for inline and `$$formula$$` for block equations).
   - Detail the computational mechanics, memory access patterns, and asymptotic complexity (e.g. $O(N)$, $O(N^2)$).

4. Comparative SOTA Benchmark & Architecture Evaluation:
   - Include a Markdown Comparison Table comparing the primary paradigm against leading alternatives across: Architecture Type, Throughput / Speedup, Memory Footprint, Hardware Dependencies, and Key Trade-offs.

5. Systems Engineering, Real-World Deployments & Tooling:
   - Leading libraries, open-source implementations, kernel-level optimizations, and integration workflows.

6. Critical Bottlenecks, Failure Modes & Open Challenges:
   - Deep analysis of failure cases, scaling bottlenecks, computational overheads, and safety/security implications.

7. Strategic Horizon & Future Directions:
   - 2-5 year research trajectories and open theoretical problems.

Strict Academic Standards:
- Write in dense, clear, publication-grade academic prose with numbered headings (`## 1.`, `## 2.`, etc.).
- EVERY report MUST include the visual architecture diagram with its accompanying detailed diagram explanation.
- Anchor every empirical metric or architectural claim to verified source indices: e.g., `[1]`, `[2]`.
- Under NO circumstance invent or hallucinate URLs or citations outside the verified literature.
- Deliver an exhaustive, deeply informative, and intellectually elevated treatise that satisfies researchers and domain experts.
"""

def synthesis_node(state: AgentState) -> Dict[str, Any]:
    """Synthesis Agent: Authors an intellectually rigorous, mathematically grounded research report."""
    llm = get_llm(temperature=0.25)
    
    # Prefer verified_findings, fallback to raw_findings
    raw = state.get("verified_findings") or state.get("raw_findings", [])
    critic_eval = state.get("critic_evaluation") or {}
    critic_feedback = critic_eval.get("critique", "Synthesize findings with maximum technical rigor and citation grounding.")
    
    # Filter out error records
    findings = [
        item for item in raw
        if not item.get("id", "").endswith("_error")
        and not item.get("id", "").endswith("missing_key")
        and len(item.get("content", "").strip()) > 20
    ]
    
    # Format numbered sources
    sources_text = []
    citations = []
    seen_urls = set()
    
    idx = 1
    for item in findings:
        url = item.get("url", "").strip()
        if url and url in seen_urls:
            continue
        if url:
            seen_urls.add(url)
            
        title = item.get("title", f"Source {idx}").strip()
        content = item.get("content", "").strip()
        source_type = item.get("source_type", "web")
        
        sources_text.append(f"[{idx}] ({source_type.upper()}) {title}\nURL: {url}\nExcerpt: {content}\n")
        citations.append({"index": idx, "title": title, "url": url or "#", "source_type": source_type})
        idx += 1
        
    prompt = ChatPromptTemplate.from_template(SYNTHESIS_PROMPT)
    chain = prompt | llm
    
    response = chain.invoke({
        "query": state["query"],
        "findings": "\n---\n".join(sources_text) if sources_text else "No external findings available.",
        "critic_feedback": critic_feedback
    })
    
    if isinstance(response.content, list):
        final_text = "\n".join([part.get("text", "") if isinstance(part, dict) else str(part) for part in response.content])
    else:
        final_text = str(response.content)
    
    return {
        "final_report": final_text,
        "citations": citations
    }
