import os
from langchain_google_genai import ChatGoogleGenerativeAI

def get_llm(model_name: str = None, temperature: float = 0.2, enable_fallbacks: bool = True):
    """
    Intelligent LLM Factory for Gemini models.
    Defaults to the high-intelligence `gemini-flash-latest` flagship model,
    with seamless automatic fallbacks to guarantee high availability and zero rate-limit crashes.
    """
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    
    # Priority flagship model: gemini-flash-latest offers state-of-the-art reasoning and speed
    primary_model = model_name or os.getenv("GEMINI_MODEL", "gemini-flash-latest")
    
    primary_llm = ChatGoogleGenerativeAI(
        model=primary_model,
        temperature=temperature,
        google_api_key=api_key,
        max_retries=3
    )
    
    if not enable_fallbacks:
        return primary_llm
        
    # High-reliability fallback ladder
    fallback_models = [
        "gemini-flash-latest",
        "gemini-3.5-flash-lite",
        "gemini-flash-lite-latest",
        "gemini-3.1-flash-lite",
    ]
    
    fallbacks = [
        ChatGoogleGenerativeAI(
            model=m,
            temperature=temperature,
            google_api_key=api_key,
            max_retries=2
        )
        for m in fallback_models
        if m != primary_model
    ]
    
    if fallbacks:
        return primary_llm.with_fallbacks(fallbacks)
    return primary_llm
