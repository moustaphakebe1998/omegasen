"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, ChefHat, CircleCheckBig, Inbox, PackageCheck, Receipt, XCircle } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef } from "react";

import { EmptyState, Logo } from "@/components/shared/app-shell";
import { PaymentStatusBadge } from "@/components/shared/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, api, errorMessage, unwrap, type Schemas } from "@/lib/api/client";
import { formatMoney, formatTime } from "@/lib/format";
import { CHANNEL, ORDER_STATUS, SERVICE_MODE, type OrderStatus } from "@/lib/labels";
import { useOrderSocket } from "@/lib/realtime";
import { cn } from "@/lib/utils";

type Tracking = Schemas["TrackingOut"];

const STEPS: { status: OrderStatus; icon: React.ComponentType<{ className?: string }>; at: keyof Tracking }[] = [
  { status: "NEW", icon: Inbox, at: "created_at" },
  { status: "PREPARING", icon: ChefHat, at: "preparing_at" },
  { status: "READY", icon: Bell, at: "ready_at" },
  { status: "COMPLETED", icon: PackageCheck, at: "completed_at" },
];

const FINAL: OrderStatus[] = ["COMPLETED", "CANCELLED"];

function StatusProgress({ order }: { order: Tracking }) {
  const current = STEPS.findIndex((s) => s.status === order.status);
  return (
    <ol className="grid grid-cols-4 gap-1 pt-1" aria-label="Avancement de la commande">
      {STEPS.map((s, i) => {
        const done = i < current || order.status === "COMPLETED";
        const active = i === current && order.status !== "COMPLETED";
        const at = order[s.at] as string | null;
        const Icon = done ? Check : s.icon;
        return (
          <li
            key={s.status}
            aria-current={active ? "step" : undefined}
            className="relative flex flex-col items-center gap-1.5 text-center"
          >
            {i > 0 && (
              <span
                aria-hidden
                className={cn(
                  "absolute top-5 right-1/2 h-0.5 w-full -translate-y-1/2",
                  i <= current ? "bg-primary" : "bg-border",
                )}
              />
            )}
            <span
              className={cn(
                "relative flex size-10 items-center justify-center rounded-full border-2 transition-colors",
                done && "border-primary bg-primary text-primary-foreground",
                active && "border-primary bg-background text-primary ring-4 ring-primary/20",
                !done && !active && "border-border bg-background text-muted-foreground",
              )}
            >
              <Icon className="size-5" aria-hidden />
            </span>
            <span
              className={cn("px-0.5 text-xs leading-tight sm:text-sm", done || active ? "font-semibold" : "text-muted-foreground")}
            >
              {ORDER_STATUS[s.status].label}
              <span className="sr-only">{done ? " (terminé)" : active ? " (en cours)" : " (à venir)"}</span>
            </span>
            {at && (done || active) && <span className="tabular text-xs text-muted-foreground">{formatTime(at)}</span>}
          </li>
        );
      })}
    </ol>
  );
}

function statusMessage(o: Tracking) {
  switch (o.status) {
    case "NEW":
      return o.payment_status === "UNPAID" && o.payment_preference === "AT_COUNTER"
        ? "Votre commande a bien été reçue. Pensez à la régler au comptoir."
        : "Votre commande a bien été reçue par le restaurant.";
    case "PREPARING":
      return "Votre commande est en cours de préparation.";
    case "READY":
      return o.service_mode === "DINE_IN"
        ? "Présentez votre numéro au comptoir ou attendez d'être servi."
        : "Présentez votre numéro au comptoir pour la récupérer.";
    case "COMPLETED":
      return "Commande terminée. Merci et à bientôt !";
    case "CANCELLED":
      return "Cette commande a été annulée. Rapprochez-vous du restaurant pour plus d'informations.";
  }
}

