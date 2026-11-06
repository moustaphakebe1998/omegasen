"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Inbox, QrCode, ReceiptText, ShoppingBag, Store, TrendingUp, Users } from "lucide-react";
import Link from "next/link";

import { fillDays, RevenueSparkline } from "@/components/admin/revenue-charts";
import { RESTAURANT_STATUS, RESTAURANT_STATUSES } from "@/components/admin/status";
import { PageHeader } from "@/components/shared/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api, errorMessage, unwrap } from "@/lib/api/client";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

const nf = new Intl.NumberFormat("fr-FR");

function Kpi({
  label,
  value,
  hint,
  icon: Icon,
  tone = "bg-primary/10 text-primary",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: string;
}) {
  return (
    <Card className="gap-2 rounded-2xl">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${tone}`}>
          <Icon className="size-4" />
        </span>
      </CardHeader>
      <CardContent>
        <div className="tabular text-2xl font-bold">{value}</div>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export default function AdminOverviewPage() {
  const stats = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => unwrap(api.GET("/api/admin/stats")),
  });
  const s = stats.data;

  return (
    <>
      <PageHeader title="Vue d'ensemble" description="Indicateurs de la plateforme OmegaSen." />
      {stats.isError ? (
        <p className="text-destructive">{errorMessage(stats.error)}</p>
      ) : !s ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {s.pending_requests > 0 && (
            <Link
              href="/admin/requests"
              className="flex items-center gap-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 transition-colors hover:bg-amber-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:border-amber-800 dark:bg-amber-950/40"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white">
                <Inbox className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">
                  {s.pending_requests} demande
                  {s.pending_requests > 1 ? "s" : ""} d&apos;ouverture en attente
                </span>
                <span className="block text-sm text-muted-foreground">
                  Accepter ou refuser les nouveaux restaurants
                </span>
              </span>
              <ArrowRight className="size-5 shrink-0" aria-hidden />
            </Link>
          )}
          <section aria-labelledby="by-status" className="rounded-2xl border bg-card p-4 shadow-xs sm:p-5">
            <h2 id="by-status" className="mb-3 text-sm font-medium text-muted-foreground">
              Restaurants par statut
            </h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {RESTAURANT_STATUSES.map((st) => (
                <li key={st}>
                  <Link
                    href={`/admin/restaurants?status=${st}`}
                    className="flex items-center gap-3 rounded-xl border p-3 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <span className={cn("size-2.5 shrink-0 rounded-full", RESTAURANT_STATUS[st].dot)} aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-sm">{RESTAURANT_STATUS[st].label}</span>
                    <span className="tabular text-lg font-bold">{nf.format(s.restaurants_by_status[st] ?? 0)}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              Utilisateurs : {nf.format(s.users_active)} actifs · {nf.format(s.users_disabled)} bloqués ·{" "}
              {nf.format(s.users_pending)} en attente d&apos;activation · {nf.format(s.superadmins)} super admin(s)
            </p>
          </section>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Kpi
              label="Restaurants"
              value={nf.format(s.restaurants)}
              hint={`${nf.format(s.active_restaurants)} actif(s)`}
              icon={Store}
              tone="bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-300"
            />
            <Kpi
              label="Utilisateurs"
              value={nf.format(s.users)}
              hint={`${nf.format(s.users_active)} actif(s) · ${nf.format(s.users_disabled)} bloqué(s)`}
              icon={Users}
              tone="bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-300"
            />
            <Kpi
              label="Commandes aujourd'hui"
              value={nf.format(s.orders_today)}
              icon={ShoppingBag}
              tone="bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-300"
            />
            <Kpi
              label="Commandes (30 jours)"
              value={nf.format(s.orders_30d)}
              icon={ReceiptText}
              tone="bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-300"
            />
            <Kpi
              label="Scans de QR Code (total)"
              value={nf.format(s.qr_scans_total)}
              icon={QrCode}
              tone="bg-teal-100 text-teal-600 dark:bg-teal-950 dark:text-teal-300"
            />
            <Kpi
              label="Demandes en attente"
              value={nf.format(s.pending_requests)}
              icon={Inbox}
              tone="bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-300"
            />
          </div>
          <RevenueSummary />
        </div>
      )}
    </>
  );
}

/** Résumé compact du chiffre d'affaires sur 30 jours (une mini-courbe par devise), vers la page dédiée. */
function RevenueSummary() {
  const report = useQuery({
    queryKey: ["admin", "revenue", 30],
    queryFn: () => unwrap(api.GET("/api/admin/revenue", { params: { query: { days: 30 } } })),
  });
  const data = report.data;
  const currencies = Object.keys(data?.totals_by_currency ?? {}).sort();
  return (
    <Card className="gap-3 rounded-2xl">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-300">
            <TrendingUp className="size-4" aria-hidden />
          </span>
          <CardTitle className="text-base">Chiffre d&apos;affaires TTC (30 jours)</CardTitle>
        </div>
        <Link
          href="/admin/revenue"
          className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          Détails <ArrowRight className="size-4" aria-hidden />
        </Link>
      </CardHeader>
      <CardContent>
        {report.isError ? (
          <p className="text-sm text-destructive">{errorMessage(report.error)}</p>
        ) : !data ? (
          <Skeleton className="h-24" />
        ) : currencies.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun encaissement sur la période.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {currencies.map((c) => (
              <div key={c} className="rounded-xl border p-4">
                <p className="text-xs font-medium text-muted-foreground">{c}</p>
                <p className="tabular truncate text-2xl font-bold">{formatMoney(data.totals_by_currency[c], c)}</p>
                <RevenueSparkline
                  currency={c}
                  data={fillDays(
                    data.series.filter((p) => p.currency === c),
                    30,
                  )}
                />
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Les devises ne sont pas converties : chaque montant est présenté dans sa devise d&apos;origine.
        </p>
      </CardContent>
    </Card>
  );
}
