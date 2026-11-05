# OmegaSen

Plateforme de gestion de restaurants : menus, **QR Code unique par restaurant**, commandes (QR, guichet, en ligne, borne), écran cuisine en temps réel, caisse, paiements et super administration.

| Espace | URL | Accès |
|---|---|---|
| Public (découverte, menu, commande, suivi) | `/`, `/r/{slug}`, `/q/{code}`, `/track/{jeton}` | Tout le monde |
| Demande d'ouverture, activation de compte | `/demande`, `/activate/{jeton}` | Tout le monde |
| Restaurateur | `/manage`, `/manage/{id}/…` | Propriétaire, gérant |
| Cuisine (KDS) | `/kitchen/{id}` | Propriétaire, gérant, cuisine, caisse |
| Caisse / guichet | `/pos/{id}` | Propriétaire, gérant, caissier |
| Super Admin | `/admin` | Super administrateur |
| Documentation API | `/api/docs` (Swagger), `/api/redoc` | — |

## Architecture

```
            ┌──────────── Nginx ────────────┐
 navigateur │ /api, /api/ws │ /media │  /   │
            └──────┬────────┴───┬────┴──┬───┘
                   ▼            ▼       ▼
             FastAPI (API +   MinIO   Next.js (React, Tailwind, shadcn/ui)
             WebSocket)       (S3)
              │      │  ▲
              ▼      ▼  │ pub/sub
          PostgreSQL  Redis ◄── worker ARQ (tâches planifiées)
```

