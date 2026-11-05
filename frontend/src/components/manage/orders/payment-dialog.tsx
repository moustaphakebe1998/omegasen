"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type Schemas } from "@/lib/api/client";
import { formatMoney, moneyInput, parseMoney } from "@/lib/format";
import { PAYMENT_METHOD, type PaymentMethod } from "@/lib/labels";

const METHODS: PaymentMethod[] = ["CASH", "CARD", "MOBILE_MONEY", "OTHER"];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  remaining: number;
  currency: string;
  onConfirm: (body: Schemas["PaymentIn"]) => Promise<void>;
};

export function PaymentDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Monté à chaque ouverture : l'état repart du reste à payer courant. */}
        {props.open && <PaymentForm {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function PaymentForm({ onOpenChange, remaining, currency, onConfirm }: Props) {
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [amountText, setAmountText] = useState(moneyInput(remaining, currency));
  const [tenderedText, setTenderedText] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const amount = parseMoney(amountText, currency);
  const amountError =
    amount == null || amount <= 0
      ? "Montant invalide"
      : amount > remaining
        ? `Le montant dépasse le reste à payer (${formatMoney(remaining, currency)})`
        : null;
  const tendered = tenderedText.trim() ? parseMoney(tenderedText, currency) : null;
  const tenderedError =
    method === "CASH" && tenderedText.trim()
      ? tendered == null
        ? "Montant invalide"
        : amount != null && tendered < amount
          ? "Montant remis insuffisant"
          : null
      : null;
  const change = method === "CASH" && tendered != null && amount != null && tendered >= amount ? tendered - amount : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (amountError || tenderedError || amount == null) return;
    setBusy(true);
    try {
      await onConfirm({
        method,
        amount,
        amount_tendered: method === "CASH" ? (tendered ?? amount) : null,
      });
      onOpenChange(false);
    } catch {
      /* erreur déjà signalée par l'appelant : la boîte reste ouverte */
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Encaisser</DialogTitle>
        <DialogDescription>Reste à payer : {formatMoney(remaining, currency)}</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="pay-method">Moyen de paiement</Label>
          <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
            <SelectTrigger id="pay-method" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {METHODS.map((m) => (
                <SelectItem key={m} value={m}>
                  {PAYMENT_METHOD[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="pay-amount">Montant encaissé ({currency})</Label>
          <Input
            id="pay-amount"
            inputMode="decimal"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            aria-invalid={submitted && !!amountError}
          />
          {submitted && amountError && <p className="text-sm text-destructive">{amountError}</p>}
        </div>
        {method === "CASH" && (
          <div className="space-y-2">
            <Label htmlFor="pay-tendered">Montant remis par le client</Label>
            <Input
              id="pay-tendered"
              inputMode="decimal"
              placeholder={amountText}
              value={tenderedText}
              onChange={(e) => setTenderedText(e.target.value)}
              aria-invalid={!!tenderedError}
              aria-describedby="pay-change"
            />
            {tenderedError && <p className="text-sm text-destructive">{tenderedError}</p>}
            <p id="pay-change" className="rounded-md bg-muted px-3 py-2 text-sm" aria-live="polite">
              Monnaie à rendre :{" "}
              <strong className="tabular-nums">{formatMoney(change ?? 0, currency)}</strong>
            </p>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="submit" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            Valider l&apos;encaissement
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
