#!/usr/bin/env bash
set -euo pipefail

backup_root="${BACKUP_ROOT:-data/backups}"
raw_root="${RAW_ROOT:-data/raw}"
database_url="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/my_space}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
target_dir="${backup_root}/${timestamp}"

mkdir -p "${target_dir}"

pg_dump "${database_url}" > "${target_dir}/postgres.sql"

if [ -d "${raw_root}" ]; then
  tar -czf "${target_dir}/raw.tgz" -C "${raw_root}" .
else
  mkdir -p "${raw_root}"
  tar -czf "${target_dir}/raw.tgz" -C "${raw_root}" .
fi

printf 'backup_dir=%s\n' "${target_dir}"
