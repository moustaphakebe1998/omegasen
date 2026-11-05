"""Montants : entiers en unités mineures (centimes pour EUR, francs pour XOF).

Les prix du menu sont saisis TTC ; la TVA est *extraite* du TTC, jamais ajoutée.
"""

from decimal import ROUND_HALF_UP, Decimal

# Nombre de décimales par devise (ISO 4217).
CURRENCY_EXPONENT: dict[str, int] = {"EUR": 2, "XOF": 0}
SUPPORTED_CURRENCIES = tuple(CURRENCY_EXPONENT)


def extract_vat(total_incl_tax: int, rate_bp: int) -> int:
    """TVA contenue dans un montant TTC. `rate_bp` en points de base (2000 = 20 %)."""
    if rate_bp <= 0 or total_incl_tax <= 0:
        return 0
    tax = Decimal(total_incl_tax) * Decimal(rate_bp) / (Decimal(10_000) + Decimal(rate_bp))
    return int(tax.quantize(Decimal(1), rounding=ROUND_HALF_UP))
