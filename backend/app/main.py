from fastapi import FastAPI

from app.routers import poke

app = FastAPI(title="4sight", version="0.1.0")

app.include_router(poke.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
