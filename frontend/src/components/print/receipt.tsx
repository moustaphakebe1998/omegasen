"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2, Printer } from "lucide-react";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { api, errorMessage, type Schemas, unwrap } from "@/lib/api/client";
import { formatDateTime, formatMoney } from "@/lib/format";
import { CHANNEL, PAYMENT_METHOD, PAYMENT_STATUS, type PaymentMethod, SERVICE_MODE } from "@/lib/labels";

type Order = Schemas["OrderOut"];
type Restaurant = Schemas["RestaurantOut"];

const PRINT_CSS = `
@page { size: 80mm auto; margin: 4mm; }
@media print {
  html, body { background: #fff !important; }
  .receipt { width: auto !important; margin: 0 !important; padding: 0 !important; box-shadow: none !important; border: 0 !important; }
}
`;

function Row({ left, right, bold }: { left: React.ReactNode; right: React.ReactNode; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 ${bold ? "font-bold" : ""}`}>
      <span className="min-w-0">{left}</span>
      <span className="shrink-0 text-right">{right}</span>
    </div>
  );
}

const Rule = () => <div className="my-2 border-t border-dashed border-black" aria-hidden />;

export function Receipt({ rid, oid, autoPrint }: { rid: string; oid: string; autoPrint: boolean }) {
  const restaurant = useQuery({
    queryKey: ["restaurant", rid],
    queryFn: () => unwrap(api.GET("/api/restaurants/{restaurant_id}", { params: { path: { restaurant_id: rid } } })),
  });
  const order = useQuery({
    queryKey: ["order", rid, oid],
    queryFn: () =>
      unwrap(
        api.GET("/api/restaurants/{restaurant_id}/orders/{order_id}", {
          params: { path: { restaurant_id: rid, order_id: oid } },
        }),
      ),
    staleTime: 0,
  });

  const printed = useRef(false);
  const ready = Boolean(restaurant.data && order.data);
  useEffect(() => {
    if (!autoPrint || !ready || printed.current) return;
    printed.current = true;
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, [autoPrint, ready]);

  if (restaurant.isError || order.isError) {
    return <p className="p-6 text-center text-destructive">{errorMessage(restaurant.error ?? order.error)}</p>;
  }
  if (!restaurant.data || !order.data) {
    return (
      <p className="flex items-center justify-center gap-2 p-6 text-muted-foreground" role="status">
        <Loader2 className="size-4 animate-spin" /> Préparation du ticket…
      </p>
    );
  }

  return (
    <div className="min-h-dvh bg-neutral-100 py-6 print:bg-white print:py-0">
      <style>{PRINT_CSS}</style>
      <div className="no-print mx-auto mb-4 flex w-[80mm] justify-center gap-2">
        <Button onClick={() => window.print()} className="h-11">
          <Printer className="size-4" />
          Imprimer
        </Button>
      </div>
      <ReceiptBody restaurant={restaurant.data} order={order.data} />
    </div>
  );
}

function ReceiptBody({ restaurant: r, order: o }: { restaurant: Restaurant; order: Order }) {
  const money = (v: number) => formatMoney(v, o.currency);
  const cityLine = [r.postal_code, r.city].filter(Boolean).join(" ");
  const succeeded = o.payments.filter((p) => p.status === "SUCCEEDED" || p.status === "REFUNDED");

  return (
    <article className="receipt mx-auto w-[80mm] bg-white p-4 font-mono text-[12px] leading-snug text-black shadow">
      <header className="text-center">
        <h1 className="text-base font-bold uppercase">{r.name}</h1>
        {r.address_line && <p>{r.address_line}</p>}
        {cityLine && <p>{cityLine}</p>}
        {r.phone && <p>Tél. {r.phone}</p>}
      </header>
      <Rule />
      <div className="text-center">
        <p className="text-lg font-bold">Commande n° {o.display_number}</p>
        <p>Réf. {o.reference}</p>
        <p>{formatDateTime(o.created_at)}</p>
        <p>
          {CHANNEL[o.channel]} · {SERVICE_MODE[o.service_mode]}
        </p>
        {o.table_label && <p className="font-bold">Table {o.table_label}</p>}
        {o.customer_name && <p>Client : {o.customer_name}</p>}
      </div>
      <Rule />
      <ul className="space-y-1.5">
        {o.items.map((i) => (
          <li key={i.id}>
            <Row left={`${i.quantity} × ${i.product_name}`} right={money(i.line_total)} />
            {i.quantity > 1 && <p className="pl-4 text-[11px]">({money(i.unit_price)} l&apos;unité)</p>}
            {i.options.map((op, k) => (
              <p key={k} className="pl-4 text-[11px]">
                + {op.option_name}
                {op.price_delta !== 0 && ` (${op.price_delta > 0 ? "+" : ""}${money(op.price_delta)})`}
              </p>
            ))}
            {i.note && <p className="pl-4 text-[11px] italic">Note : {i.note}</p>}
          </li>
        ))}
      </ul>
      {o.note && (
        <>
          <Rule />
          <p className="italic">Note : {o.note}</p>
        </>
      )}
      <Rule />
      {o.discount > 0 && (
        <>
          <Row left="Sous-total" right={money(o.subtotal)} />
          <Row left="Remise" right={`-${money(o.discount)}`} />
        </>
      )}
      <div className="text-sm">
        <Row left="TOTAL TTC" right={money(o.total)} bold />
      </div>
      <Row left="dont TVA" right={money(o.tax_total)} />
      <Rule />
      {succeeded.length > 0 ? (
        <div className="space-y-1">
          {succeeded.map((p) => {
            const label = PAYMENT_METHOD[p.method as PaymentMethod] ?? p.method;
            const refunded = p.status === "REFUNDED";
            return (
              <div key={p.id}>
                <Row left={`${label}${refunded ? " (remboursé)" : ""}`} right={money(p.amount)} />
                {p.amount_tendered != null && p.amount_tendered > 0 && (
                  <>
                    <Row left={<span className="pl-4">Montant remis</span>} right={money(p.amount_tendered)} />
                    <Row left={<span className="pl-4">Monnaie rendue</span>} right={money(Math.max(0, p.amount_tendered - p.amount))} />
                  </>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
      <Row left="Statut du paiement" right={PAYMENT_STATUS[o.payment_status].label} bold />
      {o.payment_status !== "PAID" && o.payment_status !== "REFUNDED" && (
        <Row left="Reste à payer" right={money(Math.max(0, o.total - o.amount_paid))} />
      )}
      <Rule />
      <p className="text-center font-bold">Merci de votre visite !</p>
      <p className="mt-1 text-center text-[10px]">Propulsé par OmegaSen</p>
    </article>
  );
}
