"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Banknote, ChevronRight, ReceiptText, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { DailyRevenueChart, fillDays } from "@/components/admin/revenue-charts";
import { EmptyState, PageHeader } from "@/components/shared/app-shell";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, errorMessage, unwrap } from "@/lib/api/client";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

const PERIODS = [
  { days: 7, label: "7 jours" },
  { days: 30, label: "30 jours" },
  { days: 90, label: "90 jours" },
  { days: 365, label: "12 mois" },
] as const;

const nf = new Intl.NumberFormat("fr-FR");

export default function AdminRevenuePage() {
  const [days, setDays] = useState<number>(30);
  const report = useQuery({
    queryKey: ["admin", "revenue", days],
    queryFn: () => unwrap(api.GET("/api/admin/revenue", { params: { query: { days } } })),
    placeholderData: keepPreviousData,
  });

  const data = report.data;
  const currencies = Object.keys(data?.totals_by_currency ?? {}).sort();
  const ordersBy = (c: string) => data?.series.filter((p) => p.currency === c).reduce((s, p) => s + p.orders, 0) ?? 0;

  return (
    <>
      <PageHeader
        title="Chiffre d'affaires"
        description="Encaissements TTC de la plateforme (commandes payées, hors annulations). Chaque devise est présentée séparément, sans conversion."
      />

      <div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label="Période">
        {PERIODS.map((p) => (
          <button
            key={p.days}
            type="button"
            role="tab"
            aria-selected={days === p.days}
            onClick={() => setDays(p.days)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              days === p.days ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {report.isError ? (
        <p className="text-destructive">{errorMessage(report.error)}</p>
      ) : !data ? (
        <div className="space-y-4" aria-busy="true" aria-label="Chargement du chiffre d'affaires">
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-32 rounded-2xl" />
            <Skeleton className="h-32 rounded-2xl" />
          </div>
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      ) : currencies.length === 0 ? (
        <EmptyState
          icon={Banknote}
          title="Aucun encaissement sur la période"
          description="Aucune commande payée sur les restaurants de la plateforme pour cette période."
        />
      ) : (
        <div className={cn("space-y-6", report.isPlaceholderData && "opacity-60")}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {currencies.map((c) => (
              <div key={c} className="flex flex-col gap-2 rounded-2xl border bg-card p-5 shadow-xs">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-muted-foreground">Total {c}</p>
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-300">
                    <Banknote className="size-4" aria-hidden />
                  </span>
                </div>
                <p className="tabular truncate text-2xl font-bold sm:text-3xl">
                  {formatMoney(data.totals_by_currency[c], c)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {nf.format(ordersBy(c))} commande{ordersBy(c) > 1 ? "s" : ""} payée{ordersBy(c) > 1 ? "s" : ""}
                </p>
              </div>
            ))}
          </div>

          {currencies.map((c) => (
            <section key={c} className="rounded-2xl border bg-card p-4 shadow-xs sm:p-5">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <TrendingUp className="size-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <h2 className="font-semibold">Chiffre d&apos;affaires quotidien · {c}</h2>
                  <p className="text-xs text-muted-foreground">
                    {PERIODS.find((p) => p.days === days)?.label} glissants, en {c}
                  </p>
                </div>
              </div>
              <DailyRevenueChart
                currency={c}
                data={fillDays(
                  data.series.filter((p) => p.currency === c),
                  data.days,
                )}
              />
            </section>
          ))}

          <section className="space-y-3" aria-labelledby="ranking-title">
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-300">
                <ReceiptText className="size-4" aria-hidden />
              </span>
              <h2 id="ranking-title" className="font-semibold">
                Classement des restaurants
              </h2>
            </div>

            <div className="hidden overflow-hidden rounded-2xl border bg-card md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Restaurant</TableHead>
                    <TableHead>Devise</TableHead>
                    <TableHead className="text-right">Commandes</TableHead>
                    <TableHead className="text-right">Chiffre d&apos;affaires TTC</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.by_restaurant.map((r, i) => (
                    <TableRow key={`${r.restaurant_id}-${r.currency}`}>
                      <TableCell className="tabular text-muted-foreground">{i + 1}</TableCell>
                      <TableCell>
                        <Link href={`/admin/restaurants/${r.restaurant_id}`} className="font-medium hover:underline">
                          {r.restaurant_name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{r.currency}</Badge>
                      </TableCell>
                      <TableCell className="tabular text-right">{nf.format(r.orders)}</TableCell>
                      <TableCell className="tabular text-right font-semibold">
                        {formatMoney(r.revenue, r.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <ol className="space-y-2 md:hidden">
              {data.by_restaurant.map((r, i) => (
                <li key={`${r.restaurant_id}-${r.currency}`}>
                  <Link
                    href={`/admin/restaurants/${r.restaurant_id}`}
                    className="flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-xs"
                  >
                    <span className="tabular flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{r.restaurant_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {nf.format(r.orders)} commande{r.orders > 1 ? "s" : ""} · {r.currency}
                      </p>
                    </div>
                    <span className="tabular shrink-0 text-sm font-semibold">{formatMoney(r.revenue, r.currency)}</span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
    </>
  );
}
