// src/middleware.ts — Auth middleware Next.js

import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";

// Routes publiques (pas d'auth requise)
const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/health",
];

// Routes de borne (auth par token device)
const KIOSK_PATHS = ["/kiosk"];

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // Laisser passer les routes publiques
  if (PUBLIC_PATHS.some((p) => path.startsWith(p))) {
    return NextResponse.next();
  }

  // Assets statiques
  if (
    path.startsWith("/_next") ||
    path.startsWith("/favicon") ||
    path.includes(".")
  ) {
    return NextResponse.next();
  }

  // Récupérer le token
  const token = req.cookies.get("omegasen_token")?.value;

  if (!token) {
    // Borne : rediriger vers la borne si pas de token et route kiosk
    if (KIOSK_PATHS.some((p) => path.startsWith(p))) {
      return NextResponse.next(); // La borne gère son propre auth
    }
    return redirectToLogin(req);
  }

  const payload = await verifyToken(token);
  if (!payload) {
    const response = redirectToLogin(req);
    response.cookies.delete("omegasen_token");
    return response;
  }

  // Vérifier les routes par rôle
  if (path.startsWith("/admin") && payload.role !== "CEO") {
    return NextResponse.redirect(new URL("/unauthorized", req.url));
  }

  if (
    path.startsWith("/manager") &&
    !["CEO", "MANAGER"].includes(payload.role)
  ) {
    return NextResponse.redirect(new URL("/unauthorized", req.url));
  }

  if (
    path.startsWith("/kitchen") &&
    !["CEO", "MANAGER", "KITCHEN"].includes(payload.role)
  ) {
    return NextResponse.redirect(new URL("/unauthorized", req.url));
  }

  // Injecter l'utilisateur dans les headers (pour les Server Components)
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-user-id", payload.sub);
  requestHeaders.set("x-user-role", payload.role);
  requestHeaders.set(
    "x-user-restaurants",
    payload.restaurants.join(",")
  );

  return NextResponse.next({ request: { headers: requestHeaders } });
}

function redirectToLogin(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("redirect", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
