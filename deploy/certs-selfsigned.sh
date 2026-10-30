#!/usr/bin/env bash
# Certificado autofirmado para un staging local (NO para producción: usar Let's Encrypt).
# Uso: DOMAIN=staging.local ./deploy/certs-selfsigned.sh
set -euo pipefail
DOMAIN=${DOMAIN:-staging.local}
mkdir -p "$(dirname "$0")/certs"
openssl req -x509 -newkey rsa:2048 -sha256 -days 90 -nodes \
  -keyout "$(dirname "$0")/certs/privkey.pem" -out "$(dirname "$0")/certs/fullchain.pem" \
  -subj "/CN=$DOMAIN" -addext "subjectAltName=DNS:$DOMAIN,DNS:localhost,IP:127.0.0.1"
echo "Certificados en deploy/certs/ para $DOMAIN"
