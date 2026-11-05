"use client";

import { useMutation, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { Banknote, HandPlatter, Loader2, Printer } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { OrderStatusBadge, PaymentStatusBadge } from "@/components/shared/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { api, errorMessage, unwrap } from "@/lib/api/client";
import { formatElapsed, formatMoney, formatTime } from "@/lib/format";
import { CHANNEL, SERVICE_MODE } from "@/lib/labels";

import { availableTransitions, type Order, type TransitionRules } from "../kitchen/orders";
import { type PosPayment, PaymentDialog } from "./payment-dialog";

export function printReceipt(rid: string, oid: string) {
  window.open(`/print/${rid}/${oid}?auto=1`, "_blank", "noopener");
}

function isUnpaid(o: Order) {
  return o.payment_status === "UNPAID" || o.payment_status === "PARTIALLY_PAID";
}

export function OrdersSheet({
  rid,
  open,
  onOpenChange,
  rules,
  active,
  awaiting,
  now,
}: {
  rid: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  rules: TransitionRules | undefined;
  active: UseQueryResult<Order[]>;
  awaiting: UseQueryResult<Order[]>;
  now: number;
}) {
  const qc = useQueryClient();
  const [paying, setPaying] = useState<Order | null>(null);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["pos-active", rid] });
    void qc.invalidateQueries({ queryKey: ["pos-awaiting", rid] });
  };

  const handOver = useMutation({
    mutationFn: (o: Order) =>
      unwrap(
        api.POST("/api/restaurants/{restaurant_id}/orders/{order_id}/status", {
          params: { path: { restaurant_id: rid, order_id: o.id } },
          body: { status: "COMPLETED" },
        }),
      ),
    onSuccess: (o) => {
      toast.success(`Commande ${o.display_number} remise au client`);
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const pay = useMutation({
    mutationFn: ({ order, payment }: { order: Order; payment: PosPayment }) =>
      unwrap(
        api.POST("/api/restaurants/{restaurant_id}/orders/{order_id}/payments", {
          params: { path: { restaurant_id: rid, order_id: order.id } },
          body: { method: payment.method, amount_tendered: payment.amount_tendered ?? null },
        }),
      ),
    onSuccess: (o, { order, payment }) => {
      const due = order.total - order.amount_paid;
      const change = payment.method === "CASH" && payment.amount_tendered ? payment.amount_tendered - due : 0;
      toast.success(
        `Commande ${o.display_number} encaissée${change > 0 ? ` — monnaie à rendre : ${formatMoney(change, o.currency)}` : ""}`,
        { duration: change > 0 ? 15_000 : 4_000 },
      );
      setPaying(null);
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const orders = active.data ?? [];
  const ready = orders.filter((o) => o.status === "READY");
  const inProgress = orders.filter((o) => o.status === "NEW" || o.status === "PREPARING");
  const prepay = awaiting.data ?? [];

  const row = (o: Order) => {
    const transitions = availableTransitions(o, rules);
    return (
      <li key={o.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-background p-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="tabular text-2xl font-black">{o.display_number}</span>
            <OrderStatusBadge status={o.status} />
            <PaymentStatusBadge status={o.payment_status} />
          </div>
          <p className="truncate text-sm text-muted-foreground">
            {CHANNEL[o.channel]} · {SERVICE_MODE[o.service_mode]}
            {o.table_label ? ` · Table ${o.table_label}` : ""}
            {o.customer_name ? ` · ${o.customer_name}` : ""}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatTime(o.created_at)} · il y a {formatElapsed(o.created_at, now)} ·{" "}
            <span className="tabular font-semibold text-foreground">{formatMoney(o.total, o.currency)}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="size-12"
            aria-label={`Imprimer le ticket de la commande ${o.display_number}`}
            onClick={() => printReceipt(rid, o.id)}
          >
            <Printer className="size-5" />
          </Button>
          {isUnpaid(o) && o.status !== "CANCELLED" && (
            <Button variant="outline" className="h-12 text-base" onClick={() => setPaying(o)}>
              <Banknote className="size-5" />
              Encaisser
            </Button>
          )}
          {o.status === "READY" && transitions.includes("COMPLETED") && (
            <Button
              className="h-12 text-base"
              disabled={handOver.isPending && handOver.variables?.id === o.id}
              onClick={() => handOver.mutate(o)}
            >
              {handOver.isPending && handOver.variables?.id === o.id ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <HandPlatter className="size-5" />
              )}
              Remettre
            </Button>
          )}
        </div>
      </li>
    );
  };

  const section = (title: string, list: Order[], empty: string, loading: boolean) => (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
        <Badge variant="secondary">{list.length}</Badge>
      </h3>
      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Chargement…
        </p>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-2">{list.map(row)}</ul>
      )}
    </section>
  );

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full gap-0 bg-muted/40 sm:max-w-xl">
          <SheetHeader className="border-b bg-background">
            <SheetTitle className="text-xl">Commandes en cours</SheetTitle>
            <SheetDescription>Remettez les commandes prêtes et encaissez les commandes non réglées.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-6 overflow-y-auto p-4">
            {(active.isError || awaiting.isError) && (
              <p className="text-sm text-destructive">{errorMessage(active.error ?? awaiting.error)}</p>
            )}
            {(prepay.length > 0 || awaiting.isLoading) &&
              section(
                "En attente de paiement (pas encore en cuisine)",
                prepay,
                "Aucune commande en attente.",
                awaiting.isLoading,
              )}
            {section("Prêtes à remettre", ready, "Aucune commande prête.", active.isLoading)}
            {section("En cuisine", inProgress, "Aucune commande en préparation.", active.isLoading)}
          </div>
        </SheetContent>
      </Sheet>
      <PaymentDialog
        open={paying !== null}
        onOpenChange={(o) => !o && setPaying(null)}
        title={paying ? `Encaisser la commande ${paying.display_number}` : "Encaisser"}
        description={paying && paying.sent_to_kitchen_at === null ? "Une fois réglée, la commande partira en cuisine." : undefined}
        amountDue={paying ? paying.total - paying.amount_paid : 0}
        currency={paying?.currency ?? "XOF"}
        submitting={pay.isPending}
        onSubmit={(payment) => paying && payment && pay.mutate({ order: paying, payment })}
      />
    </>
  );
}
