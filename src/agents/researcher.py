import concurrent.futures
from typing import Dict, Any, List
from src.schemas.state import AgentState
from src.tools.search_tools import search_tavily, search_arxiv

def retrieve_relevant_document_chunks(topic: str, docs: List[Dict[str, Any]], max_chunks: int = 4) -> List[Dict[str, Any]]:
    """Retrieves the most relevant chunks from uploaded documents based on keyword resonance."""
    if not docs:
        return []
    if len(docs) <= max_chunks:
        return docs
        
    keywords = [w.lower() for w in topic.replace('"', '').replace("'", '').replace(":", " ").replace("-", " ").split() if len(w) > 2]
    
    scored = []
    for d in docs:
        content_lower = d.get("content", "").lower()
        title_lower = d.get("title", "").lower()
        score = sum(content_lower.count(k) * 2 + title_lower.count(k) * 5 for k in keywords)
        scored.append((score, d))
        
    scored.sort(key=lambda x: x[0], reverse=True)
    selected = [item[1] for item in scored[:max_chunks]]
    return selected

def fetch_subtask_findings(task: Dict[str, Any], uploaded_docs: List[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """Helper worker to fetch research concurrently across web, arXiv, and local documents."""
    topic = task.get("topic", "")
    source_type = task.get("source_type", "web")
    
    if source_type == "document":
        return retrieve_relevant_document_chunks(topic, uploaded_docs or [])
    elif source_type == "arxiv":
        return search_arxiv(topic, max_results=2)
    else:
        return search_tavily(topic, max_results=3)

def researcher_node(state: AgentState) -> Dict[str, Any]:
    """Researcher Agent: Concurrent parallel search across local docs, web, and arXiv."""
    plan = state.get("plan", [])
    critic_eval = state.get("critic_evaluation")
    uploaded_docs = state.get("uploaded_docs") or []
    
    findings: List[Dict[str, Any]] = list(state.get("raw_findings", []))
    
    # If uploaded docs exist and haven't been incorporated yet, add top document evidence
    doc_ids_already = {f.get("id") for f in findings if f.get("source_type") == "document"}
    if uploaded_docs and not doc_ids_already:
        top_doc_chunks = retrieve_relevant_document_chunks(state.get("query", ""), uploaded_docs, max_chunks=4)
        findings.extend(top_doc_chunks)
    
    # If triggered by critic feedback loop, use targeted refinement queries
    if critic_eval and critic_eval.get("refinement_queries"):
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
            futures = [executor.submit(search_tavily, q, 2) for q in critic_eval["refinement_queries"]]
            for future in concurrent.futures.as_completed(futures):
                try:
                    res = future.result()
                    findings.extend(res)
                except Exception as e:
                    print(f"Refinement query error: {e}")
        return {"raw_findings": findings}

    # Standard run: Execute subtasks concurrently using ThreadPoolExecutor
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(plan) or 1) as executor:
        future_to_task = {
            executor.submit(fetch_subtask_findings, task, uploaded_docs): task 
            for task in plan
        }
        for future in concurrent.futures.as_completed(future_to_task):
            try:
                results = future.result()
                findings.extend(results)
            except Exception as e:
                task = future_to_task[future]
                print(f"Error executing subtask '{task.get('topic')}': {e}")
                
    return {"raw_findings": findings}
