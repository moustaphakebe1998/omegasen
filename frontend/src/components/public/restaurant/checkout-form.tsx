"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CreditCard, Info, Loader2, ShoppingBag, Store, UtensilsCrossed } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Schemas } from "@/lib/api/client";
import { formatMoney } from "@/lib/format";
import { SERVICE_MODE } from "@/lib/labels";
import { cn } from "@/lib/utils";

type Restaurant = Schemas["PublicRestaurant"];
type Mode = "DINE_IN" | "TAKEAWAY";

const schema = z.object({
  service_mode: z.enum(["DINE_IN", "TAKEAWAY"], {
    message: "Choisissez un mode de service",
  }),
  customer_name: z.string().trim().min(1, "Indiquez votre prénom").max(80, "80 caractères maximum"),
  customer_phone: z
    .string()
    .trim()
    .refine((v) => v === "" || /^[0-9+ ().-]{6,32}$/.test(v), "Numéro de téléphone invalide"),
  table_label: z.string().trim().max(20, "20 caractères maximum"),
  note: z.string().trim().max(500, "500 caractères maximum"),
});

export type CheckoutValues = z.infer<typeof schema>;

export function CheckoutForm({
  restaurant: r,
  total,
  kiosk,
  pending,
  disabled,
  onSubmit,
}: {
  restaurant: Restaurant;
  total: number;
  kiosk: boolean;
  pending: boolean;
  disabled: boolean;
  onSubmit: (values: CheckoutValues) => void;
}) {
  const modes: Mode[] = [
    ...(r.dine_in_enabled ? (["DINE_IN"] as const) : []),
    ...(r.takeaway_enabled ? (["TAKEAWAY"] as const) : []),
  ];
  const form = useForm<CheckoutValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      service_mode: modes[0],
      customer_name: "",
      customer_phone: "",
      table_label: "",
      note: "",
    },
  });
  const {
    register,
    watch,
    formState: { errors },
  } = form;
  const mode = watch("service_mode");
  const fieldSize = kiosk ? "h-14 text-lg" : "h-11";

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-semibold">Mode de service</legend>
        <div className="grid grid-cols-2 gap-2">
          {modes.map((m) => {
            const Icon = m === "DINE_IN" ? UtensilsCrossed : ShoppingBag;
            return (
              <label
                key={m}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 px-3 text-center font-medium transition-colors has-checked:border-primary has-checked:bg-primary/10 has-focus-visible:ring-2 has-focus-visible:ring-ring",
                  kiosk ? "min-h-24 text-lg" : "min-h-16",
                  modes.length === 1 && "col-span-2",
                )}
              >
                <input type="radio" value={m} className="sr-only" {...register("service_mode")} />
                <Icon className={kiosk ? "size-7" : "size-5"} aria-hidden />
                {SERVICE_MODE[m]}
              </label>
            );
          })}
        </div>
        {errors.service_mode && (
          <p role="alert" className="text-sm text-destructive">
            {errors.service_mode.message}
          </p>
        )}
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor="customer_name" className={cn(kiosk && "text-base")}>
          Prénom <span aria-hidden>*</span>
        </Label>
        <Input
          id="customer_name"
          autoComplete="given-name"
          aria-invalid={!!errors.customer_name}
          aria-describedby="customer_name_hint"
          aria-required
          className={fieldSize}
          {...register("customer_name")}
        />
        <p
          id="customer_name_hint"
          className={cn("text-xs", errors.customer_name ? "text-destructive" : "text-muted-foreground")}
        >
          {errors.customer_name?.message ?? "Pour vous appeler quand votre commande est prête."}
        </p>
      </div>

      {!kiosk && (
        <div className="space-y-1.5">
          <Label htmlFor="customer_phone">
            Téléphone <span className="font-normal text-muted-foreground">(facultatif)</span>
          </Label>
          <Input
            id="customer_phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            aria-invalid={!!errors.customer_phone}
            aria-describedby={errors.customer_phone ? "customer_phone_error" : undefined}
            className={fieldSize}
            {...register("customer_phone")}
          />
          {errors.customer_phone && (
            <p id="customer_phone_error" className="text-xs text-destructive">
              {errors.customer_phone.message}
            </p>
          )}
        </div>
      )}

      {mode === "DINE_IN" && (
        <div className="space-y-1.5">
          <Label htmlFor="table_label" className={cn(kiosk && "text-base")}>
            Numéro de table (facultatif)
          </Label>
          <Input
            id="table_label"
            inputMode="text"
            maxLength={20}
            aria-invalid={!!errors.table_label}
            className={fieldSize}
            {...register("table_label")}
          />
          {errors.table_label && <p className="text-xs text-destructive">{errors.table_label.message}</p>}
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="order_note" className={cn(kiosk && "text-base")}>
          Remarque pour le restaurant <span className="font-normal text-muted-foreground">(facultatif)</span>
        </Label>
        <Textarea
          id="order_note"
          rows={2}
          maxLength={500}
          placeholder="Allergies, précisions…"
          aria-invalid={!!errors.note}
          {...register("note")}
        />
        {errors.note && <p className="text-xs text-destructive">{errors.note.message}</p>}
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Paiement</legend>
        <div className="grid gap-2">
          <label className="flex min-h-14 items-center gap-3 rounded-lg border-2 border-primary bg-primary/10 px-3 has-focus-visible:ring-2 has-focus-visible:ring-ring">
            <input type="radio" name="payment" value="AT_COUNTER" checked readOnly className="size-4 accent-primary" />
            <Store className="size-5 shrink-0" aria-hidden />
            <span className="font-medium">Payer au comptoir</span>
          </label>
          <label className="flex min-h-14 cursor-not-allowed items-center gap-3 rounded-lg border px-3 text-muted-foreground">
            <input type="radio" name="payment" value="ONLINE" disabled className="size-4" />
            <CreditCard className="size-5 shrink-0" aria-hidden />
            <span className="flex-1 font-medium">Payer en ligne</span>
            <Badge variant="secondary">Bientôt disponible</Badge>
          </label>
        </div>
        <p className="mt-2 flex gap-2 rounded-md bg-muted p-3 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          {r.require_prepayment
            ? "Ce restaurant demande un paiement préalable : votre commande sera transmise en cuisine dès que vous l'aurez réglée au comptoir."
            : "Vous réglerez votre commande au comptoir."}
        </p>
      </fieldset>

      <div className="space-y-2">
        <Button
          type="submit"
          size="lg"
          className={cn("w-full", kiosk && "h-16 text-lg")}
          disabled={pending || disabled}
        >
          {pending ? (
            <>
              <Loader2 className="animate-spin" aria-hidden /> Envoi de la commande…
            </>
          ) : (
            <>Valider la commande · {formatMoney(total, r.currency)}</>
          )}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Total indicatif : le montant définitif est calculé par le restaurant.
        </p>
      </div>
    </form>
  );
}
