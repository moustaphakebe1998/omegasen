#!/usr/bin/env bash
# Lance tout l'environnement de développement OmegaSen en une commande.
#
#   ./dev.sh          installe si besoin, démarre base + API + site, Ctrl+C pour tout arrêter
#   ./dev.sh stop     arrête les services restés en arrière-plan (et PostgreSQL/Redis)
#   ./dev.sh reset    comme le premier lancement : recrée la base de démo (efface les données locales)
#
# Journaux : .dev-logs/{api,web,s3}.log
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
LOGS="$ROOT/.dev-logs"
COMPOSE=(docker compose -f docker-compose.dev.yml)
API_PORT=8100 WEB_PORT=3100 S3_PORT=9010

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
ok() { printf '  \033[32m✔\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
die() { printf '\n\033[31m✘ %s\033[0m\n' "$*" >&2; exit 1; }

# Libère un port s'il est occupé par un ancien lancement d'OmegaSen ; sinon s'arrête avec un message clair.
free_port() {
  local port=$1 pids pid cmd
  pids=$(lsof -ti "tcp:$port" -sTCP:LISTEN 2>/dev/null || true)
  [ -z "$pids" ] && return 0
  for pid in $pids; do
    cmd=$(ps -o command= -p "$pid" 2>/dev/null || true)
    # uvicorn --reload sert via un processus enfant « multiprocessing.spawn » : on l'accepte aussi.
    if [[ "$cmd" == *uvicorn* || "$cmd" == *next* || "$cmd" == *moto_server* || "$cmd" == *node* || "$cmd" == *multiprocessing* ]]; then
      kill "$pid" 2>/dev/null || true
      warn "port $port : ancien processus arrêté (PID $pid)"
    else
      die "Le port $port est utilisé par un autre programme (PID $pid : $cmd). Fermez-le puis relancez."
    fi
  done
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    lsof -ti "tcp:$port" -sTCP:LISTEN >/dev/null 2>&1 || return 0
    sleep 0.5
  done
  die "Le port $port reste occupé."
}

wait_http() { # url nom secondes
  local i
  for ((i = 0; i < $3 * 2; i++)); do
    curl -s -o /dev/null --max-time 2 "$1" && return 0
    sleep 0.5
  done
  return 1
}

stop_all() {
  for port in $WEB_PORT $API_PORT $S3_PORT; do
    pids=$(lsof -ti "tcp:$port" -sTCP:LISTEN 2>/dev/null || true)
    [ -n "$pids" ] && kill $pids 2>/dev/null || true
  done
}

case "${1:-}" in
  stop)
    stop_all
    "${COMPOSE[@]}" stop >/dev/null 2>&1 || true
    echo "OmegaSen arrêté."
    exit 0
    ;;
  reset) RESET=1 ;;
  "") RESET=0 ;;
  *) die "Usage : ./dev.sh [stop|reset]" ;;
esac

bold "1/5 Vérifications"
command -v docker >/dev/null || die "Docker n'est pas installé (https://www.docker.com/products/docker-desktop)."
docker info >/dev/null 2>&1 || die "Docker n'est pas démarré : ouvrez Docker Desktop, attendez qu'il soit prêt, puis relancez."
command -v node >/dev/null || die "Node.js n'est pas installé (version 22 recommandée)."
PY=""
for c in python3.12 python3.13 python3; do
  if command -v "$c" >/dev/null && "$c" -c 'import sys; sys.exit(sys.version_info < (3, 12))' 2>/dev/null; then PY=$c; break; fi
done
if [ ! -f .env ]; then cp .env.example .env; ok ".env créé à partir de .env.example"; fi
ok "Docker, Node $(node -v)"

bold "2/5 Dépendances"
if [ ! -x backend/.venv/bin/uvicorn ] || [ ! -x backend/.venv/bin/moto_server ]; then
  [ -n "$PY" ] || die "Python 3.12 ou plus récent est requis (brew install python@3.12)."
  [ -d backend/.venv ] || "$PY" -m venv backend/.venv
  backend/.venv/bin/pip install -q --upgrade pip
  backend/.venv/bin/pip install -q -r backend/requirements-dev.txt
  ok "dépendances Python installées"
else
  ok "dépendances Python déjà installées"
fi
if [ ! -d frontend/node_modules ]; then
  (cd frontend && npm install --no-audit --no-fund --loglevel=error)
  ok "dépendances Node installées"
