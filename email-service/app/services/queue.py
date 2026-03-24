"""ARQ-based async job queue for email delivery."""

import logging
import uuid

from arq import create_pool
from arq.connections import ArqRedis, RedisSettings

from app.core.config import settings
from app.services.smtp_sender import send_email
from app.services.template_engine import render_template

logger = logging.getLogger(__name__)

_pool: ArqRedis | None = None


def _redis_settings() -> RedisSettings:
    """Parse redis URL into arq RedisSettings."""
    url = settings.redis_url
    # redis://[:password@]host:port/db
    url = url.replace("redis://", "")
    password = None
    if "@" in url:
        creds, url = url.rsplit("@", 1)
        if ":" in creds:
            password = creds.split(":", 1)[1]
    host_port, *db = url.split("/")
    host, port = host_port.rsplit(":", 1) if ":" in host_port else (host_port, "6379")
    database = int(db[0]) if db else 1
    return RedisSettings(host=host, port=int(port), password=password, database=database)


async def get_pool() -> ArqRedis:
    """Get or create the arq Redis connection pool."""
    global _pool
    if _pool is None:
        _pool = await create_pool(_redis_settings())
    return _pool


async def close_pool() -> None:
    """Close the arq Redis connection pool."""
    global _pool
    if _pool:
        await _pool.aclose()
        _pool = None


async def enqueue_email(
    to: str,
    subject: str,
    template: str = "default",
    context: dict | None = None,
    html_body: str | None = None,
    org_id: str | None = None,
) -> str:
    """Enqueue an email for async delivery. Returns a job ID."""
    pool = await get_pool()
    job_id = str(uuid.uuid4())
    await pool.enqueue_job(
        "deliver_email",
        to=to,
        subject=subject,
        template=template,
        context=context or {},
        html_body=html_body,
        org_id=org_id,
        _job_id=job_id,
    )
    logger.info("Enqueued email job %s to %s", job_id, to)
    return job_id


# ── ARQ worker functions ──

async def deliver_email(
    ctx: dict,
    to: str,
    subject: str,
    template: str = "default",
    context: dict | None = None,
    html_body: str | None = None,
    org_id: str | None = None,
) -> str:
    """ARQ worker function that sends an email."""
    if html_body is None:
        html_body = render_template(template, context or {}, org_id=org_id)
    await send_email(to, subject, html_body)
    return f"sent:{to}"


class WorkerSettings:
    """ARQ worker settings — run with: arq app.services.queue.WorkerSettings"""
    functions = [deliver_email]
    redis_settings = _redis_settings()
    max_jobs = 20
    job_timeout = 30
    max_tries = 3
    retry_delay = 5
