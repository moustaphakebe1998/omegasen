// src/lib/env.ts — Validation centralisée des variables d'environnement serveur.
// Toute variable manquante ou invalide fait échouer l'appel avec un message explicite,
// plutôt que de tomber silencieusement sur une valeur par défaut dangereuse.

import 'server-only'
import { z } from 'zod'

// Une variable définie mais vide (ex. `KV_REST_API_URL=`) est traitée comme absente.
const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(v => (v === '' ? undefined : v), schema.optional())

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL est requis'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET doit contenir au moins 32 caractères'),
  JWT_EXPIRES_IN: z.string().default('12h'),
  CRON_SECRET: optional(z.string().min(16)),
  KV_REST_API_URL: optional(z.string().url()),
  KV_REST_API_TOKEN: optional(z.string()),
  UPSTASH_REDIS_REST_URL: optional(z.string().url()),
  UPSTASH_REDIS_REST_TOKEN: optional(z.string()),
  RESEND_API_KEY: optional(z.string()),
  RESEND_TO_EMAIL: optional(z.string()),
  FROM_EMAIL: optional(z.string()),
  NEXT_PUBLIC_APP_URL: optional(z.string()),
})

export type Env = z.infer<typeof envSchema>

let cached: Env | null = null

export function env(): Env {
  if (cached) return cached
  const parsed = envSchema.safeParse(process.env)
  if (!parsed.success) {
    const details = parsed.error.issues.map(i => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Configuration invalide :\n${details}`)
  }
  cached = parsed.data
  return cached
}
