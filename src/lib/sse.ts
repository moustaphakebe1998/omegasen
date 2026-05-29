// src/lib/sse.ts — Server-Sent Events engine

import type { SSEEvent, SSEEventType } from "@/types";
import { nanoid } from "nanoid";

// Store en mémoire des connexions SSE actives (par processus Vercel)
// Note : sur Vercel, chaque invocation est stateless. Les connexions SSE
// sont maintenues tant que la fonction est active. Pour du multi-instance,
// utiliser Redis Pub/Sub ou Vercel KV en prod avancée.
const connections = new Map<
  string,
  {
    restaurantId: string;
    userId: string;
    controller: ReadableStreamDefaultController;
  }
>();

// ── Diffusion ─────────────────────────────────

export function broadcast<T>(
  restaurantId: string,
  type: SSEEventType,
  data: T
) {
  const event: SSEEvent<T> = {
    id: nanoid(),
    type,
    data,
    restaurantId,
    timestamp: new Date().toISOString(),
  };

  const payload = formatSSE(event);

  for (const [connId, conn] of connections.entries()) {
    if (conn.restaurantId === restaurantId) {
      try {
        conn.controller.enqueue(new TextEncoder().encode(payload));
      } catch {
        // Connexion fermée, nettoyer
        connections.delete(connId);
      }
    }
  }
}

// ── Format SSE standard ───────────────────────

function formatSSE<T>(event: SSEEvent<T>): string {
  return [
    `id: ${event.id}`,
    `event: ${event.type}`,
    `data: ${JSON.stringify(event.data)}`,
    "", // Ligne vide = fin d'événement
    "",
  ].join("\n");
}

function heartbeat(): string {
  return [": heartbeat", "", ""].join("\n");
}

// ── Créer un stream SSE ───────────────────────

export function createSSEStream(restaurantId: string, userId: string) {
  const connId = `${userId}-${restaurantId}-${Date.now()}`;

  const stream = new ReadableStream({
    start(controller) {
      // Enregistrer la connexion
      connections.set(connId, { restaurantId, userId, controller });

      // Message de bienvenue
      const welcome: SSEEvent = {
        id: nanoid(),
        type: "system:notice",
        data: { message: "connected", connectionId: connId },
        restaurantId,
        timestamp: new Date().toISOString(),
      };
      controller.enqueue(
        new TextEncoder().encode(formatSSE(welcome))
      );

      // Heartbeat toutes les 30 secondes
      const intervalId = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(heartbeat()));
        } catch {
          clearInterval(intervalId);
          connections.delete(connId);
        }
      }, 30_000);

      // Cleanup on close
      const originalClose = controller.close.bind(controller);
      controller.close = () => {
        clearInterval(intervalId);
        connections.delete(connId);
        originalClose();
      };
    },

    cancel() {
      connections.delete(connId);
    },
  });

  return stream;
}

// ── Headers SSE ──────────────────────────────

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
  "Access-Control-Allow-Origin": "*",
};

// ── Stats ─────────────────────────────────────

export function getConnectionCount(restaurantId?: string): number {
  if (!restaurantId) return connections.size;
  return [...connections.values()].filter(
    (c) => c.restaurantId === restaurantId
  ).length;
}
