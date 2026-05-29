// src/lib/api.ts — Helpers pour les Route Handlers

import { NextRequest, NextResponse } from "next/server";
import { ZodError, ZodSchema } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/db/client";
import type { AuthUser, ApiResponse } from "@/types";
import type { AuditAction } from "@prisma/client";

// ── Response helpers ──────────────────────────

export function ok<T>(data: T, status = 200): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ success: true, data }, { status });
}

export function err(
  message: string,
  status = 400,
  code?: string
): NextResponse<ApiResponse<never>> {
  return NextResponse.json({ success: false, error: message, code }, { status });
}

export function validationError(e: ZodError) {
  const field = e.errors[0]?.path.join(".");
  return NextResponse.json(
    {
      success: false,
      error: e.errors[0]?.message ?? "Validation échouée",
      code: "VALIDATION_ERROR",
      field,
    },
    { status: 422 }
  );
}

// ── Auth wrapper ──────────────────────────────

type HandlerFn = (
  req: NextRequest,
  ctx: { user: AuthUser; params: Record<string, string> }
) => Promise<NextResponse>;

export function withAuth(handler: HandlerFn) {
  return async (
    req: NextRequest,
    { params }: { params: Promise<Record<string, string>> }
  ) => {
    try {
      const user = await getCurrentUser();
      if (!user) {
        return err("Non authentifié", 401, "UNAUTHORIZED");
      }
      const resolvedParams = await params;
      return await handler(req, { user, params: resolvedParams });
    } catch (e) {
      if (e instanceof Error && e.message === "FORBIDDEN") {
        return err("Accès refusé", 403, "FORBIDDEN");
      }
      console.error("[withAuth] Unhandled error:", e);
      return err("Erreur serveur", 500, "SERVER_ERROR");
    }
  };
}

// ── Validate body ─────────────────────────────

export async function parseBody<T>(
  req: NextRequest,
  schema: ZodSchema<T>
): Promise<{ data: T } | { error: NextResponse }> {
  try {
    const body = await req.json();
    const data = schema.parse(body);
    return { data };
  } catch (e) {
    if (e instanceof ZodError) {
      return { error: validationError(e) };
    }
    return { error: err("Corps de requête invalide", 400) };
  }
}

export function parseSearchParams<T>(
  req: NextRequest,
  schema: ZodSchema<T>
): { data: T } | { error: NextResponse } {
  try {
    const params = Object.fromEntries(req.nextUrl.searchParams);
    const data = schema.parse(params);
    return { data };
  } catch (e) {
    if (e instanceof ZodError) {
      return { error: validationError(e) };
    }
    return { error: err("Paramètres invalides", 400) };
  }
}

// ── Audit log ─────────────────────────────────

export async function auditLog(params: {
  action: AuditAction;
  actorId?: string;
  restaurantId?: string;
  entity?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  req?: NextRequest;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        action: params.action,
        actorId: params.actorId,
        restaurantId: params.restaurantId,
        entity: params.entity,
        entityId: params.entityId,
        before: params.before ? (params.before as object) : undefined,
        after: params.after ? (params.after as object) : undefined,
        ipAddress: params.req?.headers.get("x-forwarded-for") ?? undefined,
        userAgent: params.req?.headers.get("user-agent") ?? undefined,
      },
    });
  } catch (e) {
    // Ne jamais faire échouer la requête principale pour un log
    console.error("[auditLog] Failed:", e);
  }
}

// ── Idempotency check ────────────────────────

export async function checkIdempotency(key: string) {
  const existing = await prisma.order.findUnique({
    where: { idempotencyKey: key },
    select: { id: true, orderNumber: true, status: true },
  });
  return existing;
}
