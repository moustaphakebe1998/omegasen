"use client";

import { Banknote, Clock, CreditCard, Loader2, MoreHorizontal, Smartphone } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney, moneyInput, parseMoney } from "@/lib/format";
import { PAYMENT_METHOD, type PaymentMethod } from "@/lib/labels";
import { cn } from "@/lib/utils";

export type PosPayment = { method: PaymentMethod; amount_tendered?: number | null };

const METHODS: { method: PaymentMethod; icon: typeof Banknote }[] = [
  { method: "CASH", icon: Banknote },
  { method: "CARD", icon: CreditCard },
  { method: "MOBILE_MONEY", icon: Smartphone },
  { method: "OTHER", icon: MoreHorizontal },
];

/** Coupures courantes (unités mineures) pour les montants rapides. */
const DENOMINATIONS: Record<string, number[]> = {
  XOF: [500, 1000, 2000, 5000, 10000],
  EUR: [100, 500, 1000, 2000, 5000],
};

export function quickAmounts(total: number, currency: string): number[] {
  const denoms = DENOMINATIONS[currency] ?? DENOMINATIONS.EUR;
  const out = new Set<number>();
  for (const d of denoms) {
    const v = Math.ceil(total / d) * d;
    if (v > total) out.add(v);
  }
  return [...out].sort((a, b) => a - b).slice(0, 4);
}

export function PaymentDialog({
  open,
  onOpenChange,
  title,
  description,
  amountDue,
  currency,
  allowLater,
  submitting,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Montant à encaisser (unités mineures). */
  amountDue: number;
  currency: string;
  /** Propose « Encaisser plus tard » (commande envoyée sans paiement). */
  allowLater?: boolean;
  submitting: boolean;
  onSubmit: (payment: PosPayment | null) => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [tendered, setTendered] = useState("");

  useEffect(() => {
    if (open) {
      setMethod("CASH");
      setTendered("");
    }
  }, [open]);

  const tenderedAmount = tendered.trim() ? parseMoney(tendered, currency) : amountDue;
  const invalid = method === "CASH" && (tenderedAmount === null || tenderedAmount < amountDue);
  const change = method === "CASH" && tenderedAmount !== null ? tenderedAmount - amountDue : 0;
  const quick = useMemo(() => quickAmounts(amountDue, currency), [amountDue, currency]);

  const confirm = () => {
    if (invalid) return;
    onSubmit(method === "CASH" ? { method, amount_tendered: tenderedAmount } : { method });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-2xl">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="rounded-xl bg-muted p-4 text-center">
          <p className="text-sm text-muted-foreground">À encaisser</p>
          <p className="tabular text-4xl font-black">{formatMoney(amountDue, currency)}</p>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Mode de paiement</legend>
          <div className="grid grid-cols-2 gap-2">
            {METHODS.map(({ method: m, icon: Icon }) => (
              <button
                key={m}
                type="button"
                aria-pressed={method === m}
                onClick={() => setMethod(m)}
                className={cn(
                  "flex min-h-16 items-center justify-center gap-2 rounded-xl border-2 text-lg font-semibold transition-colors",
                  method === m ? "border-primary bg-primary/10 text-primary" : "border-border active:bg-muted",
                )}
              >
                <Icon className="size-6" aria-hidden />
                {PAYMENT_METHOD[m]}
              </button>
            ))}
          </div>
        </fieldset>

        {method === "CASH" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="tendered" className="text-base">
                Montant remis
              </Label>
              <Input
                id="tendered"
                inputMode="decimal"
                autoComplete="off"
                value={tendered}
                onChange={(e) => setTendered(e.target.value)}
                placeholder={moneyInput(amountDue, currency)}
                className="tabular h-14 text-2xl"
                aria-invalid={invalid}
                aria-describedby="change-due"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="h-12 text-base" onClick={() => setTendered("")}>
                Montant exact
              </Button>
              {quick.map((v) => (
                <Button
                  key={v}
                  type="button"
                  variant="outline"
                  className="tabular h-12 text-base"
                  onClick={() => setTendered(moneyInput(v, currency))}
                >
                  {formatMoney(v, currency)}
                </Button>
              ))}
            </div>
            <p
              id="change-due"
              aria-live="polite"
              className={cn(
                "rounded-xl p-3 text-center text-xl font-bold",
                invalid ? "bg-destructive/10 text-destructive" : "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-100",
              )}
            >
              {tenderedAmount === null
                ? "Montant invalide"
                : invalid
                  ? `Il manque ${formatMoney(amountDue - tenderedAmount, currency)}`
                  : `Monnaie à rendre : ${formatMoney(change, currency)}`}
            </p>
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          {allowLater ? (
            <Button
              type="button"
              variant="outline"
              className="h-14 text-base"
              disabled={submitting}
              onClick={() => onSubmit(null)}
            >
              <Clock className="size-5" />
              Encaisser plus tard
            </Button>
          ) : (
            <span />
          )}
          <Button type="button" className="h-14 text-lg sm:min-w-56" disabled={submitting || invalid} onClick={confirm}>
            {submitting && <Loader2 className="size-5 animate-spin" />}
            Valider le paiement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
