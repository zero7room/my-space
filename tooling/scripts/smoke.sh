#!/usr/bin/env bash
# End-to-end smoke: creates a thread, posts a message, reads it back.
# Assumes bot-runtime is listening on $RUNTIME_URL with LOCAL_USER_TOKENS set.
#
# Usage:
#   ./tooling/scripts/smoke.sh

set -euo pipefail

RUNTIME_URL="${RUNTIME_URL:-http://localhost:4000}"
TOKEN="${DEV_BEARER:-dev-token}"
AUTH=(-H "Authorization: Bearer ${TOKEN}")
JSON=(-H 'Content-Type: application/json')

say() { printf '\n== %s ==\n' "$*"; }

say 'health'
curl -fsS "${RUNTIME_URL}/api/runtime/health"

say 'whoami'
curl -fsS "${AUTH[@]}" "${RUNTIME_URL}/api/users/me"

say 'create thread'
THREAD_JSON=$(curl -fsS "${AUTH[@]}" "${JSON[@]}" \
  -d '{"title":"smoke","initialMessage":"hello"}' \
  "${RUNTIME_URL}/api/threads")
echo "${THREAD_JSON}"
THREAD_ID=$(printf '%s' "${THREAD_JSON}" | sed -E 's/.*"id":"([^"]+)".*/\1/')

say 'list threads'
curl -fsS "${AUTH[@]}" "${RUNTIME_URL}/api/threads"

say 'post message'
curl -fsS "${AUTH[@]}" "${JSON[@]}" \
  -d '{"text":"another one"}' \
  "${RUNTIME_URL}/api/threads/${THREAD_ID}/messages"

say 'metrics head'
curl -fsS "${RUNTIME_URL}/api/runtime/metrics" | head -20

say 'ok'
