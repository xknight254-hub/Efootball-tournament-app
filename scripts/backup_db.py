#!/usr/bin/env python3
"""Daily database backup script for TOSS efootball app.
Keeps 7 days of backups, auto-cleans older ones.
Designed to be run via supervisord or cron.
"""

import os
import sys
import sqlite3
import shutil
from datetime import datetime, timedelta
from pathlib import Path

DB_PATH = os.environ.get("DB_PATH", "/root/Efootball-tournament-app/data/efootball.db")
BACKUP_DIR = os.environ.get("BACKUP_DIR", "/root/Efootball-tournament-app/data/backups")
RETENTION_DAYS = 7


def backup():
    db_file = Path(DB_PATH)
    if not db_file.exists():
        print("[backup] DB not found, skipping")
        return

    backup_dir = Path(BACKUP_DIR)
    backup_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    backup_file = backup_dir / f"efootball_{timestamp}.db"

    # Use SQLite backup API for a consistent copy
    source = sqlite3.connect(str(db_file))
    dest = sqlite3.connect(str(backup_file))
    source.backup(dest)
    dest.close()
    source.close()

    size_kb = backup_file.stat().st_size // 1024
    print(f"[backup] Created: {backup_file.name} ({size_kb}KB)")

    # Clean up old backups
    cutoff = datetime.now() - timedelta(days=RETENTION_DAYS)
    cleaned = 0
    for f in backup_dir.glob("efootball_*.db"):
        try:
            date_str = f.stem.replace("efootball_", "")
            file_date = datetime.strptime(date_str, "%Y-%m-%d_%H-%M-%S")
            if file_date < cutoff:
                f.unlink()
                cleaned += 1
        except ValueError:
            continue

    if cleaned:
        print(f"[backup] Cleaned {cleaned} old backup(s)")

    total = len(list(backup_dir.glob("efootball_*.db")))
    print(f"[backup] Total backups: {total}")


if __name__ == "__main__":
    backup()
