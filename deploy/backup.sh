#!/usr/bin/env bash
# Nightly database backup. Keeps the newest KEEP files.
# Add to cron (crontab -e):   15 3 * * * /opt/irontrack/deploy/backup.sh >> /var/log/irontrack-backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")"
DEST="${BACKUP_DIR:-$PWD/backups}"
KEEP="${KEEP:-14}"
mkdir -p "$DEST"
FILE="$DEST/irontrack-$(date +%Y%m%d-%H%M%S).sql.gz"
docker compose exec -T db pg_dump -U irontrack --no-owner irontrack | gzip > "$FILE.tmp"
# A truncated dump is worse than none, so only keep it if it looks complete.
gzip -t "$FILE.tmp"
mv "$FILE.tmp" "$FILE"
ls -1t "$DEST"/irontrack-*.sql.gz | tail -n +"$((KEEP + 1))" | xargs -r rm --
echo "$(date -Is) backup ok: $FILE ($(du -h "$FILE" | cut -f1))"
