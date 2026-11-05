"use client";

import { Minus, Plus, ReceiptText, ShoppingBag, Trash2, Utensils } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Schemas } from "@/lib/api/client";
import { type Cart, lineUnitPrice } from "@/lib/cart";
import { formatMoney } from "@/lib/format";
import type { ServiceMode } from "@/lib/labels";
import { cn } from "@/lib/utils";

export type TicketDetails = {
  serviceMode: ServiceMode;
  customerName: string;
  tableLabel: string;
  note: string;
};

export function serviceModesFor(r: Schemas["RestaurantOut"] | undefined): ServiceMode[] {
  const modes: ServiceMode[] = [];
  if (!r || r.dine_in_enabled) modes.push("DINE_IN");
  if (!r || r.takeaway_enabled) modes.push("TAKEAWAY");
  return modes.length ? modes : ["DINE_IN", "TAKEAWAY"];
}

const MODE_UI: Partial<Record<ServiceMode, { label: string; icon: typeof Utensils }>> = {
  DINE_IN: { label: "Sur place", icon: Utensils },
  TAKEAWAY: { label: "À emporter", icon: ShoppingBag },
};

export function Ticket({
  cart,
  currency,
  modes,
  details,
  onDetails,
  onCheckout,
  idPrefix,
}: {
  cart: Cart;
  currency: string;
  modes: ServiceMode[];
  details: TicketDetails;
  onDetails: (d: TicketDetails) => void;
  onCheckout: () => void;
  /** Préfixe d'identifiants (le ticket peut être rendu deux fois : panneau + tiroir mobile). */
  idPrefix: string;
}) {
  const set = <K extends keyof TicketDetails>(k: K, v: TicketDetails[K]) => onDetails({ ...details, [k]: v });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-lg font-bold">Ticket en cours</h2>
        {cart.lines.length > 0 && (
          <Button variant="ghost" className="h-11 text-destructive" onClick={cart.clear}>
            <Trash2 className="size-4" />
            Vider
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {cart.lines.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center text-muted-foreground">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary" aria-hidden>
              <ReceiptText className="size-7" />
            </span>
            <p>Touchez un produit pour l&apos;ajouter.</p>
          </div>
        ) : (
          <ul className="divide-y">
            {cart.lines.map((l) => (
              <li key={l.key} className="flex gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{l.name}</p>
                  {l.optionLabels.length > 0 && (
                    <p className="text-sm text-muted-foreground">{l.optionLabels.join(", ")}</p>
                  )}
                  {l.note && (
                    <p className="mt-1 inline-block rounded bg-yellow-100 px-1.5 text-sm text-yellow-900 dark:bg-yellow-900/40 dark:text-yellow-100">
                      {l.note}
                    </p>
                  )}
                  <p className="tabular mt-1 text-sm text-muted-foreground">
                    {formatMoney(lineUnitPrice(l), currency)} l&apos;unité
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <p className="tabular font-bold">{formatMoney(lineUnitPrice(l) * l.quantity, currency)}</p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      className="size-12"
                      aria-label={l.quantity === 1 ? `Retirer ${l.name}` : `Diminuer la quantité de ${l.name}`}
                      onClick={() => cart.setQuantity(l.key, l.quantity - 1)}
                    >
                      {l.quantity === 1 ? <Trash2 className="size-5" /> : <Minus className="size-5" />}
                    </Button>
                    <span className="tabular w-8 text-center text-lg font-bold" aria-live="polite">
                      {l.quantity}
                    </span>
                    <Button
                      variant="outline"
                      className="size-12"
                      aria-label={`Augmenter la quantité de ${l.name}`}
                      onClick={() => cart.setQuantity(l.key, l.quantity + 1)}
                    >
                      <Plus className="size-5" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3 border-t p-4">
        {modes.length > 1 && (
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Mode de service">
            {modes.map((m) => {
              const ui = MODE_UI[m];
              if (!ui) return null;
              const active = details.serviceMode === m;
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => set("serviceMode", m)}
                  className={cn(
                    "flex min-h-12 items-center justify-center gap-2 rounded-lg border-2 font-semibold",
                    active ? "border-primary bg-primary/10 text-primary" : "border-border",
                  )}
                >
                  <ui.icon className="size-5" aria-hidden />
                  {ui.label}
                </button>
              );
            })}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-customer`} className="text-xs">
              Nom du client
            </Label>
            <Input
              id={`${idPrefix}-customer`}
              value={details.customerName}
              maxLength={80}
              onChange={(e) => set("customerName", e.target.value)}
              className="h-11"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-table`} className="text-xs">
              Table
            </Label>
            <Input
              id={`${idPrefix}-table`}
              value={details.tableLabel}
              maxLength={20}
              onChange={(e) => set("tableLabel", e.target.value)}
              className="h-11"
              disabled={details.serviceMode !== "DINE_IN"}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-note`} className="text-xs">
            Note pour la cuisine
          </Label>
          <Textarea
            id={`${idPrefix}-note`}
            rows={1}
            value={details.note}
            maxLength={500}
            onChange={(e) => set("note", e.target.value)}
            className="min-h-11"
          />
        </div>
        <div className="flex items-baseline justify-between pt-1">
          <span className="text-lg font-semibold">Total TTC</span>
          <span className="tabular text-3xl font-black">{formatMoney(cart.total, currency)}</span>
        </div>
        <Button className="h-16 w-full text-xl font-bold" disabled={cart.lines.length === 0} onClick={onCheckout}>
          Encaisser {cart.count > 0 && `(${cart.count})`}
        </Button>
      </div>
    </div>
  );
}
