"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Copy, Info, Loader2, Moon, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, type Schemas, unwrap } from "@/lib/api/client";
import { DAYS } from "@/lib/format";
import { actionErrorMessage } from "@/lib/permissions";

import { FormError, SectionTitle } from "./fields";
import { type Restaurant, restaurantKey } from "./use-restaurant";

type Slot = { key: string; opens: string; closes: string };
type Week = Slot[][];

const MAX_SLOTS = 28;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const slotSchema = z
  .object({
    opens: z.string().regex(HHMM, "Heure d'ouverture invalide"),
    closes: z.string().regex(HHMM, "Heure de fermeture invalide"),
  })
  .refine((s) => s.opens !== s.closes, "L'ouverture et la fermeture doivent différer");

const newKey = () => Math.random().toString(36).slice(2);

function toWeek(hours: Schemas["HoursSlot"][]): Week {
  const week: Week = DAYS.map(() => []);
  for (const h of [...hours].sort((a, b) => a.opens_at.localeCompare(b.opens_at))) {
    week[h.day_of_week]?.push({ key: newKey(), opens: h.opens_at.slice(0, 5), closes: h.closes_at.slice(0, 5) });
  }
  return week;
}

const serialize = (week: Week) => JSON.stringify(week.map((d) => d.map(({ opens, closes }) => [opens, closes])));

