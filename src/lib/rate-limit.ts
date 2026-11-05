// src/lib/rate-limit.ts — Rate limiting via Upstash Redis (Vercel KV)

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { NextRequest } from "next/server";

let redis: Redis | null = null;
let _loginLimiter: Ratelimit | null = null;
let _apiLimiter: Ratelimit | null = null;
let _orderLimiter: Ratelimit | null = null;

function getRedis(): Redis | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  if (!redis) redis = new Redis({ url, token });
  return redis;
}

function getLoginLimiter(): Ratelimit | null {
  const r = getRedis();
  if (!r) return null;
  if (!_loginLimiter) {
    _loginLimiter = new Ratelimit({
      redis: r,
      limiter: Ratelimit.slidingWindow(5, "15 m"),
      prefix: "omegasen:login:",
      analytics: true,
    });
  }
  return _loginLimiter;
}

function getApiLimiter(): Ratelimit | null {
  const r = getRedis();
  if (!r) return null;
  if (!_apiLimiter) {
    _apiLimiter = new Ratelimit({
      redis: r,
      limiter: Ratelimit.slidingWindow(100, "1 m"),
      prefix: "omegasen:api:",
    });
  }
  return _apiLimiter;
}

function getOrderLimiter(): Ratelimit | null {
  const r = getRedis();
  if (!r) return null;
  if (!_orderLimiter) {
    _orderLimiter = new Ratelimit({
      redis: r,
      limiter: Ratelimit.slidingWindow(10, "5 m"),
      prefix: "omegasen:order:",
    });
  }
  return _orderLimiter;
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

  if (!limiter) return { success: true, remaining: 999, reset: Date.now() + 60000 };

  const result = await limiter.limit(ip);
  return { success: result.success, remaining: result.remaining, reset: result.reset };
}

export async function checkLoginRateLimit(
  req: NextRequest
): Promise<{ blocked: boolean; retryAfter?: number }> {
  const result = await rateLimit(req, "login");
  if (!result.success) {
    return { blocked: true, retryAfter: Math.ceil((result.reset - Date.now()) / 1000) };
  }
  return { blocked: false };
}

export async function orderLimiter(ip: string): Promise<{ success: boolean }> {
  const limiter = getOrderLimiter();
  if (!limiter) return { success: true };
  const result = await limiter.limit(ip);
  return { success: result.success };
}
