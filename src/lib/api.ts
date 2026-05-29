import { NextRequest, NextResponse } from 'next/server'
import { ZodError, ZodSchema } from 'zod'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/db/client'
import type { AuditAction } from '@prisma/client'

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ success: true, data }, { status })
}

export function err(message: string, status = 400, code?: string): NextResponse {
  return NextResponse.json({ success: false, error: message, code }, { status })
}

export function validationError(e: ZodError): NextResponse {
  return NextResponse.json({
    success: false,
    error: e.errors[0]?.message ?? 'Validation échouée',
    code: 'VALIDATION_ERROR',
    field: e.errors[0]?.path.join('.'),
  }, { status: 422 })
}

export async function parseBody<T>(
  req: NextRequest,
  schema: ZodSchema<T>
): Promise<{ data: T } | { error: NextResponse }> {
  try {
    const body = await req.json()
    const data = schema.parse(body)
    return { data }
  } catch (e) {
    if (e instanceof ZodError) return { error: validationError(e) }
    return { error: err('Corps de requête invalide', 400) }
  }
}

export function parseSearchParams<T>(
  req: NextRequest,
  schema: ZodSchema<T>
): { data: T } | { error: NextResponse } {
  try {
    const params = Object.fromEntries(req.nextUrl.searchParams)
    const data = schema.parse(params)
    return { data }
  } catch (e) {
    if (e instanceof ZodError) return { error: validationError(e) }
    return { error: err('Paramètres invalides', 400) }
  }
}

export async function auditLog(params: {
  action: AuditAction
  actorId?: string
  restaurantId?: string
  entity?: string
  entityId?: string
  before?: unknown
  after?: unknown
  req?: NextRequest
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
        ipAddress: params.req?.headers.get('x-forwarded-for') ?? undefined,
        userAgent: params.req?.headers.get('user-agent') ?? undefined,
      },
    })
  } catch (e) {
    console.error('[auditLog] Failed:', e)
  }
}

export async function checkIdempotency(key: string) {
  return prisma.order.findUnique({
    where: { idempotencyKey: key },
    select: { id: true, orderNumber: true, status: true },
  })
}
