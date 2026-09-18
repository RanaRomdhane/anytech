from dataclasses import dataclass

import httpx


class WhatsAppProviderError(RuntimeError):
    def __init__(self, message: str, *, ambiguous: bool = False) -> None:
        super().__init__(message)
        self.ambiguous = ambiguous


@dataclass(frozen=True)
class WhatsAppSendResult:
    message_id: str


class WhatsAppCloudClient:
    def __init__(
        self,
        *,
        access_token: str,
        phone_number_id: str,
        graph_version: str,
        base_url: str,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self.access_token = access_token
        self.phone_number_id = phone_number_id
        self.graph_version = graph_version
        self.base_url = base_url.rstrip("/")
        self.client = client

    async def send_text(self, recipient: str, body: str) -> WhatsAppSendResult:
        owns_client = self.client is None
        client = self.client or httpx.AsyncClient(timeout=httpx.Timeout(20))
        try:
            response = await client.post(
                f"{self.base_url}/{self.graph_version}/{self.phone_number_id}/messages",
                headers={"Authorization": f"Bearer {self.access_token}"},
                json={
                    "messaging_product": "whatsapp",
                    "recipient_type": "individual",
                    "to": "".join(character for character in recipient if character.isdigit()),
                    "type": "text",
                    "text": {"preview_url": False, "body": body},
                },
            )
            response.raise_for_status()
            payload = response.json()
            return WhatsAppSendResult(message_id=payload["messages"][0]["id"])
        except httpx.TimeoutException as exc:
            raise WhatsAppProviderError(
                "WhatsApp acknowledgement timed out", ambiguous=True
            ) from exc
        except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError) as exc:
            raise WhatsAppProviderError(
                "WhatsApp rejected or did not acknowledge the message"
            ) from exc
        finally:
            if owns_client:
                await client.aclose()
