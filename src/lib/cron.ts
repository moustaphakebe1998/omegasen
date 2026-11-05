// src/lib/cron.ts — Authentification des tâches planifiées (Vercel Cron)

import 'server-only'
import { timingSafeEqual } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { env } from '@/lib/env'

/** Retourne une réponse 401 si la requête ne porte pas le bon CRON_SECRET, sinon null. */
export function rejectUnauthorizedCron(req: NextRequest): NextResponse | null {
  const secret = env().CRON_SECRET
  const header = req.headers.get('authorization') ?? ''
  const expected = `Bearer ${secret ?? ''}`
  const valid =
    !!secret &&
    header.length === expected.length &&
    timingSafeEqual(Buffer.from(header), Buffer.from(expected))
  return valid ? null : NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
