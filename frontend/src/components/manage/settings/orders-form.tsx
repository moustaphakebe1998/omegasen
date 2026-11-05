"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { parseVatPercent, vatInput } from "@/components/manage/menu/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api/client";

import { aria, Field, FormError, SwitchRow } from "./fields";
import { type Restaurant, useUpdateRestaurant } from "./use-restaurant";

const schema = z.object({
  accepting_orders: z.boolean(),
  dine_in_enabled: z.boolean(),
  takeaway_enabled: z.boolean(),
  require_prepayment: z.boolean(),
  late_after_minutes: z
    .string()
    .trim()
    .refine((v) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 240, "Entre 1 et 240 minutes"),
  vat: z.string().refine((v) => v.trim() !== "" && parseVatPercent(v) != null, "Taux invalide (0 à 50 %)"),
  timezone: z.string().trim().min(1, "Fuseau horaire requis"),
});
type Values = z.infer<typeof schema>;

const COMMON_TZ = [
  "Africa/Dakar",
  "Africa/Abidjan",
  "Africa/Bamako",
  "Africa/Conakry",
  "Africa/Lome",
  "Africa/Ouagadougou",
  "Africa/Niamey",
  "Africa/Porto-Novo",
  "Africa/Casablanca",
  "Africa/Tunis",
  "Africa/Algiers",
  "Europe/Paris",
  "Europe/Brussels",
  "Europe/Zurich",
  "Europe/Luxembourg",
  "America/Montreal",
  "Indian/Reunion",
  "America/Martinique",
  "America/Guadeloupe",
];

function timezones(): string[] {
  try {
    const all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone");
    if (all?.length) return all;
  } catch {
    /* navigateur ancien */
  }
  return COMMON_TZ;
}

function defaults(r: Restaurant): Values {
  return {
    accepting_orders: r.accepting_orders,
    dine_in_enabled: r.dine_in_enabled,
    takeaway_enabled: r.takeaway_enabled,
    require_prepayment: r.require_prepayment,
    late_after_minutes: String(r.late_after_minutes),
    vat: vatInput(r.vat_rate_bp),
    timezone: r.timezone,
  };
}

export function OrdersForm({ restaurant }: { restaurant: Restaurant }) {
  const update = useUpdateRestaurant(restaurant.id);
  const [error, setError] = useState<string | null>(null);
  const [tzList] = useState(timezones);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults(restaurant) });
  const {
    control,
    register,
    formState: { errors, isDirty, isSubmitting },
  } = form;
  const [dineIn, takeaway] = useWatch({ control, name: ["dine_in_enabled", "takeaway_enabled"] });

  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      const data = await update({
        accepting_orders: v.accepting_orders,
        dine_in_enabled: v.dine_in_enabled,
        takeaway_enabled: v.takeaway_enabled,
        require_prepayment: v.require_prepayment,
        late_after_minutes: Number(v.late_after_minutes),
        vat_rate_bp: parseVatPercent(v.vat) ?? undefined,
        timezone: v.timezone.trim(),
      });
      form.reset(defaults(data));
      toast.success("Réglages de commande enregistrés");
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  const sw = (name: "accepting_orders" | "dine_in_enabled" | "takeaway_enabled" | "require_prepayment", label: string, hint: string) => (
    <Controller
      control={control}
      name={name}
      render={({ field }) => <SwitchRow id={`ord-${name}`} label={label} hint={hint} checked={field.value} onChange={field.onChange} />}
    />
  );

  return (
    <Card>
      <form onSubmit={onSubmit} noValidate>
        <CardHeader>
          <CardTitle>Commande</CardTitle>
          <CardDescription>Modes de service, paiement et suivi en cuisine.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 pt-6">
          <div className="grid gap-3 sm:grid-cols-2">
            {sw("accepting_orders", "Commandes ouvertes", "Désactivez pour suspendre temporairement toutes les commandes clients.")}
            {sw(
              "require_prepayment",
              "Paiement au comptoir avant préparation",
              "Les commandes QR Code / en ligne ne partent en cuisine qu'une fois payées au comptoir.",
            )}
            {sw("dine_in_enabled", "Sur place", "Le client peut commander pour manger sur place.")}
            {sw("takeaway_enabled", "À emporter", "Le client peut commander à emporter.")}
          </div>
          {!dineIn && !takeaway && (
            <p className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100" role="status">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              Aucun mode de service actif : vos clients ne pourront pas commander.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="ord-late"
              label="Commande en retard après (minutes)"
              hint="Au-delà, la commande est signalée en cuisine."
              error={errors.late_after_minutes?.message}
            >
              <Input inputMode="numeric" {...aria("ord-late", errors.late_after_minutes?.message, true)} {...register("late_after_minutes")} />
            </Field>
            <Field id="ord-vat" label="TVA par défaut (%)" hint="Appliquée aux produits sans taux spécifique. Prix TTC." error={errors.vat?.message}>
              <Input inputMode="decimal" {...aria("ord-vat", errors.vat?.message, true)} {...register("vat")} />
            </Field>
            <Field id="ord-tz" label="Fuseau horaire" hint="Utilisé pour les horaires d'ouverture et les rapports." error={errors.timezone?.message}>
              <Input list="ord-tz-list" autoComplete="off" {...aria("ord-tz", errors.timezone?.message, true)} {...register("timezone")} />
              <datalist id="ord-tz-list">
                {tzList.map((tz) => (
                  <option key={tz} value={tz} />
                ))}
              </datalist>
            </Field>
            <Field id="ord-currency" label="Devise" hint="Définie à la création du restaurant ; elle ne peut pas être modifiée.">
              <Input id="ord-currency" value={restaurant.currency} readOnly disabled aria-describedby="ord-currency-hint" />
            </Field>
          </div>
          <FormError message={error} />
        </CardContent>
        <CardFooter className="justify-end gap-2 pt-6">
          <Button type="button" variant="outline" disabled={!isDirty || isSubmitting} onClick={() => form.reset()}>
            Annuler
          </Button>
          <Button type="submit" disabled={!isDirty || isSubmitting}>
            {isSubmitting && <Loader2 className="animate-spin" />}
            Enregistrer
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
