// src/lib/auth.ts — JWT, sessions, RBAC

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { Role } from "@prisma/client";
import type { JWTPayload, AuthUser } from "@/types";
import { prisma } from "@/db/client";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "fallback-secret-change-in-production"
);
const COOKIE_NAME = "omegasen_token";
const COOKIE_MAX_AGE = 60 * 60 * 24; // 24h

// ── Token ────────────────────────────────────

export async function signToken(payload: Omit<JWTPayload, "iat" | "exp">) {
  return await new SignJWT(payload as Parameters<typeof SignJWT>[0])
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as JWTPayload;
  } catch {
    return null;
  }
}

// ── Cookie ───────────────────────────────────

export async function setAuthCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
}

export async function clearAuthCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getTokenFromCookies(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value ?? null;
}

// ── Current User ─────────────────────────────

export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = await getTokenFromCookies();
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload) return null;

  // Vérifier que l'utilisateur existe et est actif
  const user = await prisma.user.findUnique({
    where: { id: payload.sub, deletedAt: null, isActive: true },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      restaurants: {
        select: { restaurantId: true },
      },
    },
  });

  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    restaurants: user.restaurants.map((r) => r.restaurantId),
  };
}

// ── Authorization Guards ─────────────────────

export function isCEO(user: AuthUser) {
  return user.role === "CEO";
}

export function isManager(user: AuthUser) {
  return user.role === "MANAGER" || user.role === "CEO";
}

export function canAccessRestaurant(user: AuthUser, restaurantId: string) {
  if (user.role === "CEO") return true;
  return user.restaurants.includes(restaurantId);
}

// Vérification stricte utilisée dans les handlers
export function assertCanAccessRestaurant(
  user: AuthUser,
  restaurantId: string
) {
  if (!canAccessRestaurant(user, restaurantId)) {
    throw new Error("FORBIDDEN");
  }
}

// ── Role Permissions ─────────────────────────

export const ROLE_PERMISSIONS: Record<Role, string[]> = {
  CEO: [
    "restaurants:read",
    "restaurants:write",
    "users:read",
    "users:write",
    "orders:read",
    "orders:write",
    "orders:cancel",
    "menu:read",
    "menu:write",
    "analytics:read",
    "audit:read",
    "settings:write",
  ],
  MANAGER: [
    "orders:read",
    "orders:write",
    "orders:cancel",
    "menu:read",
    "menu:write",
    "users:read",
    "analytics:read",
    "settings:write",
  ],
  KITCHEN: ["orders:read", "orders:status"],
  KIOSK: ["orders:create", "menu:read"],
};

export function hasPermission(user: AuthUser, permission: string) {
  return ROLE_PERMISSIONS[user.role]?.includes(permission) ?? false;
}
