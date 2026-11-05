"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarDays, Clock, Loader2 } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, errorMessage, type Schemas } from "@/lib/api/client";
import { formatDayLabel, RESERVATION_ERRORS, shiftDay, timeSlots, todayIn } from "@/lib/reservations";
import { cn } from "@/lib/utils";

import { PartySizeStepper } from "./party-size-stepper";

const schema = z.object({
  day: z.string().min(1, "Choisissez une date"),
  time: z.string().min(1, "Choisissez un horaire"),
  party_size: z.number().int().min(1).max(50),
  customer_name: z.string().trim().min(2, "Indiquez un nom (2 caractères minimum)").max(120, "120 caractères maximum"),
  customer_phone: z
    .string()
    .trim()
    .refine((v) => /^[0-9+ ().-]{6,32}$/.test(v), "Numéro de téléphone invalide"),
  customer_email: z
    .string()
    .trim()
    .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Adresse email invalide"),
  note: z.string().trim().max(1000, "1000 caractères maximum"),
});

export type ReservationValues = z.infer<typeof schema>;

/** Corps de requête (sans `starts_at`, calculé par l'appelant selon le fuseau). */
export function reservationBody(v: ReservationValues) {
  return {
    party_size: v.party_size,
    customer_name: v.customer_name.trim(),
    customer_phone: v.customer_phone.trim(),
    customer_email: v.customer_email.trim() || null,
    note: v.note.trim() || null,
  };
}

/** Minutes écoulées depuis minuit dans le fuseau donné (celui du navigateur par défaut). */
function nowMinutes(timeZone?: string) {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .format(new Date())
    .split(":")
    .map(Number);
  return p[0] * 60 + p[1];
}

function dayOption(iso: string, today: string) {
  if (iso === today) return "Aujourd'hui";
  if (iso === shiftDay(today, 1)) return "Demain";
  return formatDayLabel(iso, { weekday: "short" }).replace(/^./, (c) => c.toUpperCase());
}

/**
 * Formulaire de réservation partagé (page publique et espace restaurant).
 * Les créneaux (30 min) suivent les horaires d'ouverture ; aujourd'hui, uniquement ≥ 30 min à l'avance.
 */
