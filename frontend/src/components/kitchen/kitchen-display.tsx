"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, BellRing, History, Loader2, LogOut, Maximize, Minimize, PackageX, WifiOff } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useCan, useMembership } from "@/components/manage/layout/permissions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, errorMessage, unwrap } from "@/lib/api/client";
import { actionErrorMessage } from "@/lib/permissions";
import { useAuth } from "@/lib/auth";
import type { OrderStatus } from "@/lib/labels";
import { type RealtimeEvent, useRestaurantSocket } from "@/lib/realtime";
import { cn } from "@/lib/utils";

import { useFullscreen, useKitchenSound, useWakeLock } from "./device";
import { KitchenOrderCard } from "./order-card";
import {
  belongsToKitchen,
  COMPLETED_WINDOW_MIN,
  elapsedMinutes,
  type Order,
  roleTransitions,
  upsertInKitchenCaches,
  useNow,
  useTransitionRules,
} from "./orders";
import { StockSheet } from "./stock-sheet";

type Column = "NEW" | "PREPARING" | "READY" | "COMPLETED";

const COLUMNS: { status: Column; title: string; dot: string }[] = [
  { status: "NEW", title: "Nouvelles", dot: "bg-blue-500" },
  { status: "PREPARING", title: "En préparation", dot: "bg-amber-500" },
  { status: "READY", title: "Prêtes", dot: "bg-green-500" },
  { status: "COMPLETED", title: "Terminées récemment", dot: "bg-neutral-500" },
];

const GRID_COLS: Record<number, string> = {
  1: "md:grid-cols-1",
  2: "md:grid-cols-2",
  3: "md:grid-cols-3",
  4: "md:grid-cols-4",
};

const POLL_MS = 15_000;
const REMINDER_AFTER_MIN = 2;
const REMINDER_EVERY_MS = 60_000;

const chip =
  "inline-flex min-h-12 shrink-0 items-center whitespace-nowrap gap-2 rounded-full border px-4 text-base font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70";
const iconBtn =
  "inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center gap-2 rounded-xl border border-neutral-700 bg-neutral-900 px-3 text-base font-semibold whitespace-nowrap text-neutral-100 transition-colors hover:bg-neutral-800 active:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70";

