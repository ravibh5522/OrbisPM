from pydantic import BaseModel, EmailStr


class EmailRequest(BaseModel):
    to: str
    subject: str
    template: str = "default"
    context: dict = {}
    # Direct HTML body (overrides template)
    html_body: str | None = None


class BulkEmailRequest(BaseModel):
    recipients: list[str]
    subject: str
    template: str = "default"
    context: dict = {}


class EmailResponse(BaseModel):
    job_id: str
    status: str = "queued"


class HealthResponse(BaseModel):
    status: str = "ok"
    smtp_configured: bool = True
    queue_connected: bool = True
