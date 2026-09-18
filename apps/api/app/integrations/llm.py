from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx


class LLMProviderError(RuntimeError):
    pass


@dataclass(frozen=True)
class LLMResult:
    content: str
    model: str
    prompt_tokens: int
    completion_tokens: int


class OpenAICompatibleLLM:
    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        base_url: str,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self.api_key = api_key
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.client = client

    async def complete(
        self,
        messages: list[dict[str, str]],
        tools: list[dict[str, Any]] | None = None,
    ) -> LLMResult:
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.2,
        }
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"

        owns_client = self.client is None
        client = self.client or httpx.AsyncClient(timeout=httpx.Timeout(20))
        try:
            response = await client.post(
                f"{self.base_url}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
        except (httpx.HTTPError, ValueError, KeyError, IndexError) as exc:
            raise LLMProviderError("The language model provider is unavailable") from exc
        finally:
            if owns_client:
                await client.aclose()

        try:
            usage = data.get("usage", {})
            return LLMResult(
                content=data["choices"][0]["message"].get("content") or "",
                model=data.get("model", self.model),
                prompt_tokens=int(usage.get("prompt_tokens", 0)),
                completion_tokens=int(usage.get("completion_tokens", 0)),
            )
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            raise LLMProviderError("The language model returned an invalid response") from exc
