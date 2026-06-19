import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Auth
    auth_password_omar: str = "testmercury"
    auth_password_emanuel: str = "testmercury"
    auth_secret_key: str = "change-this-in-production"
    auth_algorithm: str = "HS256"
    auth_token_expire_hours: int = 24 * 7  # 1 week

    # App
    database_url: str = "sqlite:///./data/phoenix_finance.db"
    allowed_origins: str = "http://localhost:3000"
    # Set to false during local HTTP dev; must be true on HTTPS (Coolify)
    cookie_secure: bool = True

    # Mercury
    mercury_excluded_accounts: str = "Smylife LLC"

    # SMTP (optional — enables forgot-password and balance alerts)
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_use_ssl: bool = False  # set True for port 465

    # Per-user recovery email
    auth_email_omar: str = ""
    auth_email_emanuel: str = ""

    class Config:
        env_file = ".env"
        extra = "allow"  # ignore unknown keys from the shared .env

    def get_mercury_tokens(self) -> dict[str, str]:
        """Auto-discover all MERCURY_TOKEN_* env vars with non-empty values."""
        return {
            k: v
            for k, v in os.environ.items()
            if k.startswith("MERCURY_TOKEN_") and v.strip()
        }

    def get_excluded_names(self) -> list[str]:
        return [
            n.strip().lower()
            for n in self.mercury_excluded_accounts.split(",")
            if n.strip()
        ]

    def get_allowed_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


settings = Settings()
