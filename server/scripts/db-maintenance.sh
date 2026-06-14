#!/usr/bin/env bash
# One-off (or occasional) DB shrink for the Pi. The app prunes hourly, but
# SQLite never returns freed pages to the filesystem — after the first prune
# of a long-unpruned database, run this to VACUUM the file back down.
#
# Stops home-fairy for the duration (VACUUM wants exclusive access), takes a
# timestamped backup first, prunes to the same retention the app enforces,
# then VACUUMs and refreshes planner stats.
set -euo pipefail

DB="$(dirname "$0")/../data/thefairies.sqlite"
[ -f "$DB" ] || { echo "No database at $DB"; exit 1; }

STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP="${DB}.backup-${STAMP}"

echo "Stopping home-fairy..."
pm2 stop home-fairy
# set -e + EXIT trap: whatever happens below (backup or VACUUM failure,
# Ctrl-C), home-fairy comes back up.
trap 'pm2 start home-fairy' EXIT

echo "Backing up to ${BACKUP}..."
sqlite3 "$DB" ".backup '${BACKUP}'"

echo "Pruning (logs 30d, device_history 60d, room_activity 60d)..."
sqlite3 "$DB" <<'SQL'
DELETE FROM logs WHERE created_at < datetime('now', '-30 days');
DELETE FROM device_history WHERE recorded_at < datetime('now', '-60 days');
DELETE FROM room_activity WHERE recorded_at < datetime('now', '-60 days');
SQL

echo "VACUUM + ANALYZE (can take a minute on a large file)..."
sqlite3 "$DB" "VACUUM; ANALYZE;"

echo "Done. New size: $(du -h "$DB" | cut -f1). Backup kept at ${BACKUP} — delete it once happy."
echo "Restarting home-fairy (EXIT trap)..."
