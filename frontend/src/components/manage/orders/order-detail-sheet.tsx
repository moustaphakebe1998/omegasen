"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, Loader2, Printer, Undo2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { OrderStatusBadge, PaymentStatusBadge } from "@/components/shared/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { api, errorMessage, unwrap, type Schemas } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { formatDateTime, formatMoney, formatTime } from "@/lib/format";
import { CHANNEL, ORDER_STATUS, PAYMENT_METHOD, SERVICE_MODE, type OrderStatus, type PaymentMethod } from "@/lib/labels";

import { type Order } from "../layout/hooks";
import { PaymentDialog } from "./payment-dialog";
import { ReasonDialog } from "./reason-dialog";

const TRANSITION_LABEL: Record<OrderStatus, string> = {
  NEW: "Revenir à « Nouvelle »",
  PREPARING: "Mettre en préparation",
  READY: "Marquer prête",
  COMPLETED: "Terminer (remise au client)",
  CANCELLED: "Annuler la commande",
};

const TX_STATUS: Record<string, string> = {
  PENDING: "En attente",
  SUCCEEDED: "Encaissé",
  FAILED: "Échoué",
  REFUNDED: "Remboursé",
  CANCELLED: "Annulé",
};

export function OrderDetailSheet({
  rid,
  order: initial,
  currency,
  onOpenChange,
}: {
  rid: string;
  /** Commande sélectionnée (null = fermé). */
  order: Order | null;
  currency: string;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={!!initial} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-lg">
        {initial && <OrderDetail key={initial.id} rid={rid} initial={initial} currency={currency} />}
      </SheetContent>
    </Sheet>
  );
}