export function ReservationForm({
  hours,
  timeZone,
  daysAhead = 30,
  defaultDay,
  defaults,
  submitLabel,
  idPrefix = "rsv",
  onSubmit,
  onCancel,
}: {
  hours: Schemas["HoursSlot"][];
  timeZone?: string;
  daysAhead?: number;
  defaultDay?: string;
  defaults?: Partial<Pick<ReservationValues, "customer_name" | "customer_email" | "customer_phone">>;
  submitLabel: string;
  idPrefix?: string;
  onSubmit: (v: ReservationValues) => Promise<void>;
  onCancel?: () => void;
}) {
  const uid = useId();
  const id = (k: string) => `${idPrefix}-${k}-${uid}`;
  const [serverError, setServerError] = useState<string | null>(null);
  const [today] = useState(() => todayIn(timeZone));
  const [nowMin] = useState(() => nowMinutes(timeZone));
  const days = useMemo(() => Array.from({ length: daysAhead }, (_, i) => shiftDay(today, i)), [today, daysAhead]);

  const form = useForm<ReservationValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      day: defaultDay && days.includes(defaultDay) ? defaultDay : today,
      time: "",
      party_size: 2,
      customer_name: defaults?.customer_name ?? "",
      customer_phone: defaults?.customer_phone ?? "",
      customer_email: defaults?.customer_email ?? "",
      note: "",
    },
  });
  const {
    control,
    register,
    setValue,
    formState: { errors, isSubmitting },
  } = form;
  const day = useWatch({ control, name: "day" });
  const slots = useMemo(() => timeSlots(day, hours, day === today ? nowMin + 30 : -1), [day, hours, today, nowMin]);

  const submit = form.handleSubmit(async (v) => {
    setServerError(null);
    try {
      await onSubmit(v);
    } catch (e) {
      setServerError(
        e instanceof ApiError && RESERVATION_ERRORS[e.code] ? RESERVATION_ERRORS[e.code] : errorMessage(e),
      );
    }
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="space-y-1.5">
          <Label htmlFor={id("day")} className="flex items-center gap-1.5">
            <CalendarDays className="size-4 text-muted-foreground" aria-hidden /> Date
          </Label>
          <Controller
            control={control}
            name="day"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(v) => {
                  field.onChange(v);
                  setValue("time", "");
                }}
              >
                <SelectTrigger id={id("day")} className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {days.map((d) => (
                    <SelectItem key={d} value={d}>
                      {dayOption(d, today)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <div className="space-y-1.5">
          <Label id={`${id("party")}-label`}>Nombre de personnes</Label>
          <Controller
            control={control}
            name="party_size"
            render={({ field }) => <PartySizeStepper id={id("party")} value={field.value} onChange={field.onChange} />}
          />
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
          <Clock className="size-4 text-muted-foreground" aria-hidden /> Heure
        </legend>
        {slots.length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
            Aucun créneau disponible ce jour-là. Choisissez une autre date.
          </p>
        ) : (
          <Controller
            control={control}
            name="time"
            render={({ field }) => (
              <div className="grid max-h-52 grid-cols-4 gap-2 overflow-y-auto rounded-xl p-0.5 sm:grid-cols-6">
                {slots.map((t) => (
                  <label
                    key={t}
                    className={cn(
                      "tabular flex h-11 cursor-pointer items-center justify-center rounded-lg border text-sm font-medium transition-colors hover:bg-muted",
                      "has-checked:border-primary has-checked:bg-primary has-checked:text-primary-foreground has-focus-visible:ring-2 has-focus-visible:ring-ring",
                    )}
                  >
                    <input
                      type="radio"
                      name={field.name}
                      value={t}
                      checked={field.value === t}
                      onChange={() => field.onChange(t)}
                      className="sr-only"
                    />
                    {t}
                  </label>
                ))}
              </div>
            )}
          />
        )}
        {errors.time && (
          <p role="alert" className="text-sm text-destructive">
            {errors.time.message}
          </p>
        )}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={id("name")}>
            Nom <span aria-hidden>*</span>
          </Label>
          <Input
            id={id("name")}
            autoComplete="name"
            className="h-11"
            aria-invalid={!!errors.customer_name}
            aria-required
            {...register("customer_name")}
          />
          {errors.customer_name && <p className="text-xs text-destructive">{errors.customer_name.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={id("phone")}>
            Téléphone <span aria-hidden>*</span>
          </Label>
          <Input
            id={id("phone")}
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            className="h-11"
            aria-invalid={!!errors.customer_phone}
            aria-required
            {...register("customer_phone")}
          />
          {errors.customer_phone && <p className="text-xs text-destructive">{errors.customer_phone.message}</p>}
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={id("email")}>
            Email <span className="font-normal text-muted-foreground">(facultatif)</span>
          </Label>
          <Input
            id={id("email")}
            type="email"
            autoComplete="email"
            className="h-11"
            aria-invalid={!!errors.customer_email}
            aria-describedby={`${id("email")}-hint`}
            {...register("customer_email")}
          />
          <p
            id={`${id("email")}-hint`}
            className={cn("text-xs", errors.customer_email ? "text-destructive" : "text-muted-foreground")}
          >
            {errors.customer_email?.message ?? "Pour recevoir la confirmation par email."}
          </p>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={id("note")}>
            Remarque <span className="font-normal text-muted-foreground">(facultatif)</span>
          </Label>
          <Textarea
            id={id("note")}
            rows={2}
            placeholder="Anniversaire, chaise haute, allergie…"
            aria-invalid={!!errors.note}
            {...register("note")}
          />
          {errors.note && <p className="text-xs text-destructive">{errors.note.message}</p>}
        </div>
      </div>

      {serverError && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {serverError}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button type="button" variant="outline" className="h-11" onClick={onCancel}>
            Annuler
          </Button>
        )}
        <Button type="submit" className="h-11" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
