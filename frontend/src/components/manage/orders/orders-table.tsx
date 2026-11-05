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
  );
}
