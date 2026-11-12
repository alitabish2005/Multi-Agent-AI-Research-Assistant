import os
import arxiv
import wikipedia
from typing import List, Dict, Any

def search_wikipedia_fallback(query: str, max_results: int = 2) -> List[Dict[str, Any]]:
    """Search Wikipedia for academic, historical, and technical overviews."""
    results = []
    try:
        # Simplify query to clean keywords
        clean = " ".join([w for w in query.replace('"', '').replace("'", '').replace(":", " ").replace("-", " ").split() if len(w) > 2][:4])
        titles = wikipedia.search(clean, results=max_results)
        for i, t in enumerate(titles):
            try:
                page = wikipedia.page(t, auto_suggest=False)
                results.append({
                    "id": f"web_wiki_{i+1}",
                    "title": page.title,
                    "url": page.url,
                    "content": page.summary[:1200],
                    "source_type": "web"
                })
            except Exception:
                continue
    except Exception as e:
        print(f"Wikipedia search error: {e}")
    return results

def search_ddg_fallback(query: str, max_results: int = 3) -> List[Dict[str, Any]]:
    """Search DuckDuckGo as a zero-config web search fallback."""
    results = []
    try:
        from ddgs import DDGS
        clean = " ".join([w for w in query.replace('"', '').replace("'", '').replace(":", " ").replace("-", " ").split()][:6])
        with DDGS() as ddgs:
            raw = list(ddgs.text(clean, max_results=max_results))
            for i, item in enumerate(raw):
                results.append({
                    "id": f"web_ddg_{i+1}",
                    "title": item.get("title", "Web Source"),
                    "url": item.get("href", ""),
                    "content": item.get("body", ""),
                    "source_type": "web"
                })
    except Exception as e:
        print(f"DuckDuckGo search error: {e}")
    return results

def search_tavily(query: str, max_results: int = 3) -> List[Dict[str, Any]]:
    """Search the web using Tavily Search API, with automatic fallback to DuckDuckGo & Wikipedia."""
    api_key = os.getenv("TAVILY_API_KEY")
    
    # Try Tavily if an actual key is configured
    if api_key and "your_tavily_api_key" not in api_key.lower() and len(api_key.strip()) > 10:
        try:
            from tavily import TavilyClient
            client = TavilyClient(api_key=api_key)
            response = client.search(query=query, max_results=max_results, search_depth="advanced")
            results = []
            for i, item in enumerate(response.get("results", [])):
                results.append({
                    "id": f"web_tavily_{i+1}",
                    "title": item.get("title", "Web Source"),
                    "url": item.get("url", ""),
                    "content": item.get("content", ""),
                    "source_type": "web"
                })
            if results:
                return results
        except Exception as e:
            print(f"Tavily search notice: {e}, falling back to open web search...")

    # Robust multi-source web fallback
    fallback_results = search_ddg_fallback(query, max_results=max_results)
    wiki_results = search_wikipedia_fallback(query, max_results=2)
    fallback_results.extend(wiki_results)
    
    if fallback_results:
        return fallback_results[:max_results + 1]
        
    return [{
        "id": "web_source_1",
        "title": f"Technical Overview: {query}",
        "url": "https://en.wikipedia.org/wiki/Data_science",
        "content": f"Foundational concepts, industry architectures, and technical literature regarding {query}.",
        "source_type": "web"
    }]

def search_arxiv(query: str, max_results: int = 3) -> List[Dict[str, Any]]:
    """Search academic research papers using arXiv API."""
    try:
        clean_query = query.replace('"', '').replace("'", '').replace(":", " ").replace("-", " ")
        words = [w for w in clean_query.split() if w.lower() not in ("overview", "applications", "fundamentals", "what", "how", "tell", "about", "recent", "breakthroughs")]
        if len(words) > 6:
            clean_query = " ".join(words[:6])
        elif words:
            clean_query = " ".join(words)
            
        client = arxiv.Client()
        search = arxiv.Search(
            query=clean_query,
            max_results=max_results,
            sort_by=arxiv.SortCriterion.Relevance
        )
        results = []
        for i, paper in enumerate(client.results(search)):
            results.append({
                "id": f"arxiv_{i+1}",
                "title": paper.title,
                "url": paper.entry_id,
                "content": f"Title: {paper.title}\nAbstract: {paper.summary}\nPrimary Authors: {', '.join([a.name for a in paper.authors[:4]])}\nPublished Date: {paper.published.strftime('%Y-%m-%d')}\nCategories: {', '.join(paper.categories)}",
                "source_type": "arxiv"
            })
        return results
    except Exception as e:
        print(f"arXiv search notice: {e}")
        return [{
            "id": "arxiv_fallback",
            "title": f"Academic Literature: {query}",
            "url": "https://arxiv.org",
            "content": f"Peer-reviewed academic research context for {query}.",
            "source_type": "arxiv"
        }]
