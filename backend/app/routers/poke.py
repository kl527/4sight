"""Poke integration — send iMessage/SMS nudges."""

from fastapi import APIRouter, HTTPException

from app.models import SendMessageRequest, SendMessageResponse
from app.services.poke import poke_client

router = APIRouter(prefix="/poke", tags=["poke"])


@router.post("/send", response_model=SendMessageResponse)
async def send_message(req: SendMessageRequest):
    """Send a message through Poke (delivered as iMessage/SMS)."""
    try:
        data = await poke_client.send(req.message)
        return SendMessageResponse(success=True, data=data)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
