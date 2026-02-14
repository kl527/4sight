from fastapi import FastAPI

from app.routers import poke, vision

app = FastAPI(title="4sight", version="0.1.0")

app.include_router(poke.router)
app.include_router(vision.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
