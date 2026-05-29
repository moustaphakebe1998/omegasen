// src/lib/rate-limit.ts — Rate limiting via Upstash Redis (Vercel KV)
//
// Variables supportées (par ordre de priorité) :
//   KV_REST_API_URL  + KV_REST_API_TOKEN      ← injectées automatiquement par Vercel KV
//   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN  ← alias Upstash classique

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { NextRequest } from "next/server";

// Lazy initialization pour éviter les erreurs si Redis n'est pas configuré
let redis: Redis | null = null;
let loginLimiter: Ratelimit | null = null;
let apiLimiter: Ratelimit | null = null;
let orderLimiter: Ratelimit | null = null;

function getRedis(): Redis | null {
  // Vercel KV injecte KV_REST_API_URL / KV_REST_API_TOKEN
  // Fallback sur les variables Upstash classiques
  const url =
    process.env.KV_REST_API_URL ??
    process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ??
    process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) return null;

  if (!redis) {
    redis = new Redis({ url, token });
  }
  return redis;
}

// 5 tentatives de login par IP toutes les 15 minutes
function getLoginLimiter(): Ratelimit | null {
  const r = getRedis();
  if (!r) return null;
  if (!loginLimiter) {
    loginLimiter = new Ratelimit({
      redis: r,
      limiter: Ratelimit.slidingWindow(5, "15 m"),
      prefix: "omegasen:login:",
      analytics: true,
    });
  }
  return loginLimiter;
}

// 100 req/min par IP pour l'API générale
function getApiLimiter(): Ratelimit | null {
  const r = getRedis();
  if (!r) return null;
  if (!apiLimiter) {
    apiLimiter = new Ratelimit({
      redis: r,
      limiter: Ratelimit.slidingWindow(100, "1 m"),
      prefix: "omegasen:api:",
    });
  }
  return apiLimiter;
}

// 10 commandes par 5 minutes par kiosk/IP
function getOrderLimiter(): Ratelimit | null {
  const r = getRedis();
  if (!r) return null;
  if (!orderLimiter) {
    orderLimiter = new Ratelimit({
      redis: r,
      limiter: Ratelimit.slidingWindow(10, "5 m"),
      prefix: "omegasen:order:",
    });
  }
  return orderLimiter;
}

function getIP(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "anonymous"
  );
}

export async function rateLimit(
  req: NextRequest,
  type: "login" | "api" | "order" = "api"
): Promise<{ success: boolean; remaining: number; reset: number }> {
  const ip = getIP(req);

  let limiter: Ratelimit | null;
  if (type === "login") limiter = getLoginLimiter();
  else if (type === "order") limiter = getOrderLimiter();
  else limiter = getApiLimiter();

  // Si Redis non configuré, laisser passer (mode développement)
  if (!limiter) {
    return { success: true, remaining: 999, reset: Date.now() + 60000 };
  }

  const result = await limiter.limit(ip);
  return {
    success: result.success,
    remaining: result.remaining,
    reset: result.reset,
  };
}

export async function checkLoginRateLimit(
  req: NextRequest
): Promise<{ blocked: boolean; retryAfter?: number }> {
  const result = await rateLimit(req, "login");
  if (!result.success) {
    return {
      blocked: true,
      retryAfter: Math.ceil((result.reset - Date.now()) / 1000),
    };
  }
  return { blocked: false };
}

export async function orderLimiter(ip: string): Promise<{ success: boolean } | null> {
  const limiter = getOrderLimiter()
  if (!limiter) return { success: true }
  const result = await limiter.limit(ip)
  return { success: result.success }
}
