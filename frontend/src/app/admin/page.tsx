"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Banknote, Inbox, QrCode, ReceiptText, ShoppingBag, Store, Users } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/shared/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api, errorMessage, unwrap } from "@/lib/api/client";
import { formatMoney } from "@/lib/format";

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
  const revenue = Object.entries(s?.revenue_30d_by_currency ?? {}).sort(([a], [b]) => a.localeCompare(b));

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
          <Card className="rounded-2xl">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Chiffre d&apos;affaires TTC (30 jours)</CardTitle>
              <Banknote className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {revenue.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun encaissement sur la période.</p>
              ) : (
                <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {revenue.map(([currency, amount]) => (
                    <div key={currency} className="rounded-lg border p-4">
                      <dt className="text-xs font-medium text-muted-foreground">{currency}</dt>
                      <dd className="tabular text-2xl font-bold">{formatMoney(amount, currency)}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                Les devises ne sont pas converties : chaque montant est présenté dans sa devise d&apos;origine.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
