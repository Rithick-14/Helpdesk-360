#!/usr/bin/env bash
set -euo pipefail
BASE="${BASE_URL:-http://localhost:4000/api}"
COOKIE="${COOKIE_FILE:-/tmp/helpdesk-cookie.txt}"
code=$(curl -sS -o /tmp/helpdesk-hostile.json -w '%{http_code}' -b "$COOKIE" -H 'Content-Type: application/json' \
  -d "{\"title\":\"  \",\"description\":\"$(printf 'x%.0s' $(seq 1 10000))\",\"category\":\"hardware\",\"priority\":\"urgent\"}" "$BASE/tickets")
if [ "$code" != 400 ]; then cat /tmp/helpdesk-hostile.json; echo "FAIL: expected HTTP 400, got $code"; exit 1; fi
grep -q 'error' /tmp/helpdesk-hostile.json && echo 'PASS: hostile oversized input rejected with a JSON error'
