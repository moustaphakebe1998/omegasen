"use client";

import { ChevronDown, Clock, Mail, MapPin, Phone, UtensilsCrossed } from "lucide-react";
import { useId, useState } from "react";

import { OpenBadge } from "@/components/public/restaurant-search";
import type { Schemas } from "@/lib/api/client";
import { DAYS } from "@/lib/format";
import { cn } from "@/lib/utils";

type Restaurant = Schemas["PublicRestaurant"];

const hhmm = (t: string) => t.slice(0, 5);

/** Index du jour courant au format API (0 = lundi). */
function todayIndex() {
  return (new Date().getDay() + 6) % 7;
}

function slotsByDay(hours: Schemas["HoursSlot"][]) {
  return DAYS.map((_, d) =>
    hours
      .filter((h) => h.day_of_week === d)
      .sort((a, b) => a.opens_at.localeCompare(b.opens_at))
      .map((h) => `${hhmm(h.opens_at)} – ${hhmm(h.closes_at)}`),
  );
}

function OpeningHours({ hours }: { hours: Schemas["HoursSlot"][] }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (hours.length === 0) return null;
  const days = slotsByDay(hours);
  const today = todayIndex();
  const todaySlots = days[today];

  return (
    <div className="rounded-lg border bg-card">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Clock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="font-medium">Horaires</span>
          <span className="text-muted-foreground">
            {" · Aujourd'hui : "}
            {todaySlots.length ? todaySlots.join(", ") : "fermé"}
          </span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <dl id={id} className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 border-t px-3 py-3 text-sm">
          {DAYS.map((day, d) => (
            <div key={day} className={cn("contents", d === today && "font-semibold")}>
              <dt>{day}</dt>
              <dd className="tabular text-right text-muted-foreground">
                {days[d].length ? days[d].join(", ") : "Fermé"}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

export function RestaurantHeader({ restaurant: r, kiosk }: { restaurant: Restaurant; kiosk: boolean }) {
  const address = [r.address_line, r.postal_code, r.city].filter(Boolean).join(", ");
  const mapsUrl =
    r.latitude != null && r.longitude != null
      ? `https://www.google.com/maps/search/?api=1&query=${r.latitude},${r.longitude}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${r.name} ${address}`)}`;

  return (
    <header>
      <div className={cn("relative bg-gradient-to-br from-primary/80 to-amber-300", kiosk ? "h-32 md:h-40" : "h-40 sm:h-56")}>
        {r.cover_url ? (
          <img src={r.cover_url} alt="" className="size-full object-cover" />
        ) : (
          <UtensilsCrossed className="absolute inset-0 m-auto size-12 text-white/60" aria-hidden />
        )}
      </div>
      <div className="mx-auto w-full max-w-5xl px-4">
        <div className="-mt-10 flex items-end gap-4">
          <div className="size-20 shrink-0 overflow-hidden rounded-2xl border-4 border-background bg-muted shadow-md">
            {r.logo_url ? (
              <img src={r.logo_url} alt={`Logo ${r.name}`} className="size-full object-cover" />
            ) : (
              <span className="flex size-full items-center justify-center text-2xl font-black text-muted-foreground">
                {r.name.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <OpenBadge open={r.is_open_now} className="mb-1" />
        </div>
        <h1 className={cn("mt-3 font-black tracking-tight break-words", kiosk ? "text-3xl md:text-4xl" : "text-2xl sm:text-3xl")}>
          {r.name}
        </h1>
        {(r.cuisine || r.city) && (
          <p className="text-muted-foreground">{[r.cuisine, r.city].filter(Boolean).join(" · ")}</p>
        )}
        {r.description && !kiosk && <p className="mt-2 max-w-2xl text-sm">{r.description}</p>}

        {!kiosk && (
          <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            {address && (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-11 items-center gap-2 rounded-lg border bg-card px-3 py-2 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 break-words">{address}</span>
                <span className="sr-only">(ouvre une carte dans un nouvel onglet)</span>
              </a>
            )}
            {r.phone && (
              <a
                href={`tel:${r.phone.replace(/[^\d+]/g, "")}`}
                className="flex min-h-11 items-center gap-2 rounded-lg border bg-card px-3 py-2 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Phone className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span>{r.phone}</span>
              </a>
            )}
            {r.email && (
              <a
                href={`mailto:${r.email}`}
                className="flex min-h-11 items-center gap-2 rounded-lg border bg-card px-3 py-2 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate">{r.email}</span>
              </a>
            )}
            <div className="sm:col-span-2">
              <OpeningHours hours={r.opening_hours} />
            </div>
          </div>
        )}

        {!kiosk && r.gallery.length > 0 && (
          <section aria-label="Galerie photos" className="mt-4">
            <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
              {r.gallery.map((m) => (
                <li key={m.id} className="shrink-0 snap-start">
                  <img
                    src={m.medium_url || m.url}
                    alt={m.alt ?? ""}
                    loading="lazy"
                    className="h-32 w-48 rounded-lg object-cover sm:h-40 sm:w-60"
                  />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </header>
  );
}
