"use client";

import { ArrowRight, Check, ChefHat, Loader2, MessageSquareWarning, Undo2 } from "lucide-react";

import { formatElapsed, formatTime } from "@/lib/format";
import { CHANNEL, PAYMENT_STATUS, SERVICE_MODE, type OrderStatus } from "@/lib/labels";
import { cn } from "@/lib/utils";

import { availableTransitions, CHANNEL_STYLE, elapsedMinutes, type Order, ROLLBACK, type TransitionRules } from "./orders";

const FORWARD: Partial<Record<OrderStatus, { to: OrderStatus; label: string; icon: typeof Check; className: string }>> = {
  NEW: { to: "PREPARING", label: "Commencer", icon: ChefHat, className: "bg-amber-500 text-black hover:bg-amber-400" },
  PREPARING: { to: "READY", label: "Prête", icon: Check, className: "bg-green-500 text-black hover:bg-green-400" },
  READY: { to: "COMPLETED", label: "Terminée", icon: ArrowRight, className: "bg-neutral-100 text-black hover:bg-white" },
};

const ACCENT: Record<OrderStatus, string> = {
  NEW: "border-blue-500/60",
  PREPARING: "border-amber-500/60",
  READY: "border-green-500/60",
  COMPLETED: "border-neutral-700 opacity-75",
  CANCELLED: "border-neutral-700",
};

export function KitchenOrderCard({
  order,
  now,
  lateAfterMinutes,
  rules,
  stationId,
  busy,
  onTransition,
}: {
  order: Order;
  now: number;
  lateAfterMinutes: number;
  rules: TransitionRules | undefined;
  stationId: string | null;
  busy: boolean;
  onTransition: (order: Order, to: OrderStatus) => void;
}) {
  const since = order.sent_to_kitchen_at ?? order.created_at;
  const inProgress = order.status === "NEW" || order.status === "PREPARING";
  const late = inProgress && elapsedMinutes(since, now) > lateAfterMinutes;
  const transitions = availableTransitions(order, rules);
  const forward = FORWARD[order.status];
  const canForward = forward && transitions.includes(forward.to);
  const back = ROLLBACK[order.status];
  const canBack = back && transitions.includes(back);
  const unpaid = order.payment_status === "UNPAID" || order.payment_status === "PARTIALLY_PAID";

  const items = stationId
    ? [...order.items].sort((a, b) => Number(b.station_id === stationId) - Number(a.station_id === stationId))
    : order.items;

  return (
    <article
      aria-label={`Commande ${order.display_number}`}
      className={cn("relative flex flex-col gap-3 rounded-xl border-2 bg-neutral-900 p-4 text-neutral-50", ACCENT[order.status])}
    >
      {late && (
        <div aria-hidden className="pointer-events-none absolute -inset-0.5 animate-pulse rounded-xl ring-4 ring-red-500" />
      )}

      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="tabular text-5xl leading-none font-black tracking-tight">{order.display_number}</p>
          {order.customer_name && <p className="mt-1 truncate text-lg font-semibold">{order.customer_name}</p>}
        </div>
        <div className="text-right">
          <p
            className={cn("tabular text-2xl font-bold", late ? "text-red-400" : "text-neutral-200")}
            aria-label={`Depuis ${formatElapsed(since, now)}`}
          >
            {formatElapsed(since, now)}
          </p>
          <p className="text-xs text-neutral-400">reçue à {formatTime(since)}</p>
          {late && <p className="mt-1 text-xs font-bold tracking-wide text-red-400 uppercase">En retard</p>}
        </div>
      </header>

      <div className="flex flex-wrap gap-1.5 text-sm font-semibold">
        <span className={cn("rounded-md px-2 py-0.5 ring-1", CHANNEL_STYLE[order.channel])}>{CHANNEL[order.channel]}</span>
        <span className="rounded-md bg-neutral-800 px-2 py-0.5 ring-1 ring-neutral-600">
          {SERVICE_MODE[order.service_mode]}
          {order.table_label ? ` · Table ${order.table_label}` : ""}
        </span>
        {unpaid && (
          <span className="rounded-md bg-red-500/20 px-2 py-0.5 text-red-200 ring-1 ring-red-400/50">
            {PAYMENT_STATUS[order.payment_status].label}
          </span>
        )}
      </div>

      {order.note && (
        <p className="flex gap-2 rounded-md bg-yellow-300 px-3 py-2 font-semibold text-black">
          <MessageSquareWarning className="mt-0.5 size-5 shrink-0" aria-hidden />
          <span>{order.note}</span>
        </p>
      )}

      <ul className="space-y-2">
        {items.map((item) => {
          const dimmed = stationId !== null && item.station_id !== stationId;
          return (
            <li key={item.id} className={cn(dimmed && "opacity-35")}>
              <p className={cn("leading-snug font-semibold", dimmed ? "text-base" : "text-xl")}>
                <span className="tabular mr-1 text-amber-300">{item.quantity} ×</span> {item.product_name}
                {dimmed && <span className="sr-only"> (autre poste)</span>}
              </p>
              {item.options.length > 0 && (
                <ul className="mt-0.5 pl-7 text-base text-neutral-300">
                  {item.options.map((o, i) => (
                    <li key={i}>
                      – {o.option_name}
                      <span className="text-neutral-500"> ({o.group_name})</span>
                    </li>
                  ))}
                </ul>
              )}
              {item.note && (
                <p className="mt-1 ml-7 rounded bg-yellow-300 px-2 py-1 text-base font-semibold text-black">
                  {item.note}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {(canForward || canBack) && (
        <div className="mt-auto flex items-stretch gap-2 pt-1">
          {canBack && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onTransition(order, back!)}
              className="flex min-h-14 items-center justify-center gap-1 rounded-lg border border-neutral-600 px-3 text-sm font-semibold text-neutral-200 active:bg-neutral-800 disabled:opacity-50"
              aria-label={`Retour à l'étape précédente pour la commande ${order.display_number}`}
            >
              <Undo2 className="size-4" aria-hidden />
              Retour
            </button>
          )}
          {canForward && forward && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onTransition(order, forward.to)}
              className={cn(
                "flex min-h-14 flex-1 items-center justify-center gap-2 rounded-lg text-xl font-bold transition-colors disabled:opacity-60",
                forward.className,
              )}
            >
              {busy ? <Loader2 className="size-6 animate-spin" aria-hidden /> : <forward.icon className="size-6" aria-hidden />}
              {forward.label}
            </button>
          )}
        </div>
      )}
    </article>
  );
}
