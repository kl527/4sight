import os

from fastapi import FastAPI

from app.routers import poke, vision

app = FastAPI(title="4sight", version="0.1.0")

app.include_router(poke.router)
app.include_router(vision.router)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/debug/env")
async def debug_env():
    return {
        "MODAL_TOKEN_ID": bool(os.getenv("MODAL_TOKEN_ID")),
        "MODAL_TOKEN_SECRET": bool(os.getenv("MODAL_TOKEN_SECRET")),
        "MODAL_APP_NAME": os.getenv("MODAL_APP_NAME", ""),
        "MODAL_CLASS_NAME": os.getenv("MODAL_CLASS_NAME", ""),
    }
