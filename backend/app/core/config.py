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
