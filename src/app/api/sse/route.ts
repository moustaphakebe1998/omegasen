// src/app/api/sse/route.ts — Endpoint SSE temps réel

import { NextRequest } from "next/server";
import { createSSEStream, SSE_HEADERS } from "@/lib/sse";
import { verifyToken } from "@/lib/auth";
import { z } from "zod";

const querySchema = z.object({
  restaurantId: z.string().cuid(),
});

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // SSE nécessite Node.js runtime

export async function GET(req: NextRequest) {
  // Auth via cookie ou query param token (pour EventSource)
  const token =
    req.cookies.get("omegasen_token")?.value ??
    req.nextUrl.searchParams.get("token");

  if (!token) {
    return new Response("Non authentifié", { status: 401 });
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return new Response("Token invalide", { status: 401 });
  }

  // Valider restaurantId
  const result = querySchema.safeParse({
    restaurantId: req.nextUrl.searchParams.get("restaurantId"),
  });
  if (!result.success) {
    return new Response("restaurantId requis", { status: 400 });
  }
  const { restaurantId } = result.data;

  // Vérifier accès au restaurant
  const hasAccess =
    payload.role === "CEO" || payload.restaurants.includes(restaurantId);

  if (!hasAccess) {
    return new Response("Accès refusé", { status: 403 });
  }

  const stream = createSSEStream(restaurantId, payload.sub);

  return new Response(stream, { headers: SSE_HEADERS });
}
