"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";

import { addDays, formatIsoDay, localIsoDate, useRestaurant } from "@/components/manage/layout/hooks";
import { BreakdownBars, OrdersByHourChart, RevenueByDayChart } from "@/components/manage/stats/charts";
import { PageHeader } from "@/components/shared/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

function Kpi({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <Card className="gap-1 p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}

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

      <Card className="mb-6 gap-3 p-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Période">
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
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <div className={cn("space-y-6", stats.isPlaceholderData && "opacity-60 transition-opacity")}>
          <section aria-label="Indicateurs clés" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Kpi label="Commandes" value={s.orders} hint="Hors annulations" />
            <Kpi label="Chiffre d'affaires" value={formatMoney(s.revenue, currency)} hint={`dont TVA ${formatMoney(s.tax, currency)}`} />
            <Kpi label="Panier moyen" value={formatMoney(s.average_ticket, currency)} />
            <Kpi label="Annulées" value={s.cancelled} />
            <Kpi
              label="Préparation moyenne"
              value={s.avg_preparation_minutes != null ? `${Math.round(s.avg_preparation_minutes)} min` : "—"}
            />
            <Kpi label="Scans du QR Code" value={s.qr_scans_total} />
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Chiffre d&apos;affaires par jour</CardTitle>
                <CardDescription>Commandes payées</CardDescription>
              </CardHeader>
              <CardContent>
                <RevenueByDayChart buckets={s.by_day} from={s.date_from} to={s.date_to} currency={currency} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Commandes par heure</CardTitle>
                <CardDescription>Cumul sur la période</CardDescription>
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
              <CardHeader>
                <CardTitle>Par canal</CardTitle>
              </CardHeader>
              <CardContent>
                <BreakdownBars buckets={s.by_channel} labels={CHANNEL} currency={currency} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Par mode de service</CardTitle>
              </CardHeader>
              <CardContent>
                <BreakdownBars buckets={s.by_service_mode} labels={SERVICE_MODE} currency={currency} />
              </CardContent>
            </Card>
          </div>

          <Card className="gap-0 pb-0">
            <CardHeader className="pb-4">
              <CardTitle>Produits les plus vendus</CardTitle>
            </CardHeader>
            {s.top_products.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">Aucune vente sur la période.</p>
            ) : (
              <div className="border-t">
                <Table className="min-w-[420px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Produit</TableHead>
                      <TableHead className="text-right">Quantité</TableHead>
                      <TableHead className="text-right">Chiffre d&apos;affaires</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {s.top_products.map((p, i) => (
                      <TableRow key={p.name}>
                        <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.quantity}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(p.revenue, currency)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
