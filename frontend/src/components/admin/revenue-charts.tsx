"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { CURRENCY_EXPONENT, formatMoney } from "@/lib/format";

export type DayPoint = { day: string; revenue: number; orders: number };

/** "2026-11-05" + n jours, sans dérive de fuseau horaire. */
export function addDaysIso(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayLabel(iso: string, long = false): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: long ? "long" : "short",
    ...(long ? { weekday: "long", year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

/** Série continue sur la période (jours sans encaissement à 0). */
export function fillDays(points: DayPoint[], days: number): DayPoint[] {
  const by = new Map(points.map((p) => [p.day, p]));
  const end = todayIso();
  const out: DayPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = addDaysIso(end, -i);
    const p = by.get(d);
    out.push({ day: d, revenue: p?.revenue ?? 0, orders: p?.orders ?? 0 });
  }
  return out;
}

function compactMoney(amount: number, currency: string): string {
  const exp = CURRENCY_EXPONENT[currency] ?? 2;
  return new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 }).format(amount / 10 ** exp);
}

function DayTooltip({
  active,
  payload,
  currency,
}: {
  active?: boolean;
  payload?: { payload: DayPoint }[];
  currency: string;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="mb-1 font-medium first-letter:uppercase">{dayLabel(p.day, true)}</p>
      <p>
        Chiffre d&apos;affaires : <strong className="tabular-nums">{formatMoney(p.revenue, currency)}</strong>
      </p>
      <p>
        Commandes payées : <strong className="tabular-nums">{p.orders}</strong>
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

/** Chiffre d'affaires quotidien d'UNE devise (barres jusqu'à 31 jours, aire au-delà). */
export function DailyRevenueChart({ data, currency }: { data: DayPoint[]; currency: string }) {
  const bars = data.length <= 31;
  const common = {
    data,
    margin: { top: 8, right: 4, left: -4, bottom: 0 },
  };
  const axes = (
    <>
      <CartesianGrid vertical={false} stroke="var(--border)" />
      <XAxis dataKey="day" {...axisProps} tickFormatter={(d: string) => dayLabel(d)} minTickGap={20} />
      <YAxis {...axisProps} width={48} tickFormatter={(v: number) => compactMoney(v, currency)} />
    </>
  );
  return (
    <div
      className="h-60 w-full sm:h-64"
      role="img"
      aria-label={`Graphique du chiffre d'affaires quotidien en ${currency}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        {bars ? (
          <BarChart {...common}>
            {axes}
            <Tooltip
              cursor={{ fill: "var(--muted)" }}
              content={(p) => <DayTooltip {...(p as object)} currency={currency} />}
            />
            <Bar
              dataKey="revenue"
              fill="var(--primary)"
              radius={[4, 4, 0, 0]}
              maxBarSize={32}
              isAnimationActive={false}
            />
          </BarChart>
        ) : (
          <AreaChart {...common}>
            <defs>
              <linearGradient id={`rev-fill-${currency}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.25} />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            {axes}
            <Tooltip
              cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
              content={(p) => <DayTooltip {...(p as object)} currency={currency} />}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="var(--primary)"
              strokeWidth={2}
              fill={`url(#rev-fill-${currency})`}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

/** Mini-courbe (vue d'ensemble), sans axes. */
export function RevenueSparkline({ data, currency }: { data: DayPoint[]; currency: string }) {
  return (
    <div className="h-16 w-full" role="img" aria-label={`Tendance du chiffre d'affaires en ${currency} sur 30 jours`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`spark-${currency}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.25} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Tooltip content={(p) => <DayTooltip {...(p as object)} currency={currency} />} />
          <Area
            type="monotone"
            dataKey="revenue"
            stroke="var(--primary)"
            strokeWidth={2}
            fill={`url(#spark-${currency})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
