/** Réservations : libellés, fuseaux horaires et créneaux. */
import type { Schemas } from "@/lib/api/client";

export type ReservationStatus = Schemas["ReservationStatus"];
export type Reservation = Schemas["ReservationOut"];
export type PublicReservation = Schemas["PublicReservationOut"];

export const RESERVATION_STATUS: Record<ReservationStatus, { label: string; className: string }> = {
  PENDING: { label: "En attente", className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200" },
  CONFIRMED: { label: "Confirmée", className: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200" },
  DECLINED: { label: "Refusée", className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200" },
  CANCELLED: {
    label: "Annulée",
    className: "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  },
  SEATED: { label: "Arrivé·e", className: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200" },
  NO_SHOW: { label: "Absent·e", className: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200" },
};

/** Messages d'erreur de l'API reformulés pour le client. */
export const RESERVATION_ERRORS: Record<string, string> = {
  reservation_too_soon: "Choisissez un horaire au moins 30 minutes à l'avance.",
  too_far: "Les réservations sont possibles jusqu'à 90 jours à l'avance.",
  restaurant_closed_at: "Le restaurant est fermé à cet horaire : choisissez un autre créneau.",
  reservations_disabled: "Ce restaurant ne prend pas de réservations en ligne pour le moment.",
  rate_limited: "Trop de demandes de réservation. Réessayez plus tard.",
};

function parts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  return {
    y: Number(p.year),
    m: Number(p.month),
    d: Number(p.day),
    h: Number(p.hour) % 24,
    mi: Number(p.minute),
    s: Number(p.second),
  };
}

/** Décalage (minutes) du fuseau `timeZone` par rapport à UTC à l'instant `date`. */
export function tzOffsetMinutes(date: Date, timeZone: string): number {
  const p = parts(date, timeZone);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/**
 * Heure locale du restaurant → ISO 8601 avec décalage.
 * `zonedIso("2026-11-06", "20:00", "Europe/Paris")` → "2026-11-06T20:00:00+01:00".
 */
export function zonedIso(day: string, time: string, timeZone: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, h, mi);
  let offset = tzOffsetMinutes(new Date(wall), timeZone);
  // Deuxième passe : l'heure locale peut tomber de l'autre côté d'un changement d'heure.
  offset = tzOffsetMinutes(new Date(wall - offset * 60000), timeZone);
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  const off = `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
  return `${day}T${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}:00${off}`;
}

/** Date du jour (YYYY-MM-DD) dans un fuseau donné (celui du navigateur par défaut). */
export function todayIn(timeZone?: string, now: Date = new Date()): string {
  if (!timeZone) {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }
  const p = parts(now, timeZone);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/** Ajoute des jours à une date ISO (YYYY-MM-DD). */
export function shiftDay(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** "2026-11-06" → "vendredi 6 novembre". */
export function formatDayLabel(iso: string, opts: Intl.DateTimeFormatOptions = {}): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("fr-FR", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    ...opts,
  });
}

/** Heure d'une réservation (HH:MM) dans le fuseau du restaurant. */
export function formatResTime(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone });
}

/** Jour + heure lisibles, ex. "vendredi 6 novembre à 20:00". */
export function formatResDateTime(iso: string, timeZone?: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone });
  return `${day} à ${formatResTime(iso, timeZone)}`;
}

/** Jour (YYYY-MM-DD) d'une réservation dans le fuseau du restaurant. */
export function reservationDay(iso: string, timeZone?: string): string {
  return todayIn(timeZone, new Date(iso));
}

type Hours = Schemas["HoursSlot"][];

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

/**
 * Créneaux de 30 min (HH:MM) d'un jour donné, selon les horaires d'ouverture.
 * Sans horaires renseignés, propose 11:00 → 22:30. `minMinutes` exclut les créneaux trop proches (jour même).
 */
export function timeSlots(day: string, hours: Hours, minMinutes = -1): string[] {
  const [y, m, d] = day.split("-").map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // 0 = lundi (format API)
  const ranges: [number, number][] = hours.length
    ? hours
        .filter((h) => h.day_of_week === dow)
        .map((h) => {
          const o = toMin(h.opens_at);
          const c = toMin(h.closes_at);
          return [o, c > o ? c : 24 * 60] as [number, number];
        })
    : [[11 * 60, 23 * 60]];
  const out = new Set<number>();
  for (const [o, c] of ranges) {
    for (let t = Math.ceil(o / 30) * 30; t < c && t < 24 * 60; t += 30) if (t >= minMinutes) out.add(t);
  }
  return [...out]
    .sort((a, b) => a - b)
    .map((t) => `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`);
}
