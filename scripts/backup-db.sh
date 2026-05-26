#!/bin/bash
# Daily database backup — run via cron
# Usage: 0 3 * * * /root/Efootball-tournament-app/scripts/backup-db.sh

DB_PATH="/root/Efootball-tournament-app/data/efootball.db"
BACKUP_DIR="/root/Efootball-tournament-app/data/backups"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=7

mkdir -p "$BACKUP_DIR"

if [ -f "$DB_PATH" ]; then
  cp "$DB_PATH" "$BACKUP_DIR/efootball_$DATE.db"
  gzip "$BACKUP_DIR/efootball_$DATE.db"
  echo "[$(date)] Backup created: efootball_$DATE.db.gz"
  
  # Remove backups older than RETENTION_DAYS
  find "$BACKUP_DIR" -name "efootball_*.db.gz" -mtime +$RETENTION_DAYS -delete
  echo "[$(date)] Cleaned backups older than $RETENTION_DAYS days"
else
  echo "[$(date)] ERROR: Database file not found at $DB_PATH"
fi
