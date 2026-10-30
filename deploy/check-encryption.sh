#!/usr/bin/env bash
# Verifica que los datos de PostgreSQL estén sobre un dispositivo cifrado (LUKS/dm-crypt).
# Uso (en el servidor): ./deploy/check-encryption.sh [contenedor_postgres]
set -euo pipefail
CONTAINER=${1:-$(docker ps --format '{{.Names}}' | grep -m1 postgres || true)}
if [ -z "$CONTAINER" ]; then echo "No se encontró el contenedor de PostgreSQL"; exit 1; fi

src=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Source}}{{end}}{{end}}' "$CONTAINER")
echo "Datos de PostgreSQL en el host: $src"
dev=$(df --output=source "$src" | tail -1)
echo "Dispositivo: $dev"

# Recorre la cadena de dispositivos (LVM, particiones…) buscando una capa crypt
if lsblk -s -n -o TYPE "$dev" 2>/dev/null | grep -q crypt; then
  echo "✅ El volumen de PostgreSQL está sobre un dispositivo cifrado (crypt)"
  lsblk -s -o NAME,TYPE,FSTYPE,SIZE "$dev"
  exit 0
fi

echo "⚠️  No se detectó cifrado local (dm-crypt/LUKS)."
echo "   Si el disco es un volumen cifrado del proveedor (EBS cifrado, etc.), verifícalo en su consola"
echo "   y adjunta la captura como evidencia. Ver docs/CIFRADO_DISCO.md"
exit 2