- **backend/** — Python 3.12, FastAPI, SQLAlchemy 2 (async), Alembic, Pydantic v2, Redis, Pillow, qrcode, ReportLab, Argon2, JWT.
  Un module par domaine dans `app/modules/` : `auth`, `restaurants`, `media`, `menu`, `qrcodes`, `orders`, `payments`, `public`, `analytics`, `admin`, `ws`.
- **frontend/** — Next.js 15 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui, Lucide, TanStack Query. Types de l'API générés depuis l'OpenAPI (`npm run api:types`).
- **infra/** — configuration Nginx et scripts de sauvegarde.

### Principes métier

- **Multi-tenant** : chaque ressource porte un `restaurant_id`. Toute route `/api/restaurants/{id}/…` passe par `require_roles`, qui vérifie l'appartenance de l'utilisateur au restaurant. Un restaurant tiers renvoie 404. Des tests couvrent l'isolation.
- **Ouverture des restaurants** : seul le **super admin** crée un restaurant. Un restaurateur envoie une **demande d'ouverture** (`/demande`) ; les super admins sont notifiés et l'acceptent ou la refusent dans `/admin/requests` (le demandeur reçoit la réponse par email). Statuts d'un restaurant : `PENDING` (en préparation, invisible du public), `ACTIVE`, `SUSPENDED`, `CLOSED`.
- **Comptes et mots de passe** : jamais de mot de passe provisoire. Tout compte créé (propriétaire, employé invité par son gérant, utilisateur créé par le super admin, client) reçoit par email un **lien d'activation** unique, à usage unique et temporaire (`ACTIVATION_TTL_HOURS`, 72 h par défaut) pour choisir son mot de passe (Argon2id) ; l'activation vaut vérification de l'email. Renvoyer un lien invalide les précédents. **Mot de passe oublié** : lien de réinitialisation (`RESET_TTL_MINUTES`, 60 min) qui ferme toutes les sessions. Page **Mon compte** (`/compte`) : profil, changement de mot de passe, sessions actives (révocation), et pour les clients l'historique des commandes et réservations.
- **Emails** : envoyés par SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_STARTTLS`/`SMTP_SSL`, `EMAIL_FROM`). Sans `SMTP_HOST` (développement), l'email est seulement écrit dans `.dev-logs/api.log` et l'interface affiche le lien d'activation à copier.
- **Rôles et permissions (RBAC)** : `backend/app/core/permissions.py` est la table unique des permissions par rôle ; les contrôles d'accès du backend en dérivent et `/api/auth/me` expose les permissions à l'interface.

  | Rôle | Accès |
  |---|---|
  | Super admin OmegaSen | Toute la plateforme : demandes, restaurants, utilisateurs, chiffre d'affaires, journal d'activité |
  | Propriétaire (administrateur du restaurant) | Tout son restaurant, y compris nommer d'autres propriétaires |
  | Responsable (`MANAGER`) | Tout son restaurant : menu, plats, équipe (invitations), réservations, statistiques |
  | Caisse | Prise de commande, encaissement, suivi des commandes, réservations, ruptures |
  | Cuisine | Écran cuisine (préparation) et ruptures uniquement |
  | Client | Compte facultatif : historique de ses commandes et réservations |
- **Notifications** : centre de notifications (cloche dans les espaces) alimenté en temps réel (`/api/ws/me`) : nouvelle demande d'ouverture, compte activé, nouvelle commande, commande prête, changement de statut d'un restaurant, réservations.
- **Réservations** : demande depuis la page du restaurant (horaires d'ouverture vérifiés, 30 min à 90 jours à l'avance), suivi et annulation via `/reservation/{jeton}` ; le restaurant confirme, refuse (motif obligatoire), note l'arrivée ou l'absence, et saisit les réservations téléphoniques. Désactivables par restaurant.
- **Montants** : entiers en unités mineures (centimes pour EUR, francs pour XOF). La devise est propre à chaque restaurant. Les prix sont saisis **TTC** et la TVA est **extraite**, jamais ajoutée.
- **QR Code permanent** : il est créé avec le restaurant et encode `PUBLIC_APP_URL/q/{code}`. Il ne change pas quand le nom, le slug ou le menu changent. Seul un super admin peut le régénérer. Il peut être téléchargé en PNG, en SVG et en PDF imprimable (A4 ou chevalet A6), avec le logo au centre, et le nombre de scans est compté.
- **Moteur de commandes unique** (`place_order`) pour les quatre canaux : prix recalculés côté serveur, promotions datées, options obligatoires et nombre min/max de choix vérifiés, nom et prix figés dans la commande, numéro du jour attribué par un compteur verrouillé, idempotence.
- **Statuts de préparation** : `NEW → PREPARING → READY → COMPLETED` (et `CANCELLED`), avec retours arrière contrôlés selon le rôle. Le **statut de paiement est indépendant** de la préparation.
- **Paiements** : espèces, carte, Mobile Money ou autre, enregistrés par un employé qui a réellement encaissé. Le paiement en ligne passe par l'interface `PaymentProvider` (Stripe, PayDunya, Wave… à brancher). Tant qu'aucun prestataire n'est configuré, l'API répond 503. **Aucun paiement n'est simulé.** Option « prépaiement obligatoire » : la commande n'arrive en cuisine qu'une fois payée.
- **Temps réel** : les événements sont publiés dans Redis et relayés aux WebSockets (cuisine, caisse et gérant sur `/api/ws/restaurants/{id}`, client sur `/api/ws/orders/{jeton}`). Les écrans rechargent l'état complet à chaque reconnexion.
- **Images** : validées et ré-encodées en WebP par Pillow (métadonnées EXIF et GPS supprimées), trois tailles (2000, 800 et 320 px). Elles sont stockées sur S3/MinIO sous `public/…` et PostgreSQL ne garde que les clés et métadonnées.
- **Sécurité** : JWT d'accès de 15 min gardé en mémoire côté client. Jeton de rafraîchissement opaque dans un cookie httpOnly, renouvelé à chaque usage ; un rejeu provoque la révocation de toute la session. Verrouillage du compte après 5 échecs de connexion, limitation de débit avec Redis, journal d'audit.

## Développement local

Prérequis : Docker Desktop (démarré), Python 3.12+, Node 22+.

```bash
./dev.sh          # installe si besoin, démarre base + API + site → http://localhost:3100 (Ctrl+C pour arrêter)
./dev.sh stop     # arrête aussi PostgreSQL et Redis
./dev.sh reset    # repart d'une base de démo vierge
```

Le script crée `.env` s'il manque, installe les dépendances au premier lancement, démarre PostgreSQL et Redis (Docker), applique les migrations, crée le super admin et le restaurant de démo, puis lance le stockage d'images local (port 9010), l'API (8100) et le site (3100). Les ports occupés par un ancien lancement sont libérés automatiquement. Journaux : `.dev-logs/`.

En local, les images sont stockées dans un S3 de développement en mémoire (`moto`) : elles sont perdues à chaque redémarrage. Avec `MINIO_IMAGE` défini, `docker compose -f docker-compose.dev.yml up -d minio` fournit un stockage persistant.

### Liens utiles (pendant que `./dev.sh` tourne)

**Application**

| Page | Lien |
|---|---|
| Accueil | http://localhost:3100 |
| Menu client (démo) | http://localhost:3100/r/le-baobab-demo |
| Menu en mode borne | http://localhost:3100/r/le-baobab-demo?mode=kiosk |
| Connexion | http://localhost:3100/login |
| Demande d'ouverture d'un restaurant | http://localhost:3100/demande |
| Espace restaurateur | http://localhost:3100/manage |
| Écran cuisine | http://localhost:3100/kitchen/{id-restaurant} |
| Caisse | http://localhost:3100/pos/{id-restaurant} |
| Super admin | http://localhost:3100/admin |
| Demandes d'ouverture (super admin) | http://localhost:3100/admin/requests |
| Suivi d'une commande | http://localhost:3100/track/{jeton} |
| Lien du QR Code | http://localhost:3100/q/{code} |

Les comptes cuisine et caisse sont redirigés automatiquement vers leur écran après connexion.

**API**

| Outil | Lien |
|---|---|
| Swagger | http://localhost:8100/api/docs |
| ReDoc | http://localhost:8100/api/redoc |
| OpenAPI (JSON) | http://localhost:8100/api/openapi.json |
| Santé (API, base, Redis) | http://localhost:8100/health |

**Stockage des images**

| Outil | Lien |
|---|---|
| S3 local (moto) | http://localhost:9010 |
| Bucket des images | http://localhost:9010/omegasen-media/ |
| Tableau de bord du S3 local | http://localhost:9010/moto-api/ |
| Console MinIO (seulement si `MINIO_IMAGE` est défini et le service `minio` lancé) | http://localhost:9011 (identifiants `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` de `docker-compose.dev.yml`) |

**Base de données et cache** (client externe : TablePlus, DBeaver…)

| Service | Accès |
|---|---|
| PostgreSQL | `localhost:54330`, base, utilisateur et mot de passe `omegasen` |
| Redis | `localhost:63790` |

**En production**, tout passe par Nginx sur le même domaine : `/` (site), `/api/docs` (API), `/media/…` (images). La console MinIO n'est pas exposée publiquement.

**Photos de démonstration** : `backend/app/demo_assets/` (restaurant de démo) et `frontend/public/landing/` (page d'accueil), photos Unsplash sous licence Unsplash, crédits dans les `CREDITS.md` de chaque dossier. `seed-demo` les importe et les restaure si le stockage local a été vidé.

**Comptes de démonstration** (mot de passe `Demo!2026pass`) : `owner@demo.example.com`, `manager@demo.example.com`, `caisse@demo.example.com`, `cuisine@demo.example.com`. Restaurant : `/r/le-baobab-demo`.
Super admin : définir `SUPERADMIN_EMAIL` et `SUPERADMIN_PASSWORD`, puis lancer `python -m app.cli bootstrap`.

## Démo

La page `/demo` présente chaque espace avec de vraies captures du restaurant de démonstration. Pour les régénérer après une évolution de l'interface (application lancée) : `cd frontend && npm run demo:screens` (crée un peu d'activité, capture, convertit en WebP dans `public/demo/`, puis supprime l'activité créée).

## Tests

```bash
cd backend && .venv/bin/pytest           # PostgreSQL réel (base *_test), Redis réel (db 15), S3 simulé
cd frontend && npm run check             # tsc + eslint + vitest
cd frontend && npm run test:e2e          # Playwright (API et front lancés)
```

Les tests n'utilisent **jamais** la base de production : `tests/conftest.py` impose une base dont le nom finit par `_test`.

## Déploiement (VPS Docker)

```bash
cp .env.example .env    # renseigner : JWT_SECRET (openssl rand -hex 32), POSTGRES_PASSWORD,
                        # S3_SECRET_KEY, PUBLIC_APP_URL, SUPERADMIN_*, MINIO_IMAGE
docker compose up -d --build
```

- Au démarrage, le backend applique les migrations Alembic et crée le super admin.
- Le TLS se termine devant Nginx (Caddy, Traefik ou certbot), ou en ajoutant un bloc `listen 443 ssl` à `infra/nginx/default.conf.template`.
- **Sauvegardes** : `db-backup` fait un `pg_dump` quotidien avec 14 jours de rétention ; `media-backup` copie chaque jour, de façon incrémentale, le bucket d'images dans `BACKUP_DIR`. Restauration : `pg_restore -d omegasen backups/db/omegasen-….dump`.
- **MinIO** : les images officielles `minio/minio` ne sont plus publiées sur Docker Hub. Renseigner `MINIO_IMAGE` (build interne ou miroir de confiance), ou utiliser un stockage S3 managé (Scaleway Object Storage…) via `S3_ENDPOINT_URL` et `S3_PUBLIC_BASE_URL`.

## Ajouter un prestataire de paiement en ligne

Implémenter `PaymentProvider` (`backend/app/modules/payments.py`) : `create_checkout()` et `parse_webhook()` avec vérification de signature. L'enregistrer dans `PROVIDERS`, puis ajouter une route webhook qui passe la transaction en `SUCCEEDED` et appelle `recompute_payment_status`.
