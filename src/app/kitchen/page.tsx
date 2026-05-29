// src/app/kitchen/page.tsx — Interface cuisine temps réel

"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, CheckCircle2, ChevronRight, RotateCcw, AlertTriangle, Wifi, WifiOff } from "lucide-react";
import { useKitchenSSE } from "@/hooks/use-sse";
import type { KitchenOrder } from "@/types";

const STATUS_LABELS: Record<string, string> = {
  CONFIRMED: "À préparer",
  PREPARING: "En cours",
  READY: "Prêt",
};

const STATUS_COLORS: Record<string, string> = {
  CONFIRMED: "bg-blue-600",
  PREPARING: "bg-orange-500",
  READY: "bg-green-600",
};

const STATUS_TEXT_COLORS: Record<string, string> = {
  CONFIRMED: "text-blue-300",
  PREPARING: "text-orange-300",
  READY: "text-green-300",
};

export default function KitchenPage() {
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [restaurantId, setRestaurantId] = useState<string>("");

  // Charger les infos restaurant depuis le cookie/session
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setRestaurantId(d.data.restaurants[0] ?? "");
        }
      });
  }, []);

  const fetchOrders = useCallback(async () => {
    if (!restaurantId) return;
    try {
      const res = await fetch(`/api/kitchen/orders?restaurantId=${restaurantId}`);
      const json = await res.json();
      if (json.success) setOrders(json.data);
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    fetchOrders();
    // Polling de secours toutes les 30s
    const interval = setInterval(fetchOrders, 30_000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  useKitchenSSE(restaurantId, fetchOrders);

  async function updateStatus(
    orderId: string,
    status: string,
    reason?: string
  ) {
    const res = await fetch(`/api/orders/${orderId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, reason }),
    });
    if (res.ok) fetchOrders();
  }

  const confirmed = orders.filter((o) => o.status === "CONFIRMED");
  const preparing = orders.filter((o) => o.status === "PREPARING");
  const ready = orders.filter((o) => o.status === "READY");

  if (loading) {
    return (
      <div className="kitchen-interface flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-2 border-orange-500 border-t-transparent animate-spin mx-auto mb-4" />
          <p className="text-gray-400 text-lg">Chargement…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="kitchen-interface min-h-screen">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-[#2A2A2A]">
        <div className="flex items-center gap-4">
          <div className="w-9 h-9 rounded-xl bg-orange-500 flex items-center justify-center">
            <span className="text-white font-bold text-lg">O</span>
          </div>
          <div>
            <h1 className="text-white font-bold text-xl tracking-tight">Cuisine</h1>
            <p className="text-gray-400 text-xs">{new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <LiveClock />
          <div className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full ${connected ? "bg-green-900/50 text-green-400" : "bg-red-900/50 text-red-400"}`}>
            {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
            {connected ? "Connecté" : "Reconnexion…"}
          </div>
        </div>
      </header>

      {/* Stats bar */}
      <div className="flex gap-px bg-[#2A2A2A] border-b border-[#2A2A2A]">
        {[
          { label: "À préparer", count: confirmed.length, color: "bg-blue-500/10 text-blue-400" },
          { label: "En cours", count: preparing.length, color: "bg-orange-500/10 text-orange-400" },
          { label: "Prêt", count: ready.length, color: "bg-green-500/10 text-green-400" },
        ].map(({ label, count, color }) => (
          <div key={label} className={`flex-1 flex items-center justify-center gap-2 py-3 ${color}`}>
            <span className="text-2xl font-bold tabular-nums">{count}</span>
            <span className="text-sm opacity-80">{label}</span>
          </div>
        ))}
      </div>

      {/* Colonnes */}
      <div className="grid grid-cols-3 gap-0 divide-x divide-[#2A2A2A] h-[calc(100vh-120px)]">
        <Column
          title="À préparer"
          status="CONFIRMED"
          orders={confirmed}
          primaryAction={{ label: "Commencer", nextStatus: "PREPARING" }}
          onAction={updateStatus}
        />
        <Column
          title="En préparation"
          status="PREPARING"
          orders={preparing}
          primaryAction={{ label: "Marquer prêt", nextStatus: "READY" }}
          rollbackAction={{ label: "Retour attente", nextStatus: "CONFIRMED" }}
          onAction={updateStatus}
        />
        <Column
          title="Prêt à servir"
          status="READY"
          orders={ready}
          primaryAction={{ label: "Servir", nextStatus: "SERVED" }}
          rollbackAction={{ label: "Retour en cours", nextStatus: "PREPARING" }}
          onAction={updateStatus}
        />
      </div>
    </div>
  );
}

function Column({
  title,
  status,
  orders,
  primaryAction,
  rollbackAction,
  onAction,
}: {
  title: string;
  status: string;
  orders: KitchenOrder[];
  primaryAction: { label: string; nextStatus: string };
  rollbackAction?: { label: string; nextStatus: string };
  onAction: (id: string, status: string) => void;
}) {
  return (
    <div className="flex flex-col overflow-hidden">
      <div className={`px-4 py-3 ${STATUS_COLORS[status]}`}>
        <h2 className="text-white font-bold text-sm uppercase tracking-widest">{title}</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <AnimatePresence mode="popLayout">
          {orders.length === 0 ? (
            <div className="text-center py-16 text-gray-600">
              <CheckCircle2 size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Aucune commande</p>
            </div>
          ) : (
            orders.map((order) => (
              <KitchenCard
                key={order.id}
                order={order}
                primaryAction={primaryAction}
                rollbackAction={rollbackAction}
                onAction={onAction}
              />
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function KitchenCard({
  order,
  primaryAction,
  rollbackAction,
  onAction,
}: {
  order: KitchenOrder;
  primaryAction: { label: string; nextStatus: string };
  rollbackAction?: { label: string; nextStatus: string };
  onAction: (id: string, status: string) => void;
}) {
  const [loading, setLoading] = useState(false);

  async function handle(nextStatus: string) {
    setLoading(true);
    try {
      await onAction(order.id, nextStatus);
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`kitchen-card p-4 ${order.isUrgent ? "kitchen-card-urgent" : ""}`}
    >
      {/* En-tête */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-white font-bold text-xl tabular-nums">#{order.orderNumber.slice(-3)}</span>
          {order.isUrgent && (
            <span className="flex items-center gap-1 text-red-400 text-xs font-medium">
              <AlertTriangle size={12} />
              Urgent
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-gray-400 text-sm">
          <Clock size={13} />
          <span className="tabular-nums">{order.elapsedMinutes}min</span>
        </div>
      </div>

      {/* Infos */}
      <div className="flex items-center gap-2 mb-3 text-xs text-gray-400">
        {order.tableNumber && (
          <span className="bg-gray-800 px-2 py-0.5 rounded-md">
            Table {order.tableNumber}
          </span>
        )}
        {order.isTakeaway && (
          <span className="bg-blue-900/40 text-blue-400 px-2 py-0.5 rounded-md">
            À emporter
          </span>
        )}
        {order.customerName && (
          <span className="text-gray-300 truncate">{order.customerName}</span>
        )}
      </div>

      {/* Articles */}
      <div className="space-y-2 mb-4">
        {order.items.map((item) => (
          <div key={item.id} className="flex items-start gap-2.5">
            <span className="shrink-0 w-6 h-6 rounded-md bg-gray-700 flex items-center justify-center text-white text-xs font-bold tabular-nums">
              {item.quantity}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium leading-tight truncate">
                {item.productName}
              </p>
              {item.options.length > 0 && (
                <p className="text-gray-400 text-xs mt-0.5 truncate">
                  {item.options.join(" · ")}
                </p>
              )}
              {item.notes && (
                <p className="text-amber-400 text-xs mt-0.5 italic">
                  ⚠ {item.notes}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2">
        <button
          onClick={() => handle(primaryAction.nextStatus)}
          disabled={loading}
          className="w-full h-11 rounded-xl bg-orange-500 hover:bg-orange-400 text-white font-bold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? (
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>{primaryAction.label} <ChevronRight size={16} /></>
          )}
        </button>
        {rollbackAction && (
          <button
            onClick={() => handle(rollbackAction.nextStatus)}
            disabled={loading}
            className="w-full h-9 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium text-xs transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <RotateCcw size={12} />
            {rollbackAction.label}
          </button>
        )}
      </div>
    </motion.div>
  );
}

function LiveClock() {
  const [time, setTime] = useState(
    new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(
        new Date().toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
        })
      );
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <span className="text-white font-mono font-bold text-2xl tabular-nums tracking-tight">
      {time}
    </span>
  );
}