export function KitchenDisplay({ rid }: { rid: string }) {
  const qc = useQueryClient();
  const { user, logout } = useAuth();
  const rules = useTransitionRules(rid);
  const now = useNow(1000);
  const sound = useKitchenSound();
  const fullscreen = useFullscreen();
  useWakeLock();

  const can = useCan(rid);
  const canStock = can("stock.manage");
  // Poste du collaborateur présélectionné (modifiable) ; ignoré s'il a été supprimé depuis.
  const membership = useMembership(rid);
  const [chosenStation, setStationId] = useState<string | null>(() => membership?.station_id ?? null);
  const [visible, setVisible] = useState<Column[]>(["NEW", "PREPARING", "READY"]);
  const [showCompleted, setShowCompleted] = useState(false);
  const [stockOpen, setStockOpen] = useState(false);
  const [busy, setBusy] = useState<Set<string>>(() => new Set());

  const restaurant = useQuery({
    queryKey: ["restaurant", rid],
    queryFn: () => unwrap(api.GET("/api/restaurants/{restaurant_id}", { params: { path: { restaurant_id: rid } } })),
  });
  const stations = useQuery({
    queryKey: ["stations", rid],
    queryFn: () =>
      unwrap(api.GET("/api/restaurants/{restaurant_id}/stations", { params: { path: { restaurant_id: rid } } })),
  });
  const stationId =
    chosenStation && stations.data && !stations.data.some((s) => s.id === chosenStation) ? null : chosenStation;

  const soundRef = useRef(sound);
  soundRef.current = sound;

  const onEvent = useCallback(
    (e: RealtimeEvent) => {
      if (e.event === "menu.updated") {
        void qc.invalidateQueries({ queryKey: ["staff-menu", rid] });
        return;
      }
      if (e.event !== "order.created" && e.event !== "order.updated") return;
      const order = e.data as Order | undefined;
      if (!order?.id) return;
      upsertInKitchenCaches(qc, rid, order);
      if (e.event === "order.created" && order.sent_to_kitchen_at && order.status === "NEW") soundRef.current.beep(2);
    },
    [qc, rid],
  );
  const onReconnect = useCallback(() => void qc.invalidateQueries({ queryKey: ["kitchen", rid] }), [qc, rid]);
  const connection = useRestaurantSocket(rid, onEvent, onReconnect);

  const ordersKey = ["kitchen", rid, stationId] as const;
  const orders = useQuery({
    queryKey: ordersKey,
    queryFn: () =>
      unwrap(
        api.GET("/api/restaurants/{restaurant_id}/orders/active", {
          params: {
            path: { restaurant_id: rid },
            query: { include_completed_minutes: COMPLETED_WINDOW_MIN, station_id: stationId ?? undefined },
          },
        }),
      ),
    refetchInterval: connection === "open" ? false : POLL_MS,
    staleTime: 0,
  });

  const transition = useMutation({
    mutationFn: ({ order, to }: { order: Order; to: OrderStatus }) =>
      unwrap(
        api.POST("/api/restaurants/{restaurant_id}/orders/{order_id}/status", {
          params: { path: { restaurant_id: rid, order_id: order.id } },
          body: { status: to },
        }),
      ),
    onMutate: async ({ order, to }) => {
      setBusy((s) => new Set(s).add(order.id));
      await qc.cancelQueries({ queryKey: ["kitchen", rid] });
      const snapshot = qc.getQueriesData<Order[]>({ queryKey: ["kitchen", rid] });
      const at = new Date().toISOString();
      const patched: Order = {
        ...order,
        status: to,
        allowed_transitions: roleTransitions(to, rules),
        preparing_at: to === "PREPARING" ? at : order.preparing_at,
        ready_at: to === "READY" ? at : to === "PREPARING" || to === "NEW" ? null : order.ready_at,
        completed_at: to === "COMPLETED" ? at : null,
      };
      upsertInKitchenCaches(qc, rid, patched);
      return { snapshot };
    },
    onError: (e, { order }, ctx) => {
      ctx?.snapshot.forEach(([key, data]) => qc.setQueryData(key, data));
      toast.error(`Commande ${order.display_number} : ${actionErrorMessage(e)}`);
    },
    onSuccess: (order) => upsertInKitchenCaches(qc, rid, order),
    onSettled: (_d, _e, { order }) =>
      setBusy((s) => {
        const next = new Set(s);
        next.delete(order.id);
        return next;
      }),
  });

  const onTransition = useCallback((order: Order, to: OrderStatus) => transition.mutate({ order, to }), [transition]);

  const visibleOrders = useMemo(
    () => (orders.data ?? []).filter((o) => belongsToKitchen(o, stationId, now)),
    [orders.data, stationId, now],
  );

  // Rappel sonore tant que des commandes nouvelles attendent depuis plus de 2 minutes.
  const waitingRef = useRef(visibleOrders);
  waitingRef.current = visibleOrders;
  useEffect(() => {
    if (!sound.active) return;
    const t = setInterval(() => {
      const stale = waitingRef.current.some(
        (o) => o.status === "NEW" && elapsedMinutes(o.sent_to_kitchen_at, Date.now()) > REMINDER_AFTER_MIN,
      );
      if (stale) soundRef.current.beep(1);
    }, REMINDER_EVERY_MS);
    return () => clearInterval(t);
  }, [sound.active]);

  const columns = COLUMNS.filter((c) => (c.status === "COMPLETED" ? showCompleted : visible.includes(c.status)));
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const o of visibleOrders) m[o.status] = (m[o.status] ?? 0) + 1;
    return m;
  }, [visibleOrders]);

  const toggleStatus = (s: Column) =>
    setVisible((prev) => (prev.includes(s) ? (prev.length > 1 ? prev.filter((x) => x !== s) : prev) : [...prev, s]));

  const lateAfter = restaurant.data?.late_after_minutes ?? 15;
  const stationName = stations.data?.find((s) => s.id === stationId)?.name;

  return (
    <div className="dark flex min-h-dvh flex-col bg-neutral-950 text-neutral-50 md:h-dvh">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-neutral-800 bg-neutral-950 px-4 py-3">
        <div className="mr-auto flex min-w-0 flex-1 items-center gap-3 sm:flex-none">
          <ConnectionDot state={connection} />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold">{restaurant.data?.name ?? "Cuisine"}</h1>
            <p className="truncate text-sm text-neutral-400">
              Écran cuisine{stationName ? ` · ${stationName}` : ""} · {user?.full_name}
            </p>
          </div>
        </div>
        <p
          className="tabular shrink-0 rounded-xl bg-neutral-900 px-3 py-1 text-2xl font-bold ring-1 ring-neutral-800 sm:ml-auto sm:text-3xl"
          aria-label="Heure"
        >
          {new Date(now).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </p>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          {sound.active ? (
            <button type="button" className={iconBtn} onClick={sound.disable} aria-label="Couper le son">
              <BellRing className="size-5 text-green-400" />
              <span className="hidden lg:inline">Son activé</span>
            </button>
          ) : sound.enabled ? (
            <button
              type="button"
              className={cn(iconBtn, "flex-1 border-amber-500 text-amber-200 sm:flex-none")}
              onClick={sound.enable}
            >
              <Bell className="size-5 animate-pulse" />
              Touchez pour activer le son
            </button>
          ) : (
            <button
              type="button"
              className={cn(iconBtn, "flex-1 border-amber-500 bg-amber-500 text-black hover:bg-amber-400 sm:flex-none")}
              onClick={sound.enable}
            >
              <BellOff className="size-5" />
              Activer le son
            </button>
          )}
          {canStock && (
            <button
              type="button"
              className={cn(iconBtn, "ml-auto sm:ml-0")}
              onClick={() => setStockOpen(true)}
              aria-label="Ruptures"
            >
              <PackageX className="size-5" />
              <span className="hidden sm:inline">Ruptures</span>
            </button>
          )}
          <button
            type="button"
            className={cn(iconBtn, !canStock && "ml-auto sm:ml-0")}
            onClick={fullscreen.toggle}
            aria-label={fullscreen.isFullscreen ? "Quitter le plein écran" : "Plein écran"}
          >
            {fullscreen.isFullscreen ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
          </button>
          <button type="button" className={iconBtn} onClick={() => void logout()} aria-label="Se déconnecter">
            <LogOut className="size-5" />
          </button>
        </div>
      </header>

      {connection !== "open" && (
        <div
          role="status"
          className={cn(
            "flex items-center gap-2 px-4 py-2 text-sm font-semibold",
            connection === "closed" ? "bg-red-600 text-white" : "bg-amber-500 text-black",
          )}
        >
          <WifiOff className="size-4" aria-hidden />
          {connection === "closed"
            ? "Connexion temps réel perdue — reconnexion en cours, actualisation automatique toutes les 15 s."
            : "Connexion temps réel en cours… actualisation automatique toutes les 15 s."}
        </div>
      )}

      <div
        className="flex items-center gap-2 overflow-x-auto border-b border-neutral-800 px-4 py-2 [scrollbar-width:none] md:flex-wrap md:overflow-visible"
        role="toolbar"
        aria-label="Filtres"
      >
        {COLUMNS.slice(0, 3).map((c) => {
          const on = visible.includes(c.status);
          return (
            <button
              key={c.status}
              type="button"
              aria-pressed={on}
              onClick={() => toggleStatus(c.status)}
              className={cn(
                chip,
                on ? "border-neutral-200 bg-neutral-100 text-black" : "border-neutral-700 text-neutral-300",
              )}
            >
              <span className={cn("size-2.5 rounded-full", c.dot)} aria-hidden />
              {c.title}
              <span className={cn("tabular rounded-full px-2 text-sm", on ? "bg-black/10" : "bg-neutral-800")}>
                {counts[c.status] ?? 0}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={showCompleted}
          onClick={() => setShowCompleted((v) => !v)}
          className={cn(
            chip,
            showCompleted ? "border-neutral-200 bg-neutral-100 text-black" : "border-neutral-700 text-neutral-300",
          )}
        >
          <History className="size-4" aria-hidden />
          Terminées récemment
        </button>
        {(stations.data?.length ?? 0) > 0 && (
          <div className="ml-auto shrink-0">
            <Select value={stationId ?? "all"} onValueChange={(v) => setStationId(v === "all" ? null : v)}>
              <SelectTrigger className="min-h-12 min-w-48 text-base" aria-label="Poste de préparation">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="dark">
                <SelectItem value="all" className="min-h-11 text-base">
                  Tous les postes
                </SelectItem>
                {stations.data!.map((s) => (
                  <SelectItem key={s.id} value={s.id} className="min-h-11 text-base">
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <main className="flex-1 p-3 md:min-h-0">
        {orders.isLoading ? (
          <div className="flex h-full items-center justify-center gap-3 text-neutral-400" role="status">
            <Loader2 className="size-6 animate-spin" /> Chargement des commandes…
          </div>
        ) : orders.isError && !orders.data ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <p className="text-lg text-red-300">{errorMessage(orders.error)}</p>
            <button type="button" className={iconBtn} onClick={() => void orders.refetch()}>
              Réessayer
            </button>
          </div>
        ) : (
          <div className={cn("grid grid-cols-1 gap-3 md:h-full", GRID_COLS[columns.length])}>
            {columns.map((c) => {
              const list = visibleOrders.filter((o) => o.status === c.status);
              const sorted = c.status === "COMPLETED" ? [...list].reverse() : list;
              return (
                <section
                  key={c.status}
                  aria-label={c.title}
                  className="flex flex-col rounded-2xl bg-neutral-900/60 ring-1 ring-neutral-800 md:min-h-0"
                >
                  <h2 className="flex items-center gap-2 border-b border-neutral-800 px-4 py-3 text-lg font-bold">
                    <span className={cn("size-3 rounded-full", c.dot)} aria-hidden />
                    {c.title}
                    <span className="tabular ml-auto rounded-full bg-neutral-800 px-2.5 text-base">{list.length}</span>
                  </h2>
                  <div className="flex flex-col gap-3 p-3 md:min-h-0 md:flex-1 md:overflow-y-auto">
                    {sorted.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-neutral-800 py-8 text-center text-neutral-500">
                        Aucune commande
                      </p>
                    ) : (
                      sorted.map((o) => (
                        <KitchenOrderCard
                          key={o.id}
                          order={o}
                          now={now}
                          lateAfterMinutes={lateAfter}
                          rules={rules}
                          stationId={stationId}
                          busy={busy.has(o.id)}
                          onTransition={onTransition}
                        />
                      ))
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </main>

      {canStock && <StockSheet rid={rid} open={stockOpen} onOpenChange={setStockOpen} />}
    </div>
  );
}

function ConnectionDot({ state }: { state: "connecting" | "open" | "closed" }) {
  const conf = {
    open: { color: "bg-green-500", label: "Temps réel connecté" },
    connecting: { color: "bg-amber-500 animate-pulse", label: "Connexion en cours" },
    closed: { color: "bg-red-500 animate-pulse", label: "Hors ligne" },
  }[state];
  return (
    <span className="flex items-center gap-2" role="status" aria-label={conf.label} title={conf.label}>
      <span className={cn("size-4 rounded-full", conf.color)} aria-hidden />
    </span>
  );
}
