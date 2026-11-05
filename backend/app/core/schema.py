from pydantic import BaseModel, ConfigDict


class Schema(BaseModel):
    """Base des schémas d'API : en sortie, les champs à valeur par défaut sont toujours présents,
    donc marqués « requis » dans l'OpenAPI (types TypeScript générés plus précis)."""

    model_config = ConfigDict(json_schema_serialization_defaults_required=True)
