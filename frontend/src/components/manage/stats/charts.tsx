"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { type Schemas } from "@/lib/api/client";
import { CURRENCY_EXPONENT, formatMoney } from "@/lib/format";

import { addDays, formatIsoDay } from "../layout/hooks";

type Bucket = Schemas["Bucket"];

/** Graduation compacte de l'axe, sans symbole monétaire pour rester lisible (affichage uniquement). */
function compactMoney(amount: number, currency: string): string {
  const exp = CURRENCY_EXPONENT[currency] ?? 2;
  return new Intl.NumberFormat("fr-FR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount / 10 ** exp);
}

type TipPayload = { payload: Bucket & { label: string } };

function ChartTooltip({
  active,
  payload,
  currency,
}: {
  active?: boolean;
  payload?: TipPayload[];
  currency: string;
}) {
  if (!active || !payload?.length) return null;
  const b = payload[0].payload;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="mb-1 font-medium">{b.label}</p>
      <p>
        Chiffre d&apos;affaires : <strong className="tabular-nums">{formatMoney(b.revenue, currency)}</strong>
      </p>
      <p>
        Commandes : <strong className="tabular-nums">{b.orders}</strong>
      </p>
    </div>
  );
}

const axisProps = {
  stroke: "var(--muted-foreground)",
  fontSize: 12,
  tickLine: false,
  axisLine: false,
} as const;

/** Chiffre d'affaires par jour (jours sans commande inclus à 0). */
export function RevenueByDayChart({
  buckets,
  from,
  to,
  currency,
}: {
  buckets: Bucket[];
  from: string;
  to: string;
  currency: string;
}) {
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  const data: (Bucket & { label: string })[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const b = byKey.get(d);
    data.push({ key: d, orders: b?.orders ?? 0, revenue: b?.revenue ?? 0, label: formatIsoDay(d, true) });
  }
  return (
    <div className="h-64 w-full" role="img" aria-label="Graphique du chiffre d'affaires par jour">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: -4, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="key"
            {...axisProps}
            tickFormatter={(k: string) => formatIsoDay(k)}
            minTickGap={16}
          />
          <YAxis {...axisProps} width={48} tickFormatter={(v: number) => compactMoney(v, currency)} />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            content={(p) => <ChartTooltip {...(p as object)} currency={currency} />}
          />
          <Bar dataKey="revenue" name="Chiffre d'affaires" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={40} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Commandes par heure (plage continue entre la première et la dernière heure active). */
export function OrdersByHourChart({ buckets, currency }: { buckets: Bucket[]; currency: string }) {
  const hours = buckets.map((b) => parseInt(b.key, 10)).filter((h) => !Number.isNaN(h));
  const byHour = new Map(buckets.map((b) => [parseInt(b.key, 10), b]));
  const min = hours.length ? Math.min(...hours) : 0;
  const max = hours.length ? Math.max(...hours) : 23;
  const data: (Bucket & { label: string })[] = [];
  for (let h = min; h <= max; h++) {
    const b = byHour.get(h);
    const key = `${String(h).padStart(2, "0")}h`;
    data.push({ key, orders: b?.orders ?? 0, revenue: b?.revenue ?? 0, label: `${key} – ${String(h + 1).padStart(2, "0")}h` });
  }
  return (
    <div className="h-64 w-full" role="img" aria-label="Graphique du nombre de commandes par heure">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: -4, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="key" {...axisProps} minTickGap={8} />
          <YAxis {...axisProps} width={32} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            content={(p) => <ChartTooltip {...(p as object)} currency={currency} />}
          />
          <Bar dataKey="orders" name="Commandes" fill="var(--chart-2)" radius={[4, 4, 0, 0]} maxBarSize={32} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Répartition en barres horizontales HTML (lisible à 360 px, sans légende nécessaire). */
export function BreakdownBars({
  buckets,
  labels,
  currency,
}: {
  buckets: Bucket[];
  labels: Record<string, string>;
  currency: string;
}) {
  const total = buckets.reduce((s, b) => s + b.orders, 0);
  if (!buckets.length) return <p className="text-sm text-muted-foreground">Aucune donnée sur la période.</p>;
  const sorted = [...buckets].sort((a, b) => b.orders - a.orders);
  return (
    <ul className="space-y-3">
      {sorted.map((b) => {
        const pct = total ? Math.round((b.orders / total) * 100) : 0;
        return (
          <li key={b.key}>
            <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
              <span className="font-medium">{labels[b.key] ?? b.key}</span>
              <span className="text-xs text-muted-foreground tabular-nums sm:text-sm">
                {b.orders} cmd · {formatMoney(b.revenue, currency)} · {pct} %
              </span>
            </div>
            <div
              className="h-2.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${labels[b.key] ?? b.key} : ${pct} % des commandes`}
            >
              <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
