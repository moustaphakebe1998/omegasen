// src/hooks/use-sse.ts — Hook SSE avec reconnexion automatique

"use client";

import { useEffect, useRef, useCallback } from "react";
import type { SSEEventType } from "@/types";

type SSEHandler<T = unknown> = (data: T) => void;

interface UseSSEOptions {
  restaurantId: string;
  enabled?: boolean;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (err: Event) => void;
}

const MAX_RETRIES = 10;
const BASE_DELAY = 1000;
const MAX_DELAY = 30_000;

export function useSSE(
  handlers: Partial<Record<SSEEventType, SSEHandler>>,
  options: UseSSEOptions
) {
  const { restaurantId, enabled = true, onConnected, onDisconnected } = options;
  const esRef = useRef<EventSource | null>(null);
  const retriesRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastEventIdRef = useRef<string | undefined>(undefined);
  const connectRef = useRef<() => void>(() => {});

  const connect = useCallback(() => {
    if (!enabled || !restaurantId) return;

    const params = new URLSearchParams({ restaurantId });
    if (lastEventIdRef.current) {
      params.set("lastEventId", lastEventIdRef.current);
    }

    const url = `/api/sse?${params}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => {
      retriesRef.current = 0;
      onConnected?.();
    };

    // Gérer chaque type d'événement
    const eventTypes: SSEEventType[] = [
      "order:new",
      "order:update",
      "order:cancelled",
      "menu:update",
      "kitchen:alert",
      "payment:update",
      "stock:update",
      "system:notice",
      "heartbeat",
    ];

    for (const type of eventTypes) {
      es.addEventListener(type, (event: MessageEvent) => {
        try {
          lastEventIdRef.current = event.lastEventId;
          const data = JSON.parse(event.data);
          handlers[type]?.(data);
        } catch (e) {
          console.error(`[SSE] Parse error for ${type}:`, e);
        }
      });
    }

    es.onerror = () => {
      es.close();
      onDisconnected?.();

      if (retriesRef.current >= MAX_RETRIES) {
        console.warn("[SSE] Max retries reached, stopping reconnection");
        return;
      }

      const delay = Math.min(
        BASE_DELAY * Math.pow(2, retriesRef.current),
        MAX_DELAY
      );
      retriesRef.current++;

      timerRef.current = setTimeout(() => connectRef.current(), delay);
    };
  }, [restaurantId, enabled, handlers, onConnected, onDisconnected]);

  useEffect(() => {
    connectRef.current = connect;
    connect();

    return () => {
      clearTimeout(timerRef.current);
      esRef.current?.close();
      esRef.current = null;
    };
  }, [connect]);
}

// Hook spécialisé pour la cuisine
export function useKitchenSSE(
  restaurantId: string,
  onOrderUpdate: () => void
) {
  useSSE(
    {
      "order:new": onOrderUpdate,
      "order:update": onOrderUpdate,
      "order:cancelled": onOrderUpdate,
    },
    { restaurantId }
  );
}
