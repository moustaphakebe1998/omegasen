"""Validation et optimisation des images avec Pillow.

- formats acceptés : JPEG, PNG, WEBP (détectés sur le contenu, pas sur l'extension)
- limite de pixels contre les « bombes de décompression »
- ré-encodage systématique en WebP (supprime EXIF / GPS) + miniatures
"""

import io
from dataclasses import dataclass

from PIL import Image, ImageOps, UnidentifiedImageError

from app.core.errors import Unprocessable

ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}
MAX_PIXELS = 40_000_000
VARIANTS = {"original": 2000, "medium": 800, "thumb": 320}


@dataclass
class ProcessedImage:
    width: int
    height: int
    variants: dict[str, bytes]  # nom → octets WebP


def process_image(data: bytes) -> ProcessedImage:
    Image.MAX_IMAGE_PIXELS = MAX_PIXELS
    try:
        with Image.open(io.BytesIO(data)) as probe:
            fmt = probe.format
            probe.verify()
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, SyntaxError) as e:
        raise Unprocessable("Fichier image invalide ou corrompu", code="invalid_image") from e
    if fmt not in ALLOWED_FORMATS:
        raise Unprocessable("Format non supporté (JPEG, PNG ou WEBP uniquement)", code="invalid_image")

    with Image.open(io.BytesIO(data)) as img:
        img = ImageOps.exif_transpose(img)
        has_alpha = img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info)
        img = img.convert("RGBA" if has_alpha else "RGB")
        width, height = img.size
        out: dict[str, bytes] = {}
        for name, max_side in VARIANTS.items():
            copy = img.copy()
            copy.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
            buf = io.BytesIO()
            copy.save(buf, format="WEBP", quality=82 if name != "thumb" else 75, method=4)
            out[name] = buf.getvalue()
        orig_w, orig_h = Image.open(io.BytesIO(out["original"])).size
    return ProcessedImage(width=orig_w or width, height=orig_h or height, variants=out)