function OrderDetail({ rid, initial, currency }: { rid: string; initial: Order; currency: string }) {
  const queryClient = useQueryClient();
  const { roleIn, user } = useAuth();
  const role = roleIn(rid);
  const canRefund = !!user?.is_superadmin || role === "OWNER" || role === "MANAGER";

  const { data: order = initial, isFetching } = useQuery({
    queryKey: ["orders", rid, "detail", initial.id],
    queryFn: () =>
      unwrap(
        api.GET("/api/restaurants/{restaurant_id}/orders/{order_id}", {
          params: { path: { restaurant_id: rid, order_id: initial.id } },
        }),
      ),
    placeholderData: initial,
  });

  const [busyStatus, setBusyStatus] = useState<OrderStatus | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [refundId, setRefundId] = useState<string | null>(null);

  const applyUpdate = (updated: Order) => {
    queryClient.setQueryData(["orders", rid, "detail", updated.id], updated);
    queryClient.invalidateQueries({ queryKey: ["orders", rid] });
  };

  const setStatus = async (status: OrderStatus, reason?: string) => {
    setBusyStatus(status);
    try {
      const updated = await unwrap(
        api.POST("/api/restaurants/{restaurant_id}/orders/{order_id}/status", {
          params: { path: { restaurant_id: rid, order_id: order.id } },
          body: { status, reason: reason ?? null },
        }),
      );
      applyUpdate(updated);
      toast.success(`Commande n° ${updated.display_number} : ${ORDER_STATUS[updated.status].label}`);
    } catch (e) {
      toast.error(errorMessage(e));
      throw e;
    } finally {
      setBusyStatus(null);
    }
  };

  const pay = async (body: Schemas["PaymentIn"]) => {
    try {
      const updated = await unwrap(
        api.POST("/api/restaurants/{restaurant_id}/orders/{order_id}/payments", {
          params: { path: { restaurant_id: rid, order_id: order.id } },
          body,
        }),
      );
      applyUpdate(updated);
      toast.success("Paiement enregistré");
    } catch (e) {
      toast.error(errorMessage(e));
      throw e;
    }
  };

  const refund = async (paymentId: string, reason: string) => {
    try {
      const updated = await unwrap(
        api.POST("/api/restaurants/{restaurant_id}/orders/{order_id}/payments/{payment_id}/refund", {
          params: { path: { restaurant_id: rid, order_id: order.id, payment_id: paymentId } },
          body: { reason },
        }),
      );
      applyUpdate(updated);
      toast.success("Paiement remboursé");
    } catch (e) {
      toast.error(errorMessage(e));
      throw e;
    }
  };

  const remaining = Math.max(0, order.total - order.amount_paid);
  const canPay = order.status !== "CANCELLED" && remaining > 0;
  const forward = order.allowed_transitions.filter((s) => s !== "CANCELLED");

  return (
    <>
      <SheetHeader className="border-b pr-12">
        <SheetTitle className="flex items-center gap-2">
          Commande n° {order.display_number}
          {isFetching && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Actualisation" />}
        </SheetTitle>
        <SheetDescription>
          {formatDateTime(order.created_at)} · Réf. {order.reference}
        </SheetDescription>
        <div className="flex flex-wrap gap-2 pt-1">
          <OrderStatusBadge status={order.status} />
          <PaymentStatusBadge status={order.payment_status} />
          <Badge variant="outline">{CHANNEL[order.channel]}</Badge>
          <Badge variant="outline">{SERVICE_MODE[order.service_mode]}</Badge>
          {order.is_late && <Badge variant="destructive">En retard</Badge>}
        </div>
      </SheetHeader>

      <div className="space-y-5 p-4">
        {(order.customer_name || order.customer_phone || order.table_label) && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {order.customer_name && (
              <>
                <dt className="text-muted-foreground">Client</dt>
                <dd>{order.customer_name}</dd>
              </>
            )}
            {order.customer_phone && (
              <>
                <dt className="text-muted-foreground">Téléphone</dt>
                <dd>
                  <a className="underline-offset-2 hover:underline" href={`tel:${order.customer_phone}`}>
                    {order.customer_phone}
                  </a>
                </dd>
              </>
            )}
            {order.table_label && (
              <>
                <dt className="text-muted-foreground">Table</dt>
                <dd>{order.table_label}</dd>
              </>
            )}
          </dl>
        )}
        {order.note && (
          <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
            <span className="font-medium">Note : </span>
            {order.note}
          </p>
        )}
        {order.status === "CANCELLED" && order.cancel_reason && (
          <p className="rounded-md bg-destructive/10 p-3 text-sm">
            <span className="font-medium">Motif d&apos;annulation : </span>
            {order.cancel_reason}
          </p>
        )}

        <section aria-labelledby="od-items">
          <h3 id="od-items" className="mb-2 text-sm font-semibold">
            Articles
          </h3>
          <ul className="divide-y rounded-md border">
            {order.items.map((it) => (
              <li key={it.id} className="flex gap-3 p-3 text-sm">
                <span className="font-semibold tabular-nums">{it.quantity}×</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{it.product_name}</p>
                  {it.options.length > 0 && (
                    <ul className="text-muted-foreground">
                      {it.options.map((op, i) => (
                        <li key={i}>
                          {op.group_name} : {op.option_name}
                          {op.price_delta !== 0 && ` (${op.price_delta > 0 ? "+" : ""}${formatMoney(op.price_delta, currency)})`}
                        </li>
                      ))}
                    </ul>
                  )}
                  {it.note && <p className="italic text-amber-700 dark:text-amber-300">« {it.note} »</p>}
                </div>
                <span className="tabular-nums">{formatMoney(it.line_total, currency)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Sous-total</dt>
              <dd className="tabular-nums">{formatMoney(order.subtotal, currency)}</dd>
            </div>
            {order.discount > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Remise</dt>
                <dd className="tabular-nums">−{formatMoney(order.discount, currency)}</dd>
              </div>
            )}
            <div className="flex justify-between text-base font-semibold">
              <dt>Total TTC</dt>
              <dd className="tabular-nums">{formatMoney(order.total, currency)}</dd>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <dt>dont TVA</dt>
              <dd className="tabular-nums">{formatMoney(order.tax_total, currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Déjà payé</dt>
              <dd className="tabular-nums">{formatMoney(order.amount_paid, currency)}</dd>
            </div>
            {order.status !== "CANCELLED" && remaining > 0 && (
              <div className="flex justify-between font-medium">
                <dt>Reste à payer</dt>
                <dd className="tabular-nums">{formatMoney(remaining, currency)}</dd>
              </div>
            )}
          </dl>
        </section>

        <Separator />

        <section aria-labelledby="od-payments">
          <h3 id="od-payments" className="mb-2 text-sm font-semibold">
            Paiements
          </h3>
          {order.payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun paiement enregistré.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {order.payments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {PAYMENT_METHOD[p.method as PaymentMethod] ?? p.method} ·{" "}
                      <span className="tabular-nums">{formatMoney(p.amount, currency)}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {TX_STATUS[p.status] ?? p.status}
                      {p.paid_at && ` · ${formatTime(p.paid_at)}`}
                      {p.amount_tendered != null &&
                        p.amount_tendered > p.amount &&
                        ` · remis ${formatMoney(p.amount_tendered, currency)}, rendu ${formatMoney(p.amount_tendered - p.amount, currency)}`}
                    </p>
                  </div>
                  {canRefund && p.status === "SUCCEEDED" && (
                    <Button size="sm" variant="ghost" onClick={() => setRefundId(p.id)}>
                      <Undo2 />
                      Rembourser
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <Separator />

        <section aria-labelledby="od-actions" className="space-y-2">
          <h3 id="od-actions" className="text-sm font-semibold">
            Actions
          </h3>
          <div className="flex flex-wrap gap-2">
            {forward.map((s) => (
              <Button
                key={s}
                variant={s === "NEW" ? "outline" : "default"}
                disabled={busyStatus !== null}
                onClick={() => setStatus(s).catch(() => undefined)}
              >
                {busyStatus === s && <Loader2 className="animate-spin" />}
                {TRANSITION_LABEL[s]}
              </Button>
            ))}
            {canPay && (
              <Button variant="secondary" onClick={() => setPayOpen(true)}>
                <Banknote />
                Encaisser
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => window.open(`/print/${rid}/${order.id}?auto=1`, "_blank", "noopener")}
            >
              <Printer />
              Imprimer le ticket
            </Button>
            {order.allowed_transitions.includes("CANCELLED") && (
              <Button variant="destructive" disabled={busyStatus !== null} onClick={() => setCancelOpen(true)}>
                Annuler la commande
              </Button>
            )}
          </div>
        </section>
      </div>

      <ReasonDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={`Annuler la commande n° ${order.display_number}`}
        description="Le client et la cuisine seront informés. Indiquez la raison de l'annulation."
        confirmLabel="Annuler la commande"
        minLength={1}
        onConfirm={(reason) => setStatus("CANCELLED", reason)}
      />
      <ReasonDialog
        open={refundId !== null}
        onOpenChange={(o) => !o && setRefundId(null)}
        title="Rembourser le paiement"
        description="Le remboursement doit être effectué manuellement auprès du client. Indiquez le motif."
        confirmLabel="Rembourser"
        onConfirm={(reason) => refund(refundId!, reason)}
      />
      <PaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        remaining={remaining}
        currency={currency}
        onConfirm={pay}
      />
    </>
  );
}
