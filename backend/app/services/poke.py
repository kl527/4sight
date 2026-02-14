"""Poke API client — sends iMessage/SMS nudges to users.

API: POST https://poke.com/api/v1/inbound-sms/webhook
Auth: Bearer token from https://poke.com/settings/advanced
Body: {"message": "your message text"}
"""

import httpx


class PokeClient:
    ENDPOINT = "https://poke.com/api/v1/inbound-sms/webhook"

    async def send(self, message: str, api_key: str) -> dict:
        """Send a message through Poke (delivered via iMessage/SMS)."""
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                self.ENDPOINT,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={"message": message},
            )
            resp.raise_for_status()
            return resp.json()


poke_client = PokeClient()
