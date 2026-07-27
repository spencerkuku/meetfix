#!/bin/sh
# Dumps the current database to a timestamped, gzip-compressed file in
# /backups, then deletes backups older than BACKUP_RETENTION_DAYS (default
# 14). Reads connection info from the standard libpq PG* env vars set on the
# `backup` service in docker-compose.yml. See README.md "Backups & restore".
set -eu

RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
DUMP="/backups/.meetfix-${TIMESTAMP}.sql"
FILE="/backups/meetfix-${TIMESTAMP}.sql.gz"

# Dump to a plain file first rather than piping straight into gzip: `sh`
# has no `pipefail`, so `pg_dump | gzip > file` would let a failed pg_dump
# still leave behind a "successful" empty/partial .gz. Splitting the steps
# means `set -e` stops the script on a failed dump, before gzip or the
# retention cleanup below ever run.
pg_dump > "$DUMP"
gzip "$DUMP"
mv "${DUMP}.gz" "$FILE"
echo "$(date -Iseconds) backup written to ${FILE}"

find /backups -name 'meetfix-*.sql.gz' -mtime "+${RETENTION_DAYS}" -delete
