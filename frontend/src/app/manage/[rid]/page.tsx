"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, ExternalLink, QrCode, Receipt, UtensilsCrossed } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { localIsoDate, type Order, useRestaurant } from "@/components/manage/layout/hooks";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { api, errorMessage, unwrap } from "@/lib/api/client";
import { formatMoney } from "@/lib/format";
import { ORDER_STATUS, type OrderStatus } from "@/lib/labels";
import { cn } from "@/lib/utils";

const ACTIVE: OrderStatus[] = ["NEW", "PREPARING", "READY"];

function Kpi({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <Card className="gap-1 p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}

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
        <Card className="mb-6">
          <CardContent className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-3">
              <Switch
                id="accepting"
                checked={restaurant.accepting_orders}
                disabled={saving}
                onCheckedChange={(v) => (v ? setAccepting(true) : setConfirmOff(true))}
              />
              <Label htmlFor="accepting" className="text-base">
                Accepte les commandes
              </Label>
            </div>
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
            {!restaurant.accepting_orders && (
              <p className="text-sm text-muted-foreground">
                Les clients peuvent consulter le menu mais ne peuvent pas commander.
              </p>
            )}
            {restaurant.accepting_orders && !restaurant.is_open_now && (
              <p className="text-sm text-muted-foreground">En dehors des horaires d&apos;ouverture.</p>
            )}
          </CardContent>
        </Card>
      )}

      <section aria-labelledby="kpi-title" className="mb-6">
        <h2 id="kpi-title" className="sr-only">
          Indicateurs du jour
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.isPending ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)
          ) : stats.isError ? (
            <p className="col-span-full text-sm text-muted-foreground">{errorMessage(stats.error)}</p>
          ) : (
            <>
              <Kpi label="Commandes du jour" value={stats.data.orders} />
              <Kpi
                label="Chiffre d'affaires"
                value={formatMoney(stats.data.revenue, currency)}
                hint="Commandes payées"
              />
              <Kpi label="Panier moyen" value={formatMoney(stats.data.average_ticket, currency)} />
              <Kpi
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
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Commandes en cours</CardTitle>
            <CardDescription>
              {lateCount > 0 ? `${lateCount} commande${lateCount > 1 ? "s" : ""} en retard` : "Aucun retard"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid grid-cols-3 gap-3">
              {counts.map(({ status, count }) => (
                <li key={status} className={cn("rounded-lg p-3", ORDER_STATUS[status].className)}>
                  <p className="text-3xl font-semibold tabular-nums">{active.isPending ? "…" : count}</p>
                  <p className="text-xs font-medium">{ORDER_STATUS[status].label}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Accès rapides</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            <Button asChild variant="outline" className="justify-start">
              <Link href={`/manage/${rid}/qr`}>
                <QrCode />
                QR Code
              </Link>
            </Button>
            <Button asChild variant="outline" className="justify-start">
              <Link href={`/manage/${rid}/menu`}>
                <UtensilsCrossed />
                Menu
              </Link>
            </Button>
            {restaurant && (
              <Button asChild variant="outline" className="justify-start">
                <a href={`/r/${restaurant.slug}`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink />
                  Page publique
                </a>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="gap-0 pb-0">
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
