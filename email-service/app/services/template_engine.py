import json
import logging
from pathlib import Path
from typing import Any

import redis
from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.core.config import settings

logger = logging.getLogger(__name__)

TEMPLATE_DIR = Path(__file__).parent.parent / "templates"

_env = Environment(
    loader=FileSystemLoader(str(TEMPLATE_DIR)),
    autoescape=select_autoescape(["html"]),
)

# Redis-backed store for custom org templates.
# Key pattern: email:templates:{org_id}:{template_name}
# Value: JSON {"html": str, "design": dict | None}
_REDIS_PREFIX = "email:templates"


def _get_redis() -> redis.Redis:
    """Get a synchronous Redis connection (lazy, reusable via connection pool)."""
    return redis.from_url(settings.redis_url, decode_responses=True)


def _key(org_id: str, template_name: str) -> str:
    return f"{_REDIS_PREFIX}:{org_id}:{template_name}"


def _org_pattern(org_id: str) -> str:
    return f"{_REDIS_PREFIX}:{org_id}:*"


def render_template(template_name: str, context: dict, org_id: str | None = None) -> str:
    """Render an email template with context variables.

    Priority:
      1. Custom org template (if org_id provided and template exists)
      2. Built-in template from templates/ directory
      3. Fallback to defaults/notification.html
    """
    ctx = {**context, "frontend_url": settings.frontend_url, "app_name": "Simplify Projects"}

    # Check custom org template first
    if org_id:
        entry = get_custom_template(org_id, template_name)
        if entry and entry.get("html"):
            tmpl = _env.from_string(entry["html"])
            return tmpl.render(**ctx)

    # Try built-in template
    try:
        tmpl = _env.get_template(f"{template_name}.html")
        return tmpl.render(**ctx)
    except Exception:
        logger.warning("Template %s not found, using default", template_name)
        tmpl = _env.get_template("defaults/notification.html")
        return tmpl.render(**ctx)


def set_custom_template(org_id: str, template_name: str, html: str, design: dict | None = None) -> None:
    """Store a custom template for an org in Redis."""
    r = _get_redis()
    data = json.dumps({"html": html, "design": design})
    r.set(_key(org_id, template_name), data)


def get_custom_template(org_id: str, template_name: str) -> dict[str, Any] | None:
    """Get a custom template entry for an org from Redis."""
    r = _get_redis()
    raw = r.get(_key(org_id, template_name))
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        logger.error("Corrupt template data for %s/%s", org_id, template_name)
        return None


def list_custom_templates(org_id: str) -> list[str]:
    """List custom template names for an org."""
    r = _get_redis()
    prefix = _org_pattern(org_id)
    keys = r.keys(prefix)
    # Extract template name from key: email:templates:{org_id}:{name}
    strip = f"{_REDIS_PREFIX}:{org_id}:"
    return sorted(k.removeprefix(strip) for k in keys)


def delete_custom_template(org_id: str, template_name: str) -> bool:
    """Delete a custom template for an org from Redis."""
    r = _get_redis()
    return r.delete(_key(org_id, template_name)) > 0


def list_default_templates() -> list[str]:
    """List built-in template names."""
    templates = []
    for p in TEMPLATE_DIR.rglob("*.html"):
        rel = p.relative_to(TEMPLATE_DIR)
        templates.append(str(rel).replace(".html", "").replace("/", "."))
    return sorted(templates)