export function HoursEditor({ restaurant, editable = true }: { restaurant: Restaurant; editable?: boolean }) {
  const qc = useQueryClient();
  const rid = restaurant.id;
  const [week, setWeek] = useState<Week>(() => toWeek(restaurant.opening_hours));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(() => serialize(toWeek(restaurant.opening_hours)));

  const total = week.reduce((n, d) => n + d.length, 0);
  const current = serialize(week);
  const dirty = current !== saved;

  const setDay = (day: number, fn: (slots: Slot[]) => Slot[]) =>
    setWeek((w) => w.map((slots, i) => (i === day ? fn(slots) : slots)));

  const addSlot = (day: number) =>
    setDay(day, (slots) => {
      const last = slots[slots.length - 1];
      return [
        ...slots,
        last ? { key: newKey(), opens: "19:00", closes: "23:00" } : { key: newKey(), opens: "11:00", closes: "15:00" },
      ];
    });

  const copyToAll = (day: number) => {
    const src = week[day];
    if (src.length * 7 > MAX_SLOTS) {
      toast.error(`Maximum ${MAX_SLOTS} plages au total.`);
      return;
    }
    setWeek(DAYS.map(() => src.map((s) => ({ ...s, key: newKey() }))));
    toast.success(`Horaires du ${DAYS[day].toLowerCase()} copiés sur tous les jours`);
  };

  const save = async () => {
    setError(null);
    const errs: Record<string, string> = {};
    week.forEach((slots, d) =>
      slots.forEach((s, i) => {
        const r = slotSchema.safeParse(s);
        if (!r.success) errs[`${d}-${i}`] = r.error.issues[0]?.message ?? "Plage invalide";
      }),
    );
    setErrors(errs);
    if (Object.keys(errs).length) {
      setError("Certaines plages horaires sont invalides.");
      return;
    }
    if (total > MAX_SLOTS) {
      setError(`Maximum ${MAX_SLOTS} plages au total.`);
      return;
    }
    const body = week.flatMap((slots, d) =>
      slots.map((s) => ({ day_of_week: d, opens_at: s.opens, closes_at: s.closes })),
    );
    setSaving(true);
    try {
      const hours = await unwrap(
        api.PUT("/api/restaurants/{restaurant_id}/opening-hours", { params: { path: { restaurant_id: rid } }, body }),
      );
      qc.setQueryData<Restaurant>(restaurantKey(rid), (r) => (r ? { ...r, opening_hours: hours } : r));
      await qc.invalidateQueries({ queryKey: restaurantKey(rid) });
      setSaved(current);
      toast.success("Horaires enregistrés");
    } catch (e) {
      setError(actionErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <SectionTitle readOnly={!editable}>Horaires d&apos;ouverture</SectionTitle>
        <CardDescription>
          Plusieurs plages possibles par jour (ex. midi et soir). Une fermeture avant l&apos;ouverture signifie que la
          plage se termine le lendemain (ex. 18:00 → 02:00).
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {total === 0 && (
          <p className="flex gap-2 rounded-md border bg-muted/50 p-3 text-sm" role="status">
            <Info className="mt-0.5 size-4 shrink-0" />
            Aucune plage horaire : votre établissement est considéré comme toujours ouvert.
          </p>
        )}
        <ul className="grid gap-2">
          {week.map((slots, d) => (
            <li key={DAYS[d]} className="grid gap-2 rounded-md border p-3 md:grid-cols-[8rem_1fr]">
              <div className="flex items-center justify-between gap-2 md:flex-col md:items-start md:justify-start">
                <h3 className="font-medium">{DAYS[d]}</h3>
                {editable && slots.length === 0 && <Badge variant="secondary">Fermé</Badge>}
              </div>
              {!editable ? (
                <p className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  {slots.length === 0 ? (
                    <span className="text-muted-foreground">Fermé</span>
                  ) : (
                    slots.map((s) => (
                      <span key={s.key} className="tabular-nums">
                        {s.opens} – {s.closes}
                        {HHMM.test(s.opens) && HHMM.test(s.closes) && s.closes < s.opens && (
                          <span className="text-xs text-muted-foreground"> (lendemain)</span>
                        )}
                      </span>
                    ))
                  )}
                </p>
              ) : (
                <div className="grid gap-2">
                  {slots.map((s, i) => {
                    const err = errors[`${d}-${i}`];
                    const base = `h-${d}-${i}`;
                    const overnight = HHMM.test(s.opens) && HHMM.test(s.closes) && s.closes < s.opens;
                    return (
                      <div key={s.key} className="grid gap-1">
                        <div className="flex flex-wrap items-end gap-2">
                          <div className="grid min-w-0 flex-1 gap-1 sm:flex-none">
                            <Label htmlFor={`${base}-o`} className="text-xs">
                              Ouverture
                            </Label>
                            <Input
                              id={`${base}-o`}
                              type="time"
                              className="w-full min-w-0 px-2 sm:w-36"
                              value={s.opens}
                              aria-invalid={!!err}
                              onChange={(e) =>
                                setDay(d, (sl) =>
                                  sl.map((x) => (x.key === s.key ? { ...x, opens: e.target.value } : x)),
                                )
                              }
                            />
                          </div>
                          <div className="grid min-w-0 flex-1 gap-1 sm:flex-none">
                            <Label htmlFor={`${base}-c`} className="text-xs">
                              Fermeture
                            </Label>
                            <Input
                              id={`${base}-c`}
                              type="time"
                              className="w-full min-w-0 px-2 sm:w-36"
                              value={s.closes}
                              aria-invalid={!!err}
                              onChange={(e) =>
                                setDay(d, (sl) =>
                                  sl.map((x) => (x.key === s.key ? { ...x, closes: e.target.value } : x)),
                                )
                              }
                            />
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Supprimer la plage ${i + 1} du ${DAYS[d].toLowerCase()}`}
                            onClick={() => setDay(d, (sl) => sl.filter((x) => x.key !== s.key))}
                          >
                            <Trash2 />
                          </Button>
                          {overnight && (
                            <span className="flex h-9 items-center gap-1 text-xs text-muted-foreground">
                              <Moon className="size-3.5" />
                              jusqu&apos;au lendemain
                            </span>
                          )}
                        </div>
                        {err && (
                          <p className="text-xs text-destructive" role="alert">
                            {err}
                          </p>
                        )}
                      </div>
                    );
                  })}
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => addSlot(d)} disabled={total >= MAX_SLOTS}>
                      <Plus />
                      Ajouter une plage
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => copyToAll(d)}>
                      <Copy />
                      Copier sur tous les jours
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
        <FormError message={error} />
      </CardContent>
      {editable && (
        <CardFooter className="justify-end gap-2">
          <Button
            variant="outline"
            disabled={!dirty || saving}
            onClick={() => {
              setWeek(
                JSON.parse(saved).map((d: [string, string][]) =>
                  d.map(([opens, closes]) => ({ key: newKey(), opens, closes })),
                ),
              );
              setErrors({});
              setError(null);
            }}
          >
            Annuler
          </Button>
          <Button onClick={save} disabled={!dirty || saving}>
            {saving && <Loader2 className="animate-spin" />}
            Enregistrer les horaires
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
