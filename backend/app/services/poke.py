"""Poke API client — sends iMessage/SMS nudges to users.

API: POST https://poke.com/api/v1/inbound-sms/webhook
Auth: Bearer token from https://poke.com/settings/advanced
Body: {"message": "your message text"}
"""

import httpx

from app.config import settings


class PokeClient:
    ENDPOINT = "https://poke.com/api/v1/inbound-sms/webhook"

    def __init__(self):
        self._headers = {
            "Authorization": f"Bearer {settings.poke_api_key}",
            "Content-Type": "application/json",
        }

    async def send(self, message: str) -> dict:
        """Send a message through Poke (delivered via iMessage/SMS)."""
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                self.ENDPOINT,
                headers=self._headers,
                json={"message": message},
            )
            resp.raise_for_status()
            return resp.json()


poke_client = PokeClient()
