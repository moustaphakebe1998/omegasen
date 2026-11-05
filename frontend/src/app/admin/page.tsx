"use client";

import { useQuery } from "@tanstack/react-query";
import { Banknote, QrCode, ReceiptText, ShoppingBag, Store, Users } from "lucide-react";

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
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="gap-2">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="size-4 text-muted-foreground" />
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Kpi
              label="Restaurants"
              value={nf.format(s.restaurants)}
              hint={`${nf.format(s.active_restaurants)} actif(s)`}
              icon={Store}
            />
            <Kpi label="Utilisateurs" value={nf.format(s.users)} icon={Users} />
            <Kpi label="Commandes aujourd'hui" value={nf.format(s.orders_today)} icon={ShoppingBag} />
            <Kpi label="Commandes (30 jours)" value={nf.format(s.orders_30d)} icon={ReceiptText} />
            <Kpi label="Scans de QR Code (total)" value={nf.format(s.qr_scans_total)} icon={QrCode} />
          </div>
          <Card>
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
