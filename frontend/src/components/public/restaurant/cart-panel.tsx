"use client";

import { ArrowLeft, Minus, Plus, ShoppingBasket, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Schemas } from "@/lib/api/client";
import { type Cart, lineUnitPrice } from "@/lib/cart";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

import { CheckoutForm, type CheckoutValues } from "./checkout-form";

export type CartStep = "cart" | "checkout";

/** Contenu du panier + étape de validation. Utilisé dans le tiroir (mobile) et le panneau latéral (borne). */
export function CartPanel({
  restaurant,
  cart,
  step,
  onStepChange,
  kiosk,
  canOrder,
  blockedReason,
  pending,
  onSubmit,
}: {
  restaurant: Schemas["PublicRestaurant"];
  cart: Cart;
  step: CartStep;
  onStepChange: (s: CartStep) => void;
  kiosk: boolean;
  canOrder: boolean;
  blockedReason: string | null;
  pending: boolean;
  onSubmit: (values: CheckoutValues) => void;
}) {
  const currency = restaurant.currency;
  const btnSize = kiosk ? "lg" : "icon";

  if (cart.lines.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-10 text-center text-muted-foreground">
        <ShoppingBasket className="size-10" aria-hidden />
        <p className={cn(kiosk && "text-lg")}>Votre panier est vide.</p>
        <p className="text-sm">Touchez un produit du menu pour l&apos;ajouter.</p>
      </div>
    );
  }

  if (step === "checkout") {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size={kiosk ? "lg" : "sm"} onClick={() => onStepChange("cart")} className="-ml-2">
          <ArrowLeft aria-hidden /> Retour au panier
        </Button>
        <CheckoutForm
          restaurant={restaurant}
          total={cart.total}
          kiosk={kiosk}
          pending={pending}
          disabled={!canOrder}
          onSubmit={onSubmit}
        />
        {blockedReason && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {blockedReason}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ul className="divide-y" aria-label="Articles du panier">
        {cart.lines.map((l) => (
          <li key={l.key} className="flex gap-3 py-3">
            {l.imageUrl && <img src={l.imageUrl} alt="" className="size-14 shrink-0 rounded-md object-cover" />}
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className={cn("font-medium break-words", kiosk && "text-lg")}>{l.name}</p>
                <p className="tabular shrink-0 font-semibold">{formatMoney(lineUnitPrice(l) * l.quantity, currency)}</p>
              </div>
              {l.optionLabels.length > 0 && (
                <p className="text-sm text-muted-foreground">{l.optionLabels.join(", ")}</p>
              )}
              {l.note && <p className="text-sm text-muted-foreground italic">« {l.note} »</p>}
              <div className="mt-2 flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size={btnSize}
                  aria-label={l.quantity === 1 ? `Retirer ${l.name}` : `Diminuer la quantité de ${l.name}`}
                  onClick={() => cart.setQuantity(l.key, l.quantity - 1)}
                >
                  <Minus aria-hidden />
                </Button>
                <span className="tabular w-8 text-center font-semibold" aria-label={`Quantité : ${l.quantity}`}>
                  {l.quantity}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size={btnSize}
                  aria-label={`Augmenter la quantité de ${l.name}`}
                  disabled={l.quantity >= 99}
                  onClick={() => cart.setQuantity(l.key, l.quantity + 1)}
                >
                  <Plus aria-hidden />
                </Button>
                <span className="tabular ml-1 text-xs text-muted-foreground">
                  {formatMoney(lineUnitPrice(l), currency)} / unité
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size={btnSize}
                  className="ml-auto text-muted-foreground hover:text-destructive"
                  aria-label={`Supprimer ${l.name} du panier`}
                  onClick={() => cart.remove(l.key)}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex items-baseline justify-between border-t pt-3">
        <span className="font-semibold">Total</span>
        <span className={cn("tabular font-bold", kiosk ? "text-2xl" : "text-lg")}>
          {formatMoney(cart.total, currency)}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Total indicatif : le montant définitif est calculé par le restaurant.
      </p>

      {blockedReason && (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm font-medium text-destructive">
          {blockedReason}
        </p>
      )}
      <Button
        size="lg"
        className={cn("w-full", kiosk && "h-16 text-lg")}
        disabled={!canOrder}
        onClick={() => onStepChange("checkout")}
      >
        Commander
      </Button>
    </div>
  );
}
