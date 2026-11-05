from enum import StrEnum

from sqlalchemy import Enum


def str_enum(enum_cls: type[StrEnum], name: str | None = None) -> Enum:
    """Enum stockée en VARCHAR + contrainte CHECK (plus simple à faire évoluer qu'un type PG natif)."""
    return Enum(
        enum_cls,
        native_enum=False,
        create_constraint=True,
        length=32,
        name=name or enum_cls.__name__.lower(),
        values_callable=lambda e: [m.value for m in e],
        validate_strings=True,
    )