else
  ok "dépendances Node déjà installées"
fi

bold "3/5 PostgreSQL et Redis"
if [ "$RESET" = 1 ]; then
  stop_all
  "${COMPOSE[@]}" down -v >/dev/null 2>&1 || true
  warn "base locale effacée"
fi
"${COMPOSE[@]}" up -d --wait postgres redis >/dev/null 2>&1 || {
  "${COMPOSE[@]}" up -d --wait postgres redis
  die "Impossible de démarrer PostgreSQL/Redis (voir ci-dessus)."
}
ok "PostgreSQL (port 54330) et Redis (port 63790) prêts"

bold "4/5 Base de données"
(cd backend && .venv/bin/alembic upgrade head) >/dev/null 2>&1 || {
  (cd backend && .venv/bin/alembic upgrade head)
  die "Échec des migrations (voir ci-dessus)."
}
ok "migrations appliquées"

bold "5/5 Démarrage"
mkdir -p "$LOGS"
for port in $S3_PORT $API_PORT $WEB_PORT; do free_port "$port"; done

PIDS=()
cleanup() {
  trap - INT TERM EXIT
  echo
  bold "Arrêt d'OmegaSen…"
  for pid in ${PIDS[@]+"${PIDS[@]}"}; do kill "$pid" 2>/dev/null || true; done
  stop_all
  wait 2>/dev/null || true
  echo "Terminé. (PostgreSQL et Redis restent démarrés ; ./dev.sh stop pour les arrêter.)"
}
trap cleanup INT TERM EXIT

backend/.venv/bin/moto_server -p "$S3_PORT" >"$LOGS/s3.log" 2>&1 &
PIDS+=($!)
wait_http "http://localhost:$S3_PORT" s3 20 || die "Le stockage d'images local ne démarre pas (voir $LOGS/s3.log)."
ok "stockage d'images local  http://localhost:$S3_PORT"

# Après le S3 : la démo y dépose ses photos (et les restaure, le S3 local étant en mémoire).
(cd backend && .venv/bin/python -m app.cli bootstrap >/dev/null && .venv/bin/python -m app.cli seed-demo >/dev/null) ||
  die "Échec de la création des données de démo."
ok "super admin et restaurant de démo (avec photos) en place"

(cd backend && exec .venv/bin/uvicorn app.main:app --port "$API_PORT" --reload) >"$LOGS/api.log" 2>&1 &
PIDS+=($!)
wait_http "http://localhost:$API_PORT/health" api 60 || { tail -20 "$LOGS/api.log"; die "L'API ne démarre pas (voir $LOGS/api.log)."; }
ok "API                      http://localhost:$API_PORT/api/docs"

(cd frontend && exec npm run dev) >"$LOGS/web.log" 2>&1 &
PIDS+=($!)
wait_http "http://localhost:$WEB_PORT" web 90 || { tail -20 "$LOGS/web.log"; die "Le site ne démarre pas (voir $LOGS/web.log)."; }
curl -s -o /dev/null --max-time 60 "http://localhost:$WEB_PORT/r/le-baobab-demo" || true # précompile la page de démo
ok "site                     http://localhost:$WEB_PORT"

SUPER=$(grep -E '^SUPERADMIN_EMAIL=' .env | cut -d= -f2-)
cat <<EOF

$(bold "OmegaSen est prêt → http://localhost:$WEB_PORT")

  Menu client (démo)   http://localhost:$WEB_PORT/r/le-baobab-demo
  Connexion            http://localhost:$WEB_PORT/login
     restaurateur      owner@demo.example.com
     cuisine           cuisine@demo.example.com
     caisse            caisse@demo.example.com
     (mot de passe     Demo!2026pass)
     super admin       ${SUPER:-non défini} (mot de passe : SUPERADMIN_PASSWORD dans .env)

  Journaux : .dev-logs/   ·   Ctrl+C pour tout arrêter
EOF

# Reste au premier plan ; si un service s'arrête, on arrête tout.
while :; do
  for pid in ${PIDS[@]+"${PIDS[@]}"}; do
    if ! kill -0 "$pid" 2>/dev/null; then
      warn "un service s'est arrêté ; dernières lignes des journaux :"
      tail -5 "$LOGS"/*.log
      exit 1
    fi
  done
  sleep 2
done
