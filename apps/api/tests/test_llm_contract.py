import asyncio

import httpx

from app.integrations.llm import OpenAICompatibleLLM


def test_openai_compatible_llm_parses_usage_without_exposing_key():
    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["authorization"] == "Bearer secret-value"
        return httpx.Response(
            200,
            json={
                "model": "openai/gpt-oss-20b",
                "choices": [{"message": {"content": "Bonjour"}}],
                "usage": {"prompt_tokens": 12, "completion_tokens": 3},
            },
        )

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            provider = OpenAICompatibleLLM(
                api_key="secret-value",
                model="openai/gpt-oss-20b",
                base_url="https://api.groq.com/openai/v1",
                client=client,
            )
            return await provider.complete([{"role": "user", "content": "Salut"}])

    result = asyncio.run(run())

    assert result.content == "Bonjour"
    assert result.prompt_tokens == 12
    assert result.completion_tokens == 3
