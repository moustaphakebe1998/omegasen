/**
 * Tables : un QR Code de table encode `/q/{code}?table=T5` (même code permanent que le QR du restaurant).
 * La table est transmise à la page du restaurant puis préremplie dans la commande (`table_label`).
 */

/** Étiquette de table acceptée (même règle que l'API : lettres, chiffres, « - » et « _ », 20 caractères). */
export function tableParam(value: string | string[] | null | undefined): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  return v && /^[A-Za-z0-9_-]{1,20}$/.test(v) ? v : null;
}
