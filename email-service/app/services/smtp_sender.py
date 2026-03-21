import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import aiosmtplib

from app.core.config import settings

logger = logging.getLogger(__name__)


async def send_email(to: str, subject: str, html_body: str) -> None:
    """Send a single email via SMTP."""
    msg = MIMEMultipart("alternative")
    msg["From"] = settings.smtp_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    kwargs: dict = {
        "hostname": settings.smtp_host,
        "port": settings.smtp_port,
        "use_tls": settings.smtp_use_tls,
    }
    if settings.smtp_user:
        kwargs["username"] = settings.smtp_user
        kwargs["password"] = settings.smtp_password

    try:
        await aiosmtplib.send(msg, **kwargs)
        logger.info("Email sent to %s: %s", to, subject)
    except Exception:
        logger.exception("Failed to send email to %s", to)
        raise
