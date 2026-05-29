// src/components/admin/dashboard-client.tsx

"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  TrendingUp, TrendingDown, Building2, Users,
  ShoppingBag, Clock, XCircle, BarChart3, LogOut
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, BarChart, Bar, Cell
} from "recharts";
import type { AuthUser } from "@/types";

interface Props {
  user: AuthUser;
  restaurants: { id: string; name: string; isActive: boolean }[];
  userCount: number;
  orderCount24h: number;
}

type Period = "7d" | "30d" | "90d";

export function AdminDashboardClient({ user, restaurants, userCount, orderCount24h }: Props) {
  const [period, setPeriod] = useState<Period>("7d");
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics(period);
  }, [period]);

  async function fetchAnalytics(p: Period) {
    setLoading(true);
    const days = p === "7d" ? 7 : p === "30d" ? 30 : 90;
    const from = new Date(Date.now() - days * 86400_000).toISOString();
    const to = new Date().toISOString();
    const res = await fetch(`/api/analytics?from=${from}&to=${to}&granularity=day`);
    const json = await res.json();
    if (json.success) setAnalytics(json.data);
    setLoading(false);
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const kpis = analytics?.kpis;

  return (
    <div className="min-h-screen bg-[#F4F4F5]">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-60 bg-white border-r border-gray-100 flex flex-col z-10">
        <div className="px-5 py-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-500 flex items-center justify-center shadow-sm">
              <span className="text-white font-bold text-base">O</span>
            </div>
            <div>
              <p className="font-bold text-gray-900 text-sm">Omegasen</p>
              <p className="text-xs text-gray-400">Admin / CEO</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {[
            { icon: BarChart3, label: "Tableau de bord", active: true },
            { icon: Building2, label: "Restaurants" },
            { icon: Users, label: "Utilisateurs" },
            { icon: ShoppingBag, label: "Commandes" },
          ].map(({ icon: Icon, label, active }) => (
            <button
              key={label}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                active
                  ? "bg-orange-50 text-orange-600"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <Icon size={17} />
              {label}
            </button>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-gray-100">
          <div className="px-3 py-2 mb-2">
            <p className="text-sm font-medium text-gray-900">{user.firstName} {user.lastName}</p>
            <p className="text-xs text-gray-400">{user.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            <LogOut size={17} />
            Déconnexion
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="ml-60 p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
              Bonjour, {user.firstName} 👋
            </h1>
            <p className="text-gray-500 text-sm mt-1">Vue d'ensemble multi-restaurants</p>
          </div>
          {/* Filtre période */}
          <div className="flex gap-1.5 bg-white rounded-xl border border-gray-200 p-1">
            {(["7d", "30d", "90d"] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  period === p
                    ? "bg-gray-900 text-white shadow-sm"
                    : "text-gray-500 hover:text-gray-900"
                }`}
              >
                {p === "7d" ? "7 jours" : p === "30d" ? "30 jours" : "90 jours"}
              </button>
            ))}
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <KPICard
            title="Chiffre d'affaires"
            value={kpis ? formatCurrency(kpis.revenue) : "—"}
            change={kpis?.revenueChange}
            icon={TrendingUp}
            color="orange"
            loading={loading}
          />
          <KPICard
            title="Commandes"
            value={kpis?.orderCount.toString() ?? "—"}
            change={kpis?.orderCountChange}
            subtitle={`${orderCount24h} aujourd'hui`}
            icon={ShoppingBag}
            color="blue"
            loading={loading}
          />
          <KPICard
            title="Panier moyen"
            value={kpis ? formatCurrency(kpis.averageBasket) : "—"}
            icon={BarChart3}
            color="purple"
            loading={loading}
          />
          <KPICard
            title="Taux annulation"
            value={kpis ? `${kpis.cancellationRate}%` : "—"}
            subtitle={`Moy. prépa: ${kpis?.avgPrepTime ?? "—"} min`}
            icon={XCircle}
            color="red"
            loading={loading}
            invertGoodBad
          />
        </div>

        {/* Graphique + Top produits */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="col-span-2 bg-white rounded-2xl p-6 border border-gray-100">
            <h2 className="font-bold text-gray-900 mb-5">Évolution du CA</h2>
            {loading ? (
              <div className="h-56 bg-gray-100 rounded-xl animate-pulse" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={analytics?.revenueTimeline ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F4F4F5" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "#9CA3AF" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#9CA3AF" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}k€`}
                  />
                  <Tooltip
                    formatter={(v: number) => [formatCurrency(v), "CA"]}
                    contentStyle={{
                      border: "1px solid #E5E7EB",
                      borderRadius: "12px",
                      fontSize: "12px",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke="#F25314"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 5, fill: "#F25314" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="bg-white rounded-2xl p-6 border border-gray-100">
            <h2 className="font-bold text-gray-900 mb-5">Top produits</h2>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {(analytics?.topProducts ?? []).slice(0, 5).map((p, i) => (
                  <div key={p.productId} className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-xs font-bold flex items-center justify-center shrink-0">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{p.productName}</p>
                      <p className="text-xs text-gray-400">{p.totalSold} vendus</p>
                    </div>
                    <span className="text-sm font-semibold text-gray-700 shrink-0">
                      {formatCurrency(p.revenue)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Performance restaurants */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100">
          <h2 className="font-bold text-gray-900 mb-5">Performance par restaurant</h2>
          {loading || !analytics?.restaurantStats ? (
            <div className="h-40 bg-gray-100 rounded-xl animate-pulse" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400 text-xs uppercase tracking-wider border-b border-gray-100">
                    <th className="pb-3 font-medium">Restaurant</th>
                    <th className="pb-3 font-medium text-right">CA</th>
                    <th className="pb-3 font-medium text-right">Commandes</th>
                    <th className="pb-3 font-medium text-right">Panier moy.</th>
                    <th className="pb-3 font-medium text-right">Annulations</th>
                    <th className="pb-3 font-medium text-right">Moy. prépa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {analytics.restaurantStats.map((r) => (
                    <tr key={r.restaurantId} className="hover:bg-gray-50/50">
                      <td className="py-3 font-medium text-gray-900">{r.name}</td>
                      <td className="py-3 text-right font-semibold text-gray-700">
                        {formatCurrency(r.revenue)}
                      </td>
                      <td className="py-3 text-right text-gray-600">{r.orderCount}</td>
                      <td className="py-3 text-right text-gray-600">
                        {r.orderCount > 0 ? formatCurrency(r.revenue / r.orderCount) : "—"}
                      </td>
                      <td className="py-3 text-right">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.cancellationRate > 10 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                          {r.cancellationRate}%
                        </span>
                      </td>
                      <td className="py-3 text-right text-gray-600">
                        {r.avgPrepTime ? `${r.avgPrepTime} min` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function KPICard({
  title,
  value,
  change,
  subtitle,
  icon: Icon,
  color,
  loading,
  invertGoodBad = false,
}: {
  title: string;
  value: string;
  change?: number;
  subtitle?: string;
  icon: React.ElementType;
  color: "orange" | "blue" | "purple" | "red";
  loading?: boolean;
  invertGoodBad?: boolean;
}) {
  const colorMap = {
    orange: "bg-orange-100 text-orange-600",
    blue: "bg-blue-100 text-blue-600",
    purple: "bg-purple-100 text-purple-600",
    red: "bg-red-100 text-red-600",
  };

  const isPositive = (change ?? 0) > 0;
  const goodChange = invertGoodBad ? !isPositive : isPositive;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl p-5 border border-gray-100"
    >
      <div className="flex items-center justify-between mb-4">
        <p className="text-gray-500 text-sm font-medium">{title}</p>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${colorMap[color]}`}>
          <Icon size={17} />
        </div>
      </div>
      {loading ? (
        <div className="h-8 w-32 bg-gray-100 rounded-lg animate-pulse" />
      ) : (
        <p className="text-2xl font-bold text-gray-900 tabular-nums tracking-tight">{value}</p>
      )}
      <div className="flex items-center justify-between mt-2">
        {change !== undefined && !loading ? (
          <div className={`flex items-center gap-1 text-xs font-medium ${goodChange ? "text-green-600" : "text-red-600"}`}>
            {goodChange ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {Math.abs(change)}% vs période préc.
          </div>
        ) : (
          <div />
        )}
        {subtitle && (
          <span className="text-xs text-gray-400">{subtitle}</span>
        )}
      </div>
    </motion.div>
  );
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
}

interface AnalyticsData {
  kpis: {
    revenue: number;
    revenueChange: number;
    orderCount: number;
    orderCountChange: number;
    averageBasket: number;
    cancellationRate: number;
    avgPrepTime: number;
  };
  revenueTimeline: { date: string; revenue: number; orders: number }[];
  topProducts: { productId: string; productName: string; totalSold: number; revenue: number }[];
  restaurantStats: {
    restaurantId: string;
    name: string;
    revenue: number;
    orderCount: number;
    cancellationRate: number;
    avgPrepTime: number;
  }[] | null;
}
