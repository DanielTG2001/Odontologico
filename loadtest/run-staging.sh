#!/usr/bin/env bash
# Ejecuta la prueba de carga RNF-01/03 contra staging y archiva la evidencia.
#
#   BASE_URL=https://staging.tu-clinica.ec/api \
#   LOADTEST_PASSWORD='...' LOADTEST_MFA_SECRET='...' \
#   [ADMIN_TOKEN=<jwt admin, opcional para /metrics/slo>] [PROFILE=full|short] \
#   ./loadtest/run-staging.sh
#
# Antes (una vez): sembrar datos en staging →  cd backend && npx tsx prisma/seed-loadtest.ts
set -euo pipefail
cd "$(dirname "$0")"

: "${BASE_URL:?Defina BASE_URL (p. ej. https://staging/api)}"
: "${LOADTEST_PASSWORD:?Defina LOADTEST_PASSWORD}"
: "${LOADTEST_MFA_SECRET:?Defina LOADTEST_MFA_SECRET}"
PROFILE=${PROFILE:-full}

case "$BASE_URL" in
  *localhost*|*127.0.0.1*|*staging*|*test*) ;;
  *) read -r -p "BASE_URL no parece staging ($BASE_URL). ¿Continuar? [s/N] " ok; [ "$ok" = "s" ] || exit 1 ;;
esac

stamp=$(date +%Y%m%d-%H%M%S)
out="resultados/$stamp"
mkdir -p "$out"

echo "→ Iniciando sesión como carga@sigo.dental (con TOTP)…"
code=$(node totp.js "$LOADTEST_MFA_SECRET")
login=$(curl -fsS -X POST "$BASE_URL/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"carga@sigo.dental\",\"password\":\"$LOADTEST_PASSWORD\",\"mfaCode\":\"$code\"}")
TOKEN=$(printf '%s' "$login" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);if(!j.accessToken){console.error(JSON.stringify(j));process.exit(1)}process.stdout.write(j.accessToken)})')

echo "→ Obteniendo pacientes de carga…"
PATIENT_IDS=$(curl -fsS "$BASE_URL/patients?search=Carga&limit=100" -H "Authorization: Bearer $TOKEN" \
  | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);const ids=(j.data||j).map(p=>p.id);if(!ids.length){console.error("No hay pacientes: ejecute prisma/seed-loadtest.ts");process.exit(1)}process.stdout.write(ids.join(","))})')
echo "   $(echo "$PATIENT_IDS" | tr ',' '\n' | wc -l) pacientes"

extra=()
if [ "$PROFILE" = "short" ]; then
  # Verificación rápida (5 min) antes de la corrida completa
  extra=(--stage 1m:150 --stage 3m:150 --stage 1m:0)
fi

echo "→ Ejecutando k6 ($PROFILE). Resultados en loadtest/$out"
if command -v k6 >/dev/null; then
  k6 run "${extra[@]}" -e BASE_URL="$BASE_URL" -e TOKEN="$TOKEN" -e PATIENT_IDS="$PATIENT_IDS" \
    --summary-export "$out/summary.json" rnf-load.js | tee "$out/k6.log" || true
else
  docker run --rm -i --network host -v "$PWD:/scripts" -w /scripts grafana/k6:0.54.0 run "${extra[@]}" \
    -e BASE_URL="$BASE_URL" -e TOKEN="$TOKEN" -e PATIENT_IDS="$PATIENT_IDS" \
    --summary-export "$out/summary.json" rnf-load.js | tee "$out/k6.log" || true
fi

if [ -n "${ADMIN_TOKEN:-}" ]; then
  curl -fsS "$BASE_URL/metrics/slo" -H "Authorization: Bearer $ADMIN_TOKEN" > "$out/slo.json" || true
fi

node report.js "$out/summary.json" "$out/slo.json"
