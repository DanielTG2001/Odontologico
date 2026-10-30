#!/bin/sh
# Backup diario de PostgreSQL (02:00 hora de Ecuador), cifrado con AES-256 si hay clave, con retención.
set -eu
mkdir -p /backups
while true; do
  now_h=$(TZ=America/Guayaquil date +%H)
  if [ "$now_h" = "02" ] || [ ! -f /backups/.first_done ]; then
    ts=$(TZ=America/Guayaquil date +%Y%m%d-%H%M)
    file="/backups/sigo-$ts.dump"
    echo "[backup] $ts iniciando"
    pg_dump -Fc --no-owner -f "$file"
    if [ -n "${BACKUP_ENCRYPTION_KEY:-}" ]; then
      # Cifrado en reposo del respaldo (RNF-04)
      apk add --no-cache openssl >/dev/null 2>&1 || true
      openssl enc -aes-256-cbc -pbkdf2 -salt -in "$file" -out "$file.enc" -pass env:BACKUP_ENCRYPTION_KEY && rm -f "$file"
    fi
    find /backups -name 'sigo-*' -mtime +"${BACKUP_RETENTION_DAYS:-14}" -delete
    touch /backups/.first_done
    echo "[backup] listo"
    sleep 3600
  fi
  sleep 300
done
