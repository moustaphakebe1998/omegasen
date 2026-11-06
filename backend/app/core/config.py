"""Configuration par environnement (variables d'environnement / fichier .env)."""

from functools import lru_cache
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", "../.env"), env_file_encoding="utf-8", extra="ignore")

    environment: Literal["development", "test", "production"] = "development"
    public_app_url: str = "http://localhost:3100"
    api_public_url: str = "http://localhost:8100"

    # Sécurité
    jwt_secret: str = "change-me-dev-secret-at-least-32-characters-long"
    jwt_algorithm: str = "HS256"
    access_token_ttl_minutes: int = 15
    refresh_token_ttl_days: int = 30
    cors_origins: str = "http://localhost:3100"
    max_login_attempts: int = 5
    lockout_minutes: int = 15

    # Infrastructure
    database_url: str = "postgresql+asyncpg://omegasen:omegasen@localhost:54330/omegasen"
    redis_url: str = "redis://localhost:63790/0"

    # Stockage S3 / MinIO
    s3_endpoint_url: str | None = "http://localhost:9010"
    s3_public_base_url: str = "http://localhost:9010/omegasen-media"
    s3_access_key: str = "omegasen"
    s3_secret_key: str = "omegasen-secret"
    s3_bucket: str = "omegasen-media"
    s3_region: str = "us-east-1"
    max_upload_mb: int = 10

    # Comptes : durée de validité des liens envoyés par email
    activation_ttl_hours: int = Field(default=72, ge=1, le=24 * 30)
    reset_ttl_minutes: int = Field(default=60, ge=5, le=24 * 60)

    # Emails (SMTP). Sans SMTP_HOST, les emails sont seulement écrits dans les journaux (développement).
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_starttls: bool = True  # port 587
    smtp_ssl: bool = False  # port 465
    email_from: str = "OmegaSen <no-reply@omegasen.local>"

    # Bootstrap
    superadmin_email: str | None = None
    superadmin_password: str | None = None

    # Métier
    order_late_after_minutes: int = Field(default=15, ge=1)

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @model_validator(mode="after")
    def _check_production_secrets(self) -> "Settings":
        if self.is_production:
            if self.jwt_secret.startswith("change-me") or len(self.jwt_secret) < 32:
                raise ValueError("JWT_SECRET doit être défini (≥ 32 caractères) en production")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


def allow_test_email_domain() -> None:
    """Hors production : accepte les adresses en `.test` (domaine réservé RFC 2606).

    `email-validator` refuse par défaut les domaines à usage spécial ; les comptes de démonstration
    (ex. owner@baobab.test, voir docs/BAOBAB_TEST_ENVIRONMENT.md) doivent pourtant pouvoir se connecter.
    En production, la règle par défaut reste appliquée : ces adresses ne peuvent pas exister.
    """
    import email_validator

    if not get_settings().is_production and "test" in email_validator.SPECIAL_USE_DOMAIN_NAMES:
        email_validator.SPECIAL_USE_DOMAIN_NAMES.remove("test")
