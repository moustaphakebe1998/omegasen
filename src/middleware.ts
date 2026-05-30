import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";

const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/health",
  "/api/kiosk",
  "/api/orders/kiosk",
  "/api/orders/track",
];

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  if (PUBLIC_PATHS.some((p) => path.startsWith(p))) return NextResponse.next();
  if (path.startsWith("/_next") || path.startsWith("/favicon") || path.includes(".")) return NextResponse.next();
  if (path.startsWith("/kiosk")) return NextResponse.next();
  if (path.startsWith("/track")) return NextResponse.next();

  const token = req.cookies.get("omegasen_token")?.value;
  if (!token) return redirectToLogin(req);

  const payload = await verifyToken(token);
  if (!payload) {
    const response = redirectToLogin(req);
    response.cookies.delete("omegasen_token");
    return response;
  }

  if (path.startsWith("/admin") && payload.role !== "CEO") {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (path.startsWith("/manager") && !["CEO", "MANAGER"].includes(payload.role)) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (path.startsWith("/kitchen") && !["CEO", "MANAGER", "KITCHEN"].includes(payload.role)) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-user-id", payload.id);
  requestHeaders.set("x-user-role", payload.role);
  requestHeaders.set("x-user-restaurants", payload.restaurants.join(","));

  return NextResponse.next({ request: { headers: requestHeaders } });
}

function redirectToLogin(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("redirect", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
