"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  Ban,
  ChefHat,
  ChevronRight,
  CircleCheck,
  ExternalLink,
  Inbox,
  Power,
  QrCode,
  Receipt,
  ShoppingBag,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { localIsoDate, type Order, useRestaurant } from "@/components/manage/layout/hooks";
import { IconChip, KpiCard } from "@/components/manage/layout/kpi-card";
import { OrderDetailSheet } from "@/components/manage/orders/order-detail-sheet";
import { OrdersTable } from "@/components/manage/orders/orders-table";
import { EmptyState, PageHeader } from "@/components/shared/app-shell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { api, errorMessage, unwrap } from "@/lib/api/client";
import { formatMoney } from "@/lib/format";
import { ORDER_STATUS, type OrderStatus } from "@/lib/labels";
import { cn } from "@/lib/utils";

const ACTIVE: OrderStatus[] = ["NEW", "PREPARING", "READY"];

const STATUS_TILE: Record<string, { icon: React.ComponentType<{ className?: string }>; tile: string; chip: string }> = {
  NEW: {
    icon: Inbox,
    tile: "border-blue-200 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/30",
    chip: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200",
  },
  PREPARING: {
    icon: ChefHat,
    tile: "border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30",
    chip: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200",
  },
  READY: {
    icon: BellRing,
    tile: "border-green-200 bg-green-50/60 dark:border-green-900 dark:bg-green-950/30",
    chip: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200",
  },
};

