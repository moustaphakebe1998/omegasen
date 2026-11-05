#!/bin/sh
# Sauvegarde quotidienne de PostgreSQL au format custom (restauration : pg_restore -d $PGDATABASE fichier.dump)
set -eu
mkdir -p /backups/db
while true; do
  file="/backups/db/omegasen-$(date +%Y%m%d-%H%M%S).dump"
  if pg_dump --format=custom --no-owner --file="$file.tmp"; then
    mv "$file.tmp" "$file"
    echo "[db-backup] $(date -Iseconds) OK $file"
  else
    rm -f "$file.tmp"
    echo "[db-backup] $(date -Iseconds) ÉCHEC" >&2
  fi
  find /backups/db -name 'omegasen-*.dump' -mtime +"${BACKUP_RETENTION_DAYS:-14}" -delete
  sleep 86400
done
