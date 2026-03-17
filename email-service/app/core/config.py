from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # SMTP
    smtp_host: str = "mailpit"
    smtp_port: int = 1025
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "noreply@orbispm.local"
    smtp_use_tls: bool = False

    # Redis (for arq job queue)
    redis_url: str = "redis://localhost:6379/1"

    # Service
    api_key: str = "email-service-dev-key"
    frontend_url: str = "http://localhost:3000"
    log_level: str = "INFO"

    # Rate limiting
    max_emails_per_minute: int = 60

    model_config = {"env_prefix": "EMAIL_"}


settings = Settings()
