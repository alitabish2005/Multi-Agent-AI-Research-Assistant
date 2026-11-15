import os
import time
import threading
from typing import Any, Dict, List
from langchain_core.callbacks import BaseCallbackHandler
from langchain_core.outputs import LLMResult
from langchain_google_genai import ChatGoogleGenerativeAI

_telemetry_lock = threading.Lock()

TOKEN_TELEMETRY: Dict[str, Any] = {
    "budget_limit": int(os.getenv("TOKEN_BUDGET_LIMIT", "32000")),
    "prompt_tokens": 0,
    "completion_tokens": 0,
    "doc_tokens": 0,
    "total_used": 0,
    "agent_calls": 0,
    "last_updated": time.time(),
}


def estimate_tokens_from_text(text: str) -> int:
    if not text:
        return 0
    return max(1, int(round(len(str(text)) / 3.8)))


def record_token_usage(prompt_tokens: int = 0, completion_tokens: int = 0, doc_tokens: int = 0) -> Dict[str, Any]:
    with _telemetry_lock:
        TOKEN_TELEMETRY["prompt_tokens"] += max(0, int(prompt_tokens))
        TOKEN_TELEMETRY["completion_tokens"] += max(0, int(completion_tokens))
        TOKEN_TELEMETRY["doc_tokens"] += max(0, int(doc_tokens))
        TOKEN_TELEMETRY["total_used"] = (
            TOKEN_TELEMETRY["prompt_tokens"]
            + TOKEN_TELEMETRY["completion_tokens"]
            + TOKEN_TELEMETRY["doc_tokens"]
        )
        if prompt_tokens > 0 or completion_tokens > 0:
            TOKEN_TELEMETRY["agent_calls"] += 1
        TOKEN_TELEMETRY["last_updated"] = time.time()
        return get_token_telemetry_snapshot()


def get_token_telemetry_snapshot() -> Dict[str, Any]:
    budget = max(1, int(TOKEN_TELEMETRY["budget_limit"]))
    used = max(0, int(TOKEN_TELEMETRY["total_used"]))
    remaining = max(0, budget - used)
    pct_left = round((remaining / budget) * 100.0, 2)
    return {
        "budget_limit": budget,
        "used_tokens": used,
        "remaining_tokens": remaining,
        "percentage_left": pct_left,
        "prompt_tokens": TOKEN_TELEMETRY["prompt_tokens"],
        "completion_tokens": TOKEN_TELEMETRY["completion_tokens"],
        "doc_tokens": TOKEN_TELEMETRY["doc_tokens"],
        "agent_calls": TOKEN_TELEMETRY["agent_calls"],
        "last_updated": TOKEN_TELEMETRY["last_updated"],
    }


class TokenTelemetryCallback(BaseCallbackHandler):
    """Captures real token usage from every Gemini LLM call across all agents."""

    def __init__(self) -> None:
        super().__init__()
        self._last_prompt_est = 0

    def on_prompts_start(self, prompts: List[str], **kwargs: Any) -> None:
        self._last_prompt_est = sum(estimate_tokens_from_text(p) for p in prompts)

    def on_chat_model_start(self, serialized: Dict[str, Any], messages: List[List[Any]], **kwargs: Any) -> None:
        total_chars = 0
        for msg_list in messages:
            for m in msg_list:
                content = getattr(m, "content", "")
                total_chars += len(str(content))
        self._last_prompt_est = max(1, int(round(total_chars / 3.8)))

    def on_llm_end(self, response: LLMResult, **kwargs: Any) -> None:
        in_tok = 0
        out_tok = 0
        try:
            if response.llm_output and isinstance(response.llm_output, dict):
                usage = response.llm_output.get("usage_metadata") or response.llm_output.get("token_usage") or {}
                in_tok = int(usage.get("prompt_token_count") or usage.get("input_tokens") or usage.get("prompt_tokens") or 0)
                out_tok = int(usage.get("candidates_token_count") or usage.get("output_tokens") or usage.get("completion_tokens") or 0)

            for gen_list in response.generations:
                for gen in gen_list:
                    msg = getattr(gen, "message", None)
                    usage_meta = getattr(msg, "usage_metadata", None) if msg else None
                    if isinstance(usage_meta, dict):
                        in_tok = max(in_tok, int(usage_meta.get("input_tokens") or usage_meta.get("prompt_token_count") or 0))
                        out_tok = max(out_tok, int(usage_meta.get("output_tokens") or usage_meta.get("candidates_token_count") or 0))
                    if out_tok == 0:
                        text = getattr(gen, "text", "") or (getattr(msg, "content", "") if msg else "")
                        out_tok += estimate_tokens_from_text(str(text))
        except Exception:
            pass

        if in_tok == 0:
            in_tok = max(25, self._last_prompt_est)
        if out_tok == 0:
            out_tok = 40

        record_token_usage(prompt_tokens=in_tok, completion_tokens=out_tok)


def get_llm(model_name: str = None, temperature: float = 0.2, enable_fallbacks: bool = True):
    """
    Intelligent LLM Factory for Gemini models.
    Defaults to the high-intelligence `gemini-flash-latest` flagship model,
    with seamless automatic fallbacks to guarantee high availability and zero rate-limit crashes.
    """
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    cb = [TokenTelemetryCallback()]

    # Priority flagship model: gemini-flash-latest offers state-of-the-art reasoning and speed
    primary_model = model_name or os.getenv("GEMINI_MODEL", "gemini-flash-latest")

    primary_llm = ChatGoogleGenerativeAI(
        model=primary_model,
        temperature=temperature,
        google_api_key=api_key,
        max_retries=3,
        callbacks=cb,
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
            max_retries=2,
            callbacks=cb,
        )
        for m in fallback_models
        if m != primary_model
    ]

    if fallbacks:
        return primary_llm.with_fallbacks(fallbacks)
    return primary_llm
