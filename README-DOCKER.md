# 🐳 Déploiement Docker — Omegasen

## Prérequis

- Docker Desktop installé
- Docker Compose installé

## Démarrage rapide

### 1. Préparer les variables d'environnement

```bash
cp .env.docker .env
```

Éditez `.env` si nécessaire (base de données, secrets, etc.)

### 2. Lancer l'application

```bash
# Construire et démarrer (PostgreSQL local inclus)
docker compose up -d

# Voir les logs
docker compose logs -f app
```

L'application sera accessible sur **http://localhost:3000**

### 3. Initialiser la base de données (première fois uniquement)

```bash
# Lancer le seed (données de test)
docker compose exec app npx prisma db seed
```

### 4. Comptes de test

| Rôle | Email | Mot de passe |
|------|-------|--------------|
| CEO | ceo@omegasen.com | Omegasen2024! |
| Gérant | manager.paris@omegasen.com | Manager2024! |
| Cuisine | cuisine.paris@omegasen.com | Kitchen2024! |

---

## Commandes utiles

```bash
# Arrêter
docker compose down

# Reconstruire après modification du code
docker compose up -d --build

# Accéder au shell du container
docker compose exec app sh

# Voir les logs en temps réel
docker compose logs -f

# Réinitialiser la base de données
docker compose exec app npx prisma migrate reset --force
docker compose exec app npx prisma db seed

# Prisma Studio (interface base de données)
docker compose exec app npx prisma studio
```

---

## Utiliser Neon (cloud) au lieu de PostgreSQL local

Dans `.env`, remplacez :

```env
# Commentez la ligne PostgreSQL local :
# DATABASE_URL=postgresql://omegasen_user:omegasen_secret@postgres:5432/omegasen

# Décommentez Neon :
DATABASE_URL=postgresql://USER:PASSWORD@HOST.neon.tech/neondb?sslmode=require
```

Et dans `docker-compose.yml`, supprimez le service `postgres` et la `depends_on`.

---

## Déploiement sur un VPS (DigitalOcean, OVH, etc.)

```bash
# Sur votre serveur
git clone https://github.com/moustaphakebe1998/omegasen.git
cd omegasen
cp .env.docker .env
nano .env  # Remplir les valeurs

docker compose up -d
```

L'app tourne sur le port **3000**. Ajoutez Nginx en reverse proxy pour le port 80/443.

---

## Nginx (optionnel — pour domaine custom)

```nginx
server {
    listen 80;
    server_name votre-domaine.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
