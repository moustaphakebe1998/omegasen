"use client";

import { OrderStatusBadge, PaymentStatusBadge } from "@/components/shared/status";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime, formatMoney, formatTime } from "@/lib/format";
import { CHANNEL, SERVICE_MODE } from "@/lib/labels";
import { cn } from "@/lib/utils";

import { type Order } from "../layout/hooks";

/** Tableau de commandes ; un clic (ou Entrée) sur une ligne ouvre le détail. */
export function OrdersTable({
  orders,
  currency,
  onSelect,
  showDate = false,
}: {
  orders: Order[];
  currency: string;
  onSelect: (o: Order) => void;
  showDate?: boolean;
}) {
  return (
    <>
      {/* Mobile : liste de cartes, sans défilement horizontal. */}
      <ul className="divide-y md:hidden">
        {orders.map((o) => (
          <li key={o.id}>
            <button
              type="button"
              onClick={() => onSelect(o)}
              aria-label={`Ouvrir la commande n° ${o.display_number}`}
              className={cn(
                "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted focus-visible:outline-none",
                o.is_late && "bg-destructive/5",
              )}
            >
              <span className="flex h-10 min-w-12 shrink-0 items-center justify-center rounded-xl bg-muted px-2 font-semibold tabular-nums">
                {o.display_number}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-medium">{o.customer_name ?? CHANNEL[o.channel]}</span>
                  <span className="shrink-0 font-semibold tabular-nums">{formatMoney(o.total, currency)}</span>
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {showDate ? formatDateTime(o.created_at) : formatTime(o.created_at)} · {CHANNEL[o.channel]} ·{" "}
                  {SERVICE_MODE[o.service_mode]}
                  {o.table_label && ` · ${o.table_label}`}
                </span>
                <span className="mt-2 flex flex-wrap gap-1.5">
                  <OrderStatusBadge status={o.status} />
                  <PaymentStatusBadge status={o.payment_status} />
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
    <Table className="min-w-[760px]">
      <TableHeader>
        <TableRow>
          <TableHead>N°</TableHead>
          <TableHead>{showDate ? "Date" : "Heure"}</TableHead>
          <TableHead>Canal</TableHead>
          <TableHead>Mode</TableHead>
          <TableHead>Client</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead>Statut</TableHead>
          <TableHead>Paiement</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((o) => (
          <TableRow
            key={o.id}
            tabIndex={0}
            role="button"
            aria-label={`Ouvrir la commande n° ${o.display_number}`}
            className={cn("cursor-pointer focus-visible:bg-muted focus-visible:outline-none", o.is_late && "bg-destructive/5")}
            onClick={() => onSelect(o)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(o);
              }
            }}
          >
            <TableCell className="font-semibold tabular-nums">{o.display_number}</TableCell>
            <TableCell className="tabular-nums">{showDate ? formatDateTime(o.created_at) : formatTime(o.created_at)}</TableCell>
            <TableCell>{CHANNEL[o.channel]}</TableCell>
            <TableCell>
              {SERVICE_MODE[o.service_mode]}
              {o.table_label && <span className="text-muted-foreground"> · {o.table_label}</span>}
            </TableCell>
            <TableCell className="max-w-40 truncate">{o.customer_name ?? "—"}</TableCell>
            <TableCell className="text-right tabular-nums">{formatMoney(o.total, currency)}</TableCell>
            <TableCell>
              <OrderStatusBadge status={o.status} />
            </TableCell>
            <TableCell>
              <PaymentStatusBadge status={o.payment_status} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
      </div>
    </>
  );
}
