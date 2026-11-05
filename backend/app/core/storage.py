"""Stockage objet compatible S3 (MinIO en dev, n'importe quel S3 en production).

Les images publiques (logos, couvertures, galeries, plats) sont servies directement
via S3_PUBLIC_BASE_URL ; PostgreSQL ne stocke que les clés et métadonnées.
"""

import json
from functools import lru_cache

import boto3
import structlog
from botocore.config import Config
from botocore.exceptions import ClientError
from starlette.concurrency import run_in_threadpool

from app.core.config import get_settings

log = structlog.get_logger()

PUBLIC_PREFIX = "public/"


@lru_cache
def _client():
    s = get_settings()
    return boto3.client(
        "s3",
        endpoint_url=s.s3_endpoint_url or None,
        aws_access_key_id=s.s3_access_key,
        aws_secret_access_key=s.s3_secret_key,
        region_name=s.s3_region,
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )


def reset_client_cache() -> None:
    _client.cache_clear()


def public_url(key: str | None) -> str | None:
    if not key:
        return None
    return f"{get_settings().s3_public_base_url.rstrip('/')}/{key}"


async def put_object(key: str, data: bytes, content_type: str) -> None:
    s = get_settings()
    await run_in_threadpool(
        _client().put_object,
        Bucket=s.s3_bucket,
        Key=key,
        Body=data,
        ContentType=content_type,
        CacheControl="public, max-age=31536000, immutable",
    )


async def get_object(key: str) -> bytes | None:
    s = get_settings()
    try:
        obj = await run_in_threadpool(_client().get_object, Bucket=s.s3_bucket, Key=key)
        return await run_in_threadpool(obj["Body"].read)
    except ClientError:
        return None


async def delete_objects(keys: list[str]) -> None:
    if not keys:
        return
    s = get_settings()
    try:
        await run_in_threadpool(
            _client().delete_objects,
            Bucket=s.s3_bucket,
            Delete={"Objects": [{"Key": k} for k in keys], "Quiet": True},
        )
    except ClientError:
        log.warning("s3_delete_failed", keys=keys)


def ensure_bucket() -> None:
    """Crée le bucket et autorise la lecture anonyme du seul préfixe public/."""
    s = get_settings()
    client = _client()
    try:
        client.head_bucket(Bucket=s.s3_bucket)
    except ClientError:
        client.create_bucket(Bucket=s.s3_bucket)
    policy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Principal": {"AWS": ["*"]},
                "Action": ["s3:GetObject"],
                "Resource": [f"arn:aws:s3:::{s.s3_bucket}/{PUBLIC_PREFIX}*"],
            }
        ],
    }
    try:
        client.put_bucket_policy(Bucket=s.s3_bucket, Policy=json.dumps(policy))
    except ClientError:
        log.warning("s3_bucket_policy_failed", bucket=s.s3_bucket)