export default function TrackPage() {
  const { token } = useParams<{ token: string }>();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["tracking", token],
    queryFn: () => unwrap(api.GET("/api/public/orders/{token}", { params: { path: { token } } })),
    refetchInterval: (q) => (q.state.data && FINAL.includes(q.state.data.status) ? false : 30_000),
    refetchOnWindowFocus: true,
  });
  const order = query.data;

  const connection = useOrderSocket(token, (e) => {
    if (e.event === "order.updated" && e.data) qc.setQueryData(["tracking", token], e.data as Tracking);
  });

  // Vibration + titre d'onglet quand la commande devient prête.
  const previous = useRef<OrderStatus | null>(null);
  const status = order?.status ?? null;
  useEffect(() => {
    if (!status) return;
    if (status === "READY" && previous.current && previous.current !== "READY") {
      try {
        navigator.vibrate?.([300, 150, 300, 150, 300]);
      } catch {
        /* non supporté */
      }
    }
    previous.current = status;
    if (status === "READY") {
      const prevTitle = document.title;
      document.title = "Commande prête ! · OmegaSen";
      return () => {
        document.title = prevTitle;
      };
    }
  }, [status]);

  let body: React.ReactNode;
  if (!order) {
    if (query.isError) {
      const missing = query.error instanceof ApiError && query.error.status === 404;
      body = (
        <EmptyState
          icon={Receipt}
          title={missing ? "Commande introuvable" : "Impossible de charger la commande"}
          description={missing ? "Ce lien de suivi n'est pas valide ou a expiré." : errorMessage(query.error)}
          action={
            missing ? (
              <Button asChild variant="outline">
                <Link href="/">Retour à l&apos;accueil</Link>
              </Button>
            ) : (
              <Button onClick={() => query.refetch()}>Réessayer</Button>
            )
          }
        />
      );
    } else {
      body = (
        <div className="space-y-4" aria-busy="true" aria-label="Chargement de la commande">
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      );
    }
  } else {
    const ready = order.status === "READY";
    const cancelled = order.status === "CANCELLED";
    body = (
      <div className="space-y-4">
        <section
          aria-labelledby="order-number"
          className={cn(
            "relative overflow-hidden rounded-2xl border p-6 text-center shadow-sm transition-colors sm:p-8",
            ready && "border-green-600 bg-green-600 text-white",
            cancelled && "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950",
            !ready && !cancelled && "bg-card bg-gradient-to-b from-primary/10 to-transparent to-60%",
          )}
        >
          <Link
            href={`/r/${order.restaurant_slug}`}
            className={cn("text-sm font-medium underline-offset-4 hover:underline", ready ? "text-white/90" : "text-muted-foreground")}
          >
            {order.restaurant_name}
          </Link>
          <p className={cn("mt-2 text-sm font-medium uppercase", ready ? "text-white/90" : "text-muted-foreground")}>
            Commande n°
          </p>
          <h1 id="order-number" className="tabular text-7xl leading-none font-black tracking-tight sm:text-8xl">
            {order.display_number}
          </h1>
          {order.customer_name && (
            <p className={cn("mt-2", ready ? "text-white/90" : "text-muted-foreground")}>Au nom de {order.customer_name}</p>
          )}

          <div aria-live="polite" className="mt-4">
            {ready ? (
              <div className="space-y-1">
                <p className="flex items-center justify-center gap-2 text-2xl font-bold">
                  <CircleCheckBig className="size-7" aria-hidden /> Votre commande est prête !
                </p>
                <p className="text-white/90">{statusMessage(order)}</p>
              </div>
            ) : cancelled ? (
              <div className="space-y-1 text-red-800 dark:text-red-200">
                <p className="flex items-center justify-center gap-2 text-xl font-bold">
                  <XCircle className="size-6" aria-hidden /> Commande annulée
                  {order.cancelled_at && <span className="text-sm font-normal">à {formatTime(order.cancelled_at)}</span>}
                </p>
                <p className="text-sm">{statusMessage(order)}</p>
              </div>
            ) : (
              <p className="mx-auto max-w-xs text-muted-foreground">{statusMessage(order)}</p>
            )}
          </div>
        </section>

        {!cancelled && (
          <section aria-label="Suivi" className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
            <StatusProgress order={order} />
            {!FINAL.includes(order.status) && (
              <p className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <span
                  aria-hidden
                  className={cn(
                    "size-2 rounded-full",
                    connection === "open" ? "animate-pulse bg-green-500" : "bg-amber-500",
                  )}
                />
                {connection === "open" ? "Mise à jour en direct" : "Reconnexion au suivi en direct…"}
              </p>
            )}
          </section>
        )}

        <section aria-labelledby="order-details" className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="order-details" className="font-semibold">
              Détail de la commande
            </h2>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline">{SERVICE_MODE[order.service_mode]}</Badge>
              <PaymentStatusBadge status={order.payment_status} />
            </div>
          </div>
          <ul className="mt-3 divide-y">
            {order.items.map((it) => (
              <li key={it.id} className="flex items-start gap-3 py-3 text-sm">
                <span className="tabular flex h-7 min-w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 px-1.5 text-xs font-semibold text-primary">
                  {it.quantity}×
                </span>
                <div className="min-w-0 flex-1">
                  <p className="pt-1 font-medium break-words">{it.product_name}</p>
                  {it.options.length > 0 && (
                    <ul className="text-muted-foreground">
                      {it.options.map((o, i) => (
                        <li key={i}>
                          {o.option_name}
                          {o.price_delta > 0 && ` (+${formatMoney(o.price_delta, order.currency)})`}
                        </li>
                      ))}
                    </ul>
                  )}
                  {it.note && <p className="text-muted-foreground italic">« {it.note} »</p>}
                </div>
                <span className="tabular shrink-0 pt-1 font-medium">{formatMoney(it.line_total, order.currency)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-baseline justify-between border-t pt-3">
            <span className="font-semibold">Total</span>
            <span className="tabular text-lg font-bold">{formatMoney(order.total, order.currency)}</span>
          </div>
          {order.tax_total > 0 && (
            <p className="tabular text-right text-xs text-muted-foreground">
              dont TVA {formatMoney(order.tax_total, order.currency)}
            </p>
          )}
          {order.payment_status === "UNPAID" && order.payment_preference === "AT_COUNTER" && !cancelled && (
            <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              À régler au comptoir.
            </p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Réf. {order.reference} · {CHANNEL[order.channel]} · passée à {formatTime(order.created_at)}
          </p>
        </section>

        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <Button asChild variant="outline">
            <Link href={`/r/${order.restaurant_slug}`}>Revenir au menu</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-4">
          <Logo />
        </div>
      </header>
      <main className="mx-auto w-full max-w-lg p-4 pt-6 pb-12">{body}</main>
    </div>
  );
}
