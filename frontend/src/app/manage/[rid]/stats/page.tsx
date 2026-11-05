"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Ban,
  BarChart3,
  CalendarRange,
  Clock,
  QrCode,
  Receipt,
  ShoppingBag,
  Store,
  Timer,
  Trophy,
  Wallet,
} from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";

import { addDays, formatIsoDay, localIsoDate, useRestaurant } from "@/components/manage/layout/hooks";
import { BreakdownBars, OrdersByHourChart, RevenueByDayChart } from "@/components/manage/stats/charts";
import { IconChip, KpiCard } from "@/components/manage/layout/kpi-card";
import { PageHeader } from "@/components/shared/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { api, errorMessage, unwrap } from "@/lib/api/client";
import { formatMoney } from "@/lib/format";
import { CHANNEL, SERVICE_MODE } from "@/lib/labels";
import { cn } from "@/lib/utils";

type Preset = "today" | "7d" | "30d" | "custom";
const PRESETS: { id: Preset; label: string }[] = [
  { id: "today", label: "Aujourd'hui" },
  { id: "7d", label: "7 jours" },
  { id: "30d", label: "30 jours" },
  { id: "custom", label: "Personnalisé" },
];

export default function StatsPage() {
  const { rid } = useParams<{ rid: string }>();
  const { data: restaurant } = useRestaurant(rid);
  const currency = restaurant?.currency ?? "EUR";
  const today = localIsoDate();

  const [preset, setPreset] = useState<Preset>("7d");
  const [customFrom, setCustomFrom] = useState(addDays(today, -6));
  const [customTo, setCustomTo] = useState(today);

  const [from, to] =
    preset === "today"
      ? [today, today]
      : preset === "7d"
        ? [addDays(today, -6), today]
        : preset === "30d"
          ? [addDays(today, -29), today]
          : [customFrom, customTo];
  const rangeError =
    preset === "custom" && (!from || !to || from > to)
      ? "La date de début doit précéder la date de fin"
      : null;

  const stats = useQuery({
    queryKey: ["stats", rid, from, to],
    queryFn: () =>
      unwrap(
        api.GET("/api/restaurants/{restaurant_id}/stats", {
          params: { path: { restaurant_id: rid }, query: { from, to } },
        }),
      ),
    enabled: !rangeError,
    placeholderData: keepPreviousData,
  });
  const s = stats.data;

  return (
    <>
      <PageHeader title="Statistiques" description="Chiffre d'affaires TTC des commandes payées, hors annulations." />

      <Card className="mb-6 gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Période">
          <CalendarRange className="mr-1 hidden size-4 text-muted-foreground sm:block" aria-hidden />
          {PRESETS.map((p) => (
            <Button
              key={p.id}
              size="sm"
              variant={preset === p.id ? "default" : "outline"}
              aria-pressed={preset === p.id}
              onClick={() => setPreset(p.id)}
            >
              {p.label}
            </Button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="st-from">Du</Label>
              <Input id="st-from" type="date" max={today} value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="st-to">Au</Label>
              <Input id="st-to" type="date" max={today} value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </div>
            {rangeError && <p className="text-sm text-destructive">{rangeError}</p>}
          </div>
        )}
        {!rangeError && (
          <p className="text-xs text-muted-foreground">
            {from === to ? `Le ${formatIsoDay(from, true)}` : `Du ${formatIsoDay(from, true)} au ${formatIsoDay(to, true)}`}
          </p>
        )}
      </Card>

      {stats.isError && !rangeError ? (
        <Card className="items-center p-8 text-center">
          <p className="text-sm text-muted-foreground">{errorMessage(stats.error)}</p>
          <Button variant="outline" onClick={() => stats.refetch()}>
            Réessayer
          </Button>
        </Card>
      ) : !s ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className={cn("space-y-6", stats.isPlaceholderData && "opacity-60 transition-opacity")}>
          <section aria-label="Indicateurs clés" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <KpiCard icon={Receipt} tone="blue" label="Commandes" value={s.orders} hint="Hors annulations" />
            <KpiCard
              icon={Wallet}
              tone="green"
              label="Chiffre d'affaires"
              value={formatMoney(s.revenue, currency)}
              hint={`dont TVA ${formatMoney(s.tax, currency)}`}
            />
            <KpiCard icon={ShoppingBag} tone="violet" label="Panier moyen" value={formatMoney(s.average_ticket, currency)} />
            <KpiCard icon={Ban} tone="red" label="Annulées" value={s.cancelled} />
            <KpiCard
              icon={Timer}
              tone="amber"
              label="Préparation moyenne"
              value={s.avg_preparation_minutes != null ? `${Math.round(s.avg_preparation_minutes)} min` : "—"}
            />
            <KpiCard icon={QrCode} tone="orange" label="Scans du QR Code" value={s.qr_scans_total} />
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex items-center gap-3">
                <IconChip icon={BarChart3} tone="green" className="size-9" />
                <div className="min-w-0">
                  <CardTitle>Chiffre d&apos;affaires par jour</CardTitle>
                  <CardDescription className="mt-1">Commandes payées</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <RevenueByDayChart buckets={s.by_day} from={s.date_from} to={s.date_to} currency={currency} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex items-center gap-3">
                <IconChip icon={Clock} tone="teal" className="size-9" />
                <div className="min-w-0">
                  <CardTitle>Commandes par heure</CardTitle>
                  <CardDescription className="mt-1">Cumul sur la période</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {s.by_hour.length ? (
                  <OrdersByHourChart buckets={s.by_hour} currency={currency} />
                ) : (
                  <p className="text-sm text-muted-foreground">Aucune commande sur la période.</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex items-center gap-3">
                <IconChip icon={QrCode} tone="blue" className="size-9" />
                <div className="min-w-0">
                  <CardTitle>Par canal</CardTitle>
                  
                </div>
              </CardHeader>
              <CardContent>
                <BreakdownBars buckets={s.by_channel} labels={CHANNEL} currency={currency} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex items-center gap-3">
                <IconChip icon={Store} tone="violet" className="size-9" />
                <div className="min-w-0">
                  <CardTitle>Par mode de service</CardTitle>
                  
                </div>
              </CardHeader>
              <CardContent>
                <BreakdownBars buckets={s.by_service_mode} labels={SERVICE_MODE} currency={currency} />
              </CardContent>
            </Card>
          </div>

          <Card className="gap-0 pb-0">
            <CardHeader className="flex items-center gap-3 pb-4">
              <IconChip icon={Trophy} tone="amber" className="size-9" />
              <CardTitle>Produits les plus vendus</CardTitle>
            </CardHeader>
            {s.top_products.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">Aucune vente sur la période.</p>
            ) : (
              <div className="border-t">
                <div className="hidden grid-cols-[2.5rem_minmax(0,1fr)_6rem_9rem] gap-3 bg-muted/40 px-6 py-2.5 text-xs font-medium text-muted-foreground sm:grid">
                  <span>#</span>
                  <span>Produit</span>
                  <span className="text-right">Quantité</span>
                  <span className="text-right">Chiffre d&apos;affaires</span>
                </div>
                <ol className="divide-y">
                  {s.top_products.map((p, i) => (
                    <li
                      key={p.name}
                      className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-3 sm:grid-cols-[2.5rem_minmax(0,1fr)_6rem_9rem] sm:px-6"
                    >
                      <span
                        className={cn(
                          "flex size-7 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
                          i === 0 ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200" : "bg-muted text-muted-foreground",
                        )}
                      >
                        {i + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{p.name}</span>
                        <span className="block text-xs text-muted-foreground tabular-nums sm:hidden">
                          {p.quantity} vendu{p.quantity > 1 ? "s" : ""}
                        </span>
                      </span>
                      <span className="hidden text-right tabular-nums sm:block">{p.quantity}</span>
                      <span className="text-right font-medium tabular-nums">{formatMoney(p.revenue, currency)}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
