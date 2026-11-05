// src/proxy.ts — Protection des pages par rôle (Next 16 : ex-« middleware »).
//
// Les routes /api/* ne passent PAS par ici : chaque route vérifie elle-même
// l'authentification et répond en JSON (401/403), ce qui évite les redirections
// HTML vers /login sur des appels fetch et laisse passer les crons Vercel.

import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import type { Role } from "@prisma/client";

const COOKIE = "omegasen_token";

/** Préfixe de page → rôles autorisés. Les pages absentes de la liste sont publiques. */
const PROTECTED: { prefix: string; roles: Role[] }[] = [
  { prefix: "/admin", roles: ["CEO"] },
  { prefix: "/manager", roles: ["CEO", "MANAGER"] },
  { prefix: "/kitchen", roles: ["CEO", "MANAGER", "KITCHEN"] },
];

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const rule = PROTECTED.find((r) => path === r.prefix || path.startsWith(`${r.prefix}/`));
  if (!rule) return NextResponse.next();

  const token = req.cookies.get(COOKIE)?.value;
  const user = token ? await verifyToken(token) : null;

  if (!user) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("redirect", path);
    const res = NextResponse.redirect(url);
    if (token) res.cookies.delete(COOKIE);
    return res;
  }

  if (!rule.roles.includes(user.role)) {
    return NextResponse.redirect(new URL("/unauthorized", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/manager/:path*", "/kitchen/:path*"],
};
