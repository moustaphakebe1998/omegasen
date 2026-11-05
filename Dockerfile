# ─────────────────────────────────────────────────────────────────────────────
# Omegasen — Dockerfile (Next.js + Prisma)
# Multi-stage build pour une image de production légère
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1 : Dépendances ────────────────────────────────────────────────────
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# Copier uniquement les fichiers de dépendances
COPY package.json package-lock.json* ./
COPY prisma ./prisma/

# Installer toutes les dépendances (prod + dev pour le build)
RUN npm ci

# Générer le client Prisma
RUN npx prisma generate

# ── Stage 2 : Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# Récupérer node_modules depuis deps
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma

# Copier tout le code source
COPY . .

# Variables d'environnement nécessaires au build
# (les valeurs réelles sont injectées au runtime)
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV BUILD_STANDALONE=1

# Build Next.js
RUN npm run build

# ── Stage 3 : Production ─────────────────────────────────────────────────────
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Créer un utilisateur non-root
RUN addgroup --system --gid 1001 nodejs
RUN adduser  --system --uid 1001 nextjs

# Copier le build Next.js (standalone mode)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copier Prisma (schéma + migrations + client généré)
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma

# Script de démarrage
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["./docker-entrypoint.sh"]
