#!/usr/bin/env bash
# Obtiene un token para las pruebas de carga.
# Uso: BASE_URL=https://staging/api EMAIL=carga@sigo.dental PASSWORD=... MFA=123456 ./get-token.sh
set -euo pipefail
BASE_URL=${BASE_URL:-http://localhost:4000/api}
body=$(printf '{"email":"%s","password":"%s"%s}' "$EMAIL" "$PASSWORD" "${MFA:+,\"mfaCode\":\"$MFA\"}")
curl -s -X POST "$BASE_URL/auth/login" -H 'Content-Type: application/json' -d "$body" | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p'
