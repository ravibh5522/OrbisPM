"""Email service API routes."""

from fastapi import APIRouter, Depends, Header, HTTPException

from app.core.config import settings
from app.models.email import (
    BulkEmailRequest,
    EmailRequest,
    EmailResponse,
    HealthResponse,
)
from app.services.queue import enqueue_email
from app.services.template_engine import (
    delete_custom_template,
    get_custom_template,
    list_custom_templates,
    list_default_templates,
    render_template,
    set_custom_template,
)

router = APIRouter()


def verify_api_key(x_api_key: str = Header(...)) -> None:
    if x_api_key != settings.api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")


@router.get("/health", response_model=HealthResponse)
async def health():
    return HealthResponse()


@router.post("/send", response_model=EmailResponse, dependencies=[Depends(verify_api_key)])
async def send_email_endpoint(req: EmailRequest):
    """Queue a single email for delivery."""
    job_id = await enqueue_email(
        to=req.to,
        subject=req.subject,
        template=req.template,
        context=req.context,
        html_body=req.html_body,
        org_id=req.context.get("org_id"),
    )
    return EmailResponse(job_id=job_id)


@router.post("/send-bulk", response_model=list[EmailResponse], dependencies=[Depends(verify_api_key)])
async def send_bulk_email(req: BulkEmailRequest):
    """Queue emails to multiple recipients."""
    results = []
    for to in req.recipients:
        job_id = await enqueue_email(
            to=to,
            subject=req.subject,
            template=req.template,
            context=req.context,
            org_id=req.context.get("org_id"),
        )
        results.append(EmailResponse(job_id=job_id))
    return results


# ── Template management ──


@router.get("/templates", dependencies=[Depends(verify_api_key)])
async def get_templates():
    """List all default templates."""
    return {"defaults": list_default_templates()}


@router.get("/templates/{org_id}", dependencies=[Depends(verify_api_key)])
async def get_org_templates(org_id: str):
    """List custom templates for an org."""
    return {"templates": list_custom_templates(org_id)}


@router.get("/templates/{org_id}/{template_name}", dependencies=[Depends(verify_api_key)])
async def get_org_template(org_id: str, template_name: str):
    """Get a custom template for an org."""
    entry = get_custom_template(org_id, template_name)
    if entry is None:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"template_name": template_name, "html": entry["html"], "design": entry.get("design")}


@router.put("/templates/{org_id}/{template_name}", dependencies=[Depends(verify_api_key)])
async def upsert_org_template(org_id: str, template_name: str, body: dict):
    """Create or update a custom template for an org."""
    html = body.get("html")
    if not html:
        raise HTTPException(status_code=400, detail="html field required")
    design = body.get("design")  # Optional Unlayer design JSON
    set_custom_template(org_id, template_name, html, design)
    return {"status": "ok", "template_name": template_name}


@router.delete("/templates/{org_id}/{template_name}", dependencies=[Depends(verify_api_key)])
async def remove_org_template(org_id: str, template_name: str):
    """Delete a custom template for an org."""
    if not delete_custom_template(org_id, template_name):
        raise HTTPException(status_code=404, detail="Template not found")
    return {"status": "deleted"}


@router.post("/templates/{org_id}/render", dependencies=[Depends(verify_api_key)])
async def render_template_endpoint(org_id: str, body: dict):
    """Render a template (custom or default) with provided context and return HTML."""
    template_name = body.get("template", "")
    if not template_name:
        raise HTTPException(status_code=400, detail="template field required")
    context = body.get("context") or {}
    if not isinstance(context, dict):
        raise HTTPException(status_code=400, detail="context must be an object")
    html = render_template(template_name, context, org_id=org_id)
    return {"html": html}
