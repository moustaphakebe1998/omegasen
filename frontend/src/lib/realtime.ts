"use client";

import { useEffect, useRef, useState } from "react";

import { getAccessToken, refreshSession } from "@/lib/api/client";

export type RealtimeEvent = { event: string; data?: unknown };
export type ConnectionState = "connecting" | "open" | "closed";

function wsBase(): string {
  const configured = process.env.NEXT_PUBLIC_WS_BASE_URL;
  if (configured) return configured.replace(/\/$/, "");
  const { protocol, host } = window.location;
  return `${protocol === "https:" ? "wss" : "ws"}://${host}`;
}

/**
 * WebSocket avec reconnexion automatique (backoff) et ping régulier.
 * `onReconnect` est appelé à chaque (re)connexion : recharger l'état complet à ce moment-là
 * garantit qu'aucun événement manqué pendant une coupure n'est perdu.
 */
function useSocket(
  buildUrl: (() => Promise<string | null>) | null,
  onEvent: (e: RealtimeEvent) => void,
  onReconnect?: () => void,
): ConnectionState {
  const [state, setState] = useState<ConnectionState>("connecting");
  const handlers = useRef({ onEvent, onReconnect });
  handlers.current = { onEvent, onReconnect };

  useEffect(() => {
    if (!buildUrl) return;
    let ws: WebSocket | null = null;
    let stopped = false;
    let attempt = 0;
    let ping: ReturnType<typeof setInterval> | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const connect = async () => {
      if (stopped) return;
      setState("connecting");
      const url = await buildUrl();
      if (!url || stopped) return;
      ws = new WebSocket(url);
      ws.onopen = () => {
        attempt = 0;
        setState("open");
        handlers.current.onReconnect?.();
        ping = setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send("ping"), 25_000);
      };
      ws.onmessage = (msg) => {
        try {
          const parsed = JSON.parse(msg.data) as RealtimeEvent;
          if (parsed.event !== "pong" && parsed.event !== "heartbeat") handlers.current.onEvent(parsed);
        } catch {
          /* message ignoré */
        }
      };
      ws.onclose = () => {
        clearInterval(ping);
        setState("closed");
        if (stopped) return;
        const delay = Math.min(15_000, 500 * 2 ** attempt++);
        retry = setTimeout(connect, delay);
      };
    };
    connect();
    return () => {
      stopped = true;
      clearInterval(ping);
      clearTimeout(retry);
      ws?.close();
    };
  }, [buildUrl]);

  return state;
}

/** Canal temps réel d'un restaurant (cuisine, caisse, gérant). */
export function useRestaurantSocket(
  restaurantId: string | null,
  onEvent: (e: RealtimeEvent) => void,
  onReconnect?: () => void,
) {
  const [builder, setBuilder] = useState<(() => Promise<string | null>) | null>(null);
  useEffect(() => {
    if (!restaurantId) return;
    setBuilder(() => async () => {
      // Jeton d'accès frais à chaque connexion (durée de vie courte).
      const fresh = await refreshSession().catch(() => null);
      const token = fresh?.access_token ?? getAccessToken();
      if (!token) return null;
      return `${wsBase()}/api/ws/restaurants/${restaurantId}?token=${encodeURIComponent(token)}`;
    });
  }, [restaurantId]);
  return useSocket(builder, onEvent, onReconnect);
}

/** Suivi d'une commande côté client. */
export function useOrderSocket(trackingToken: string | null, onEvent: (e: RealtimeEvent) => void) {
  const [builder, setBuilder] = useState<(() => Promise<string | null>) | null>(null);
  useEffect(() => {
    if (!trackingToken) return;
    setBuilder(() => async () => `${wsBase()}/api/ws/orders/${trackingToken}`);
  }, [trackingToken]);
  return useSocket(builder, onEvent);
}
