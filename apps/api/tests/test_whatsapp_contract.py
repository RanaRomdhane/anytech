import asyncio

import httpx

from app.integrations.whatsapp import WhatsAppCloudClient


def test_whatsapp_client_sends_normalized_text_and_parses_acknowledgement():
    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/v23.0/phone-id/messages"
        assert request.headers["authorization"] == "Bearer secret"
        payload = __import__("json").loads(request.content)
        assert payload["to"] == "21620111222"
        assert payload["text"]["body"] == "Bonjour"
        return httpx.Response(200, json={"messages": [{"id": "wamid.123"}]})

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            provider = WhatsAppCloudClient(
                access_token="secret",
                phone_number_id="phone-id",
                graph_version="v23.0",
                base_url="https://graph.facebook.com",
                client=client,
            )
            return await provider.send_text("+216 20 111 222", "Bonjour")

    result = asyncio.run(run())
    assert result.message_id == "wamid.123"
