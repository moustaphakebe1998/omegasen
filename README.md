# Omegasen — Self-Order Restaurant Platform

Application SaaS de commande en restaurant, production-ready, multi-rôles, multi-restaurants. Conçue pour une expérience au niveau des meilleures bornes du marché.

---

## Table des matières

1. [Présentation](#présentation)
2. [Architecture](#architecture)
3. [Stack technique](#stack-technique)
4. [Installation locale](#installation-locale)
5. [Configuration des variables d'environnement](#configuration-des-variables-denvironnement)
6. [Base de données](#base-de-données)
7. [Déploiement Vercel](#déploiement-vercel)
8. [Les 4 interfaces](#les-4-interfaces)
9. [Authentification et rôles](#authentification-et-rôles)
10. [Temps réel SSE](#temps-réel-sse)
11. [Workflow des commandes](#workflow-des-commandes)
12. [Tests](#tests)
13. [Comptes de test](#comptes-de-test)
14. [Décisions d'architecture](#décisions-darchitecture)

---

## Présentation

Omegasen est une plateforme de self-order pour restaurants, pensée pour la production réelle. Elle permet à un réseau de restaurants de gérer leurs commandes, leurs menus, et leurs équipes via quatre interfaces dédiées :

| Interface | URL | Rôles |
|-----------|-----|-------|
| Borne client | `/kiosk/[slug]` | Public |
| Cuisine | `/kitchen` | KITCHEN, MANAGER, CEO |
| Gérant | `/manager` | MANAGER, CEO |
| Admin CEO | `/admin` | CEO |

---

## Architecture

```
┌─────────────────────────────────────────────┐
│              Next.js 15 App Router           │
│                                             │
│  /kiosk/[slug]   /kitchen   /manager  /admin│
│                                             │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
│  │ Auth     │  │ SSE      │  │ API       │  │
│  │ Middleware│  │ Engine   │  │ Handlers  │  │
│  └──────────┘  └──────────┘  └───────────┘  │
│                                             │
│  ┌──────────────────────────────────────┐   │
│  │        Prisma ORM                    │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
         │                    │
         ▼                    ▼
  PostgreSQL (ext.)    Upstash Redis
                       (rate limiting)
```

**Principes clés :**
- Fonctions stateless, compatibles Vercel Edge/Serverless
- Calcul des totaux 100% serveur
- SSE par restaurant (scope isolé)
- Soft delete partout (archivage logique)
- Rate limiting par IP sur les endpoints sensibles

---

## Stack technique

| Domaine | Technologie |
|---------|-------------|
| Framework | Next.js 15 + App Router |
| Langage | TypeScript strict |
| Styles | Tailwind CSS + shadcn/ui |
| Animations | Framer Motion |
| ORM | Prisma 5 |
| Base de données | PostgreSQL (externe) |
| Auth | JWT via cookies httpOnly (jose) |
| Hashing | bcryptjs |
| Validation | Zod |
| Temps réel | Server-Sent Events (SSE) |
| Rate limiting | Upstash Redis |
| Stockage fichiers | Vercel Blob |
| Tests | Vitest |
| Déploiement | Vercel |

---

## Installation locale

### Prérequis

- Node.js 20+
- PostgreSQL 15+
- npm ou pnpm

### Étapes

```bash
# 1. Cloner le repo
git clone https://github.com/your-org/omegasen.git
cd omegasen

# 2. Installer les dépendances
npm install

# 3. Configurer les variables d'environnement
cp .env.example .env.local
# Éditer .env.local avec vos vraies valeurs

# 4. Générer le client Prisma
npx prisma generate

# 5. Appliquer les migrations
npx prisma migrate dev --name init

# 6. Alimenter la base avec des données de test
npx prisma db seed

# 7. Lancer le serveur de développement
npm run dev
```

L'application tourne sur [http://localhost:3000](http://localhost:3000).

---

## Configuration des variables d'environnement

Copier `.env.example` en `.env.local` et remplir :

```env
# Base de données PostgreSQL — Neon
DATABASE_URL="postgresql://USER:PASSWORD@HOST.neon.tech/neondb?sslmode=require"

# Clé secrète JWT — générer avec : openssl rand -base64 64
JWT_SECRET="votre-secret-très-long-et-aléatoire"

# Upstash Redis / Vercel KV (rate limiting)
# Ces variables sont injectées automatiquement par Vercel KV,
# ou à copier manuellement depuis console.upstash.com
KV_REST_API_URL="https://aware-cheetah-85642.upstash.io"
KV_REST_API_TOKEN="gQAAAAAAAU6K..."
KV_REST_API_READ_ONLY_TOKEN="ggAAAAAAAU6K..."
KV_URL="rediss://default:...@aware-cheetah-85642.upstash.io:6379"
REDIS_URL="rediss://default:...@aware-cheetah-85642.upstash.io:6379"
# Alias classiques Upstash (fallback automatique) :
UPSTASH_REDIS_REST_URL="https://aware-cheetah-85642.upstash.io"
UPSTASH_REDIS_REST_TOKEN="gQAAAAAAAU6K..."

# Vercel Blob (pour images produits et logos)
BLOB_READ_WRITE_TOKEN="vercel_blob_rw_xxxxxxxxxxxx"

# Resend (pour emails optionnels : rapports, alertes)
RESEND_API_KEY="re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# Secret pour les cron jobs Vercel
CRON_SECRET="un-secret-aléatoire-pour-les-crons"

# URL publique de l'app (sans slash final)
NEXT_PUBLIC_APP_URL="https://omegasen.vercel.app"

# Feature flags optionnels
FEATURE_PAYMENTS="false"
FEATURE_MULTILINGUE="false"
```

### Base de données recommandée

Pour la production sur Vercel, utiliser **Neon** (serverless PostgreSQL) :
- Compte gratuit sur [neon.tech](https://neon.tech)
- Créer un projet → copier la connection string en mode "pooled"
- Ajouter `?pgbouncer=true&connection_limit=1` si PgBouncer est activé

---

## Base de données

### Migrations

```bash
# Créer une nouvelle migration
npx prisma migrate dev --name description_migration

# Appliquer les migrations en production
npx prisma migrate deploy

# Visualiser la base (Prisma Studio)
npx prisma studio
```

### Seed

Le seed crée :
- 2 restaurants (Paris 1, Lyon)
- 1 CEO, 1 Manager Paris, 1 Cuisine Paris
- Menu complet (burgers, bowls, boissons, desserts, options)
- Horaires d'ouverture

```bash
npx prisma db seed
```

### Schéma principal

```
Restaurant ─── UserRestaurant ─── User
     │
     ├── MenuCategory ─── Product ─── ProductOptionGroup ─── ProductOption
     │
     ├── Order ─── OrderItem ─── OrderItemOption
     │     └── OrderStatusHistory
     │     └── Payment
     │
     ├── KitchenEvent
     ├── StockMovement
     ├── OpeningHours
     └── Kiosk
```

---

## Déploiement Vercel

### 1. Connecter le repo

```bash
npm i -g vercel
vercel login
vercel link
```

### 2. Configurer les variables d'environnement

Dans le dashboard Vercel → Settings → Environment Variables, ajouter toutes les variables du `.env.example`.

### 3. Déployer

```bash
vercel --prod
```

Ou activer le déploiement automatique depuis GitHub : Settings → Git → Connect repository.

### 4. Migrations de production

Ajouter dans `package.json` :
```json
{
  "scripts": {
    "postbuild": "prisma migrate deploy"
  }
}
```

### Cron jobs

Définis dans `vercel.json`, ils s'exécutent automatiquement :

| Cron | Fréquence | Action |
|------|-----------|--------|
| `/api/cron/archive-orders` | 02h00 chaque nuit | Archive les commandes servies depuis 7j |
| `/api/cron/cleanup-sessions` | 03h00 chaque nuit | Supprime les sessions expirées |
| `/api/cron/daily-report` | 08h00 chaque matin | Rapport quotidien (si Resend configuré) |
| `/api/cron/cleanup-drafts` | Toutes les 30 min | Supprime les paniers abandonnés |

---

## Les 4 interfaces

### 🏪 Borne client — `/kiosk/[restaurantSlug]`

Parcours en 5 écrans :
1. **Menu** — Grille de produits par catégorie, filtre, recherche
2. **Produit** — Options, suppléments, quantité, notes
3. **Panier** — Récapitulatif, modification
4. **Confirmation** — Résumé final avant commande
5. **Ticket** — Numéro de commande, lien suivi, reset auto 30s

Conçu pour touch-first (tablettes, bornes tactiles 15–22"). Boutons 60px min. Navigation en 3 taps.

### 🍳 Cuisine — `/kitchen`

Interface dark optimisée production :
- Colonnes : À préparer / En cours / Prêt
- Urgence visuelle après 15 min (pulse rouge)
- Grande horloge live
- Actions rapides par commande
- SSE temps réel + polling fallback 30s
- Rollback contrôlé

### 📊 Gérant — `/manager`

Dashboard opérationnel :
- KPIs du jour (CA, commandes, ticket moyen, annulations)
- Liste des commandes avec filtres et détail
- Gestion disponibilité produits (rupture en 1 clic)
- Paramètres restaurant (ouvert/fermé, maintenance)
- Horaires d'ouverture
- SSE pour nouvelles commandes

### 👔 Admin CEO — `/admin`

Tableau de bord exécutif multi-restaurants :
- KPIs globaux consolidés
- Graphique CA sur 7/30/90 jours (Recharts)
- Top 5 produits par restaurant
- Performance par restaurant
- Filtres temporels

---

## Authentification et rôles

### Flux

1. POST `/api/auth/login` → JWT généré → cookie httpOnly `omegasen_token`
2. Middleware vérifie le JWT à chaque requête
3. Rôle injecté dans les headers `x-user-id`, `x-user-role`
4. Chaque API vérifie le rôle ET l'accès au restaurant

### Rôles

| Rôle | Accès |
|------|-------|
| `CEO` | Tout, tous les restaurants |
| `MANAGER` | Dashboard gérant, son restaurant |
| `KITCHEN` | Interface cuisine, son restaurant |
| `CLIENT` | Borne uniquement (non implémenté — borne est publique) |

### Sécurité

- Mots de passe hashés bcrypt (rounds: 12)
- Lockout après 5 tentatives (15 min)
- Rate limiting sur `/api/auth/login` : 5 req / 15 min / IP
- Audit log sur toutes les mutations critiques
- Pas de données sensibles renvoyées (passwordHash, etc.)
- Protection double-soumission via clé d'idempotence UUID

---

## Temps réel SSE

### Endpoint

`GET /api/sse?restaurantId=xxx`

Authentification via cookie JWT. Scope par restaurant.

### Événements

| Type | Déclencheur |
|------|-------------|
| `order:new` | Nouvelle commande créée |
| `order:update` | Changement de statut |
| `order:cancelled` | Annulation |
| `menu:update` | Modification menu |
| `kitchen:alert` | Alerte cuisine (ex : urgence) |
| `system:notice` | Maintenance, message système |

### Reconnexion

Le hook `useSSE` gère la reconnexion exponentielle :
- Délai initial : 1s
- Max : 30s
- Max tentatives : 10
- `lastEventId` pour reprise propre

---

## Workflow des commandes

```
DRAFT → PENDING → CONFIRMED → PREPARING → READY → SERVED → ARCHIVED
           │           │            │          │
           └───────────┴────────────┴──────────┴─── CANCELLED
```

### Retours arrière autorisés

| Transition | Rôles autorisés |
|------------|-----------------|
| PREPARING → CONFIRMED | CEO, MANAGER, KITCHEN |
| READY → PREPARING | CEO, MANAGER, KITCHEN |
| SERVED → READY | CEO, MANAGER uniquement |

Chaque transition est tracée dans `OrderStatusHistory` avec l'utilisateur, le timestamp, et une note.

---

## Tests

```bash
# Lancer les tests
npm test

# Avec couverture
npm run test:coverage

# Mode watch
npm run test:watch
```

### Couverture cible

| Métrique | Seuil |
|----------|-------|
| Lignes | 70% |
| Fonctions | 70% |
| Branches | 60% |

### Fichiers de tests

- `src/tests/orders.test.ts` — Transitions de statut
- `src/tests/validations.test.ts` — Schemas Zod
- `src/tests/utils.test.ts` — Fonctions utilitaires
- `src/tests/kiosk-order.test.ts` — Règles métier commande

---

## Comptes de test

Après le seed :

| Rôle | Email | Mot de passe |
|------|-------|--------------|
| CEO | `ceo@omegasen.com` | `Omegasen2024!` |
| Manager Paris | `manager.paris@omegasen.com` | `Manager2024!` |
| Cuisine Paris | `cuisine.paris@omegasen.com` | `Kitchen2024!` |

**Borne client :** [http://localhost:3000/kiosk/omegasen-paris-1](http://localhost:3000/kiosk/omegasen-paris-1)

---

## Décisions d'architecture

### JWT via cookies httpOnly
> Alternative : sessions DB. Choix : JWT stateless pour compatibilité Vercel serverless. Rotation via `jti` si révocation nécessaire.

### SSE via Map en mémoire
> Alternative : Redis Pub/Sub. Choix : Map suffisante pour déploiement single-instance. Upgrade path documenté si multi-instance.

### Calcul totaux 100% serveur
> Le client envoie `productId + quantity`. Le serveur recalcule les prix depuis la DB. Impossible pour un client malveillant de falsifier le total.

### Soft delete partout
> `deletedAt: null` sur tous les modèles. Aucune donnée perdue, audit complet possible.

### Prisma 5 vs Drizzle
> Prisma choisi pour maturité, DX, Prisma Studio, migrations. Drizzle plus performant mais moins mature pour les relations complexes.

### Upstash Redis pour rate limiting
> Serverless-compatible (REST API). Graceful fallback si indisponible (ne bloque pas l'app).

### Source de vérité : serveur
> Zustand (client) pour l'UI state. Données serveur via fetch/SSE. Jamais de calcul sensible côté client.

---

## Structure du projet

```
omegasen/
├── prisma/
│   ├── schema.prisma          # Modèle de données
│   └── seed.ts                # Données de test
├── src/
│   ├── app/                   # Pages Next.js (App Router)
│   │   ├── admin/             # Interface CEO
│   │   ├── manager/           # Interface Gérant
│   │   ├── kitchen/           # Interface Cuisine
│   │   ├── kiosk/[slug]/      # Borne client
│   │   ├── track/[orderId]/   # Suivi commande
│   │   ├── login/             # Authentification
│   │   └── api/               # Route Handlers
│   │       ├── auth/          # Login, logout, me
│   │       ├── orders/        # CRUD commandes
│   │       ├── menu/          # Catégories, produits
│   │       ├── kitchen/       # Feed cuisine
│   │       ├── kiosk/         # API borne
│   │       ├── analytics/     # KPIs
│   │       ├── users/         # Gestion users (CEO)
│   │       ├── restaurants/   # Gestion restaurants
│   │       ├── sse/           # Server-Sent Events
│   │       ├── health/        # Health check
│   │       └── cron/          # Jobs planifiés
│   ├── components/
│   │   ├── admin/             # Composants CEO
│   │   ├── manager/           # Composants Gérant
│   │   └── shared/            # Composants partagés
│   ├── db/                    # Client Prisma
│   ├── hooks/                 # Hooks React (SSE, cart)
│   ├── lib/                   # Auth, API helpers, SSE, rate-limit, utils
│   ├── server/                # Logique métier serveur
│   ├── tests/                 # Tests unitaires
│   ├── types/                 # Types TypeScript
│   ├── validations/           # Schemas Zod
│   └── middleware.ts          # Auth middleware
├── tailwind.config.ts
├── vitest.config.ts
├── vercel.json                # Crons, headers, config
└── .env.example
```

---

## Scripts npm

```bash
npm run dev          # Serveur de développement
npm run build        # Build production
npm run start        # Serveur production
npm run lint         # ESLint
npm test             # Tests (Vitest)
npm run test:watch   # Tests en mode watch
npm run test:coverage # Couverture de code
```

---

## Licence

Propriétaire — Omegasen © 2024
