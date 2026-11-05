#!/bin/sh
set -e

echo "🚀 Omegasen — Démarrage..."

# Appliquer les migrations Prisma
echo "📦 Application des migrations Prisma..."
node node_modules/prisma/build/index.js migrate deploy

echo "✅ Migrations appliquées"
echo "🌐 Lancement du serveur Next.js sur le port $PORT..."

exec node server.js
