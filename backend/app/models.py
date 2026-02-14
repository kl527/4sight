from pydantic import BaseModel


class SendMessageRequest(BaseModel):
    message: str


class SendMessageResponse(BaseModel):
    success: bool
    data: dict | None = None
    error: str | None = None