export default function OverviewPage() {
  const { rid } = useParams<{ rid: string }>();
  const queryClient = useQueryClient();
  const { data: restaurant } = useRestaurant(rid);
  const currency = restaurant?.currency ?? "EUR";
  const today = localIsoDate();
  const [selected, setSelected] = useState<Order | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);
  const [saving, setSaving] = useState(false);

  // Clés sous ["orders", rid] : rafraîchies automatiquement par les événements temps réel.
  const stats = useQuery({
    queryKey: ["orders", rid, "stats-today", today],
    queryFn: () =>
      unwrap(
        api.GET("/api/restaurants/{restaurant_id}/stats", {
          params: { path: { restaurant_id: rid }, query: { from: today, to: today } },
        }),
      ),
  });
  const active = useQuery({
    queryKey: ["orders", rid, "active"],
    queryFn: () =>
      unwrap(api.GET("/api/restaurants/{restaurant_id}/orders/active", { params: { path: { restaurant_id: rid } } })),
  });
  const latest = useQuery({
    queryKey: ["orders", rid, "list", { page: 1, page_size: 8 }],
    queryFn: () =>
      unwrap(
        api.GET("/api/restaurants/{restaurant_id}/orders", {
          params: { path: { restaurant_id: rid }, query: { page: 1, page_size: 8 } },
        }),
      ),
  });

  const setAccepting = async (value: boolean) => {
    setSaving(true);
    try {
      const r = await unwrap(
        api.PATCH("/api/restaurants/{restaurant_id}", {
          params: { path: { restaurant_id: rid } },
          body: { accepting_orders: value },
        }),
      );
      queryClient.setQueryData(["restaurant", rid], r);
      toast.success(value ? "Les commandes sont ouvertes" : "Les commandes sont suspendues");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const counts = ACTIVE.map((s) => ({ status: s, count: active.data?.filter((o) => o.status === s).length ?? 0 }));
  const lateCount = active.data?.filter((o) => ACTIVE.includes(o.status) && o.is_late).length ?? 0;

  return (
    <>
      <PageHeader title="Vue d'ensemble" description="L'activité de votre restaurant aujourd'hui." />

      {restaurant && (
        <div
          className={cn(
            "mb-6 flex items-start gap-4 rounded-2xl border bg-card p-4 shadow-sm sm:items-center sm:p-5",
            !restaurant.accepting_orders && "border-amber-300 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20",
          )}
        >
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <IconChip icon={Power} tone={restaurant.accepting_orders ? "green" : "amber"} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor="accepting" className="text-base font-semibold">
                  Accepte les commandes
                </Label>
                <Badge
                  className={cn(
                    "border-transparent",
                    restaurant.is_open_now
                      ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200"
                      : "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
                  )}
                >
                  {restaurant.is_open_now ? "Ouvert actuellement" : "Fermé actuellement"}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {!restaurant.accepting_orders
                  ? "Les clients peuvent consulter le menu mais ne peuvent pas commander."
                  : !restaurant.is_open_now
                    ? "En dehors des horaires d'ouverture."
                    : "Vos clients peuvent commander via le QR Code et en ligne."}
              </p>
            </div>
          </div>
          <Switch
            id="accepting"
            className="mt-1 shrink-0 sm:mt-0"
            checked={restaurant.accepting_orders}
            disabled={saving}
            onCheckedChange={(v) => (v ? setAccepting(true) : setConfirmOff(true))}
          />
        </div>
      )}

      <section aria-labelledby="kpi-title" className="mb-6">
        <h2 id="kpi-title" className="sr-only">
          Indicateurs du jour
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.isPending ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)
          ) : stats.isError ? (
            <p className="col-span-full text-sm text-muted-foreground">{errorMessage(stats.error)}</p>
          ) : (
            <>
              <KpiCard icon={Receipt} tone="blue" label="Commandes du jour" value={stats.data.orders} />
              <KpiCard
                icon={Wallet}
                tone="green"
                label="Chiffre d'affaires"
                value={formatMoney(stats.data.revenue, currency)}
                hint="Commandes payées"
              />
              <KpiCard
                icon={ShoppingBag}
                tone="violet"
                label="Panier moyen"
                value={formatMoney(stats.data.average_ticket, currency)}
              />
              <KpiCard
                icon={Ban}
                tone="red"
                label="Annulées"
                value={stats.data.cancelled}
                hint={
                  stats.data.avg_preparation_minutes != null
                    ? `Préparation moy. ${Math.round(stats.data.avg_preparation_minutes)} min`
                    : undefined
                }
              />
            </>
          )}
        </div>
      </section>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <section
          aria-labelledby="active-title"
          className="flex flex-col rounded-2xl border bg-card p-4 shadow-sm sm:p-5 lg:col-span-2"
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 id="active-title" className="font-semibold">
              Commandes en cours
            </h2>
            {lateCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 dark:bg-red-950/50 dark:text-red-300">
                <AlertTriangle className="size-3.5" />
                {lateCount} commande{lateCount > 1 ? "s" : ""} en retard
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 dark:bg-green-950/50 dark:text-green-300">
                <CircleCheck className="size-3.5" />
                Aucun retard
              </span>
            )}
          </div>
          <ul className="grid flex-1 gap-3 sm:grid-cols-3">
            {counts.map(({ status, count }) => {
              const t = STATUS_TILE[status];
              const Icon = t.icon;
              return (
                <li
                  key={status}
                  className={cn("flex items-center gap-3 rounded-xl border p-3 sm:flex-col sm:items-start sm:justify-between sm:p-4", t.tile)}
                >
                  <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", t.chip)} aria-hidden>
                    <Icon className="size-4.5" />
                  </span>
                  <div className="flex min-w-0 flex-1 items-baseline justify-between gap-2 sm:w-full sm:flex-none sm:flex-col-reverse sm:items-start sm:gap-0.5">
                    <p className="text-sm font-medium">{ORDER_STATUS[status].label}</p>
                    <p className="text-3xl font-semibold tabular-nums sm:text-4xl">{active.isPending ? "…" : count}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
        <section aria-labelledby="quick-title" className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
          <h2 id="quick-title" className="mb-3 font-semibold">
            Accès rapides
          </h2>
          <ul className="grid gap-2">
            {[
              { href: `/manage/${rid}/qr`, label: "QR Code", hint: "Télécharger et imprimer", icon: QrCode, tone: "violet" as const },
              { href: `/manage/${rid}/menu`, label: "Menu", hint: "Produits, prix et disponibilités", icon: UtensilsCrossed, tone: "orange" as const },
            ].map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="group flex items-center gap-3 rounded-xl border p-2.5 transition-colors hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <IconChip icon={l.icon} tone={l.tone} className="size-9" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{l.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{l.hint}</span>
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
            {restaurant && (
              <li>
                <a
                  href={`/r/${restaurant.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-3 rounded-xl border p-2.5 transition-colors hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <IconChip icon={ExternalLink} tone="blue" className="size-9" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">Page publique</span>
                    <span className="block truncate text-xs text-muted-foreground">Voir ce que voient vos clients</span>
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </a>
              </li>
            )}
          </ul>
        </section>
      </div>

      <Card className="gap-0 overflow-hidden rounded-2xl pb-0">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <CardTitle>Dernières commandes</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link href={`/manage/${rid}/orders`}>
              Tout voir
              <ArrowRight />
            </Link>
          </Button>
        </CardHeader>
        {latest.isPending ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : latest.isError ? (
          <p className="p-4 text-sm text-muted-foreground">{errorMessage(latest.error)}</p>
        ) : latest.data.items.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Receipt}
              title="Aucune commande pour le moment"
              description="Imprimez votre QR Code pour recevoir vos premières commandes."
            />
          </div>
        ) : (
          <div className="border-t">
            <OrdersTable orders={latest.data.items} currency={currency} onSelect={setSelected} showDate />
          </div>
        )}
      </Card>

      <OrderDetailSheet
        rid={rid}
        order={selected}
        currency={currency}
        onOpenChange={(o) => !o && setSelected(null)}
      />

      <AlertDialog open={confirmOff} onOpenChange={setConfirmOff}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Suspendre les commandes ?</AlertDialogTitle>
            <AlertDialogDescription>
              Les clients ne pourront plus commander via le QR Code ni en ligne jusqu&apos;à la réactivation. Les
              commandes en cours ne sont pas affectées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => setAccepting(false)}>
              Suspendre
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
