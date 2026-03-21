"""OrbisPM Email Service — FastAPI application."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.routes import router
from app.core.config import settings
from app.services.queue import close_pool

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await close_pool()


app = FastAPI(
    title="OrbisPM Email Service",
    version="1.0.0",
    lifespan=lifespan,
)

app.include_router(router, prefix="/api/v1/email")
