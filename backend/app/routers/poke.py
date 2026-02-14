"""Poke integration — send iMessage/SMS nudges."""

from fastapi import APIRouter, HTTPException, Request

from app.models import SendMessageRequest, SendMessageResponse
from app.services.poke import poke_client

router = APIRouter(prefix="/poke", tags=["poke"])


@router.post("/send", response_model=SendMessageResponse)
async def send_message(req: SendMessageRequest, request: Request):
    """Send a message through Poke (delivered as iMessage/SMS)."""
    api_key = request.headers.get("x-poke-api-key", "")
    if not api_key:
        raise HTTPException(status_code=500, detail="Poke API key not configured")
    try:
        data = await poke_client.send(req.message, api_key)
        return SendMessageResponse(success=True, data=data)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
