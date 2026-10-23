#!/bin/bash
# Create a VinOrbits user in the local GoTrue (Supabase Auth). Run on the Ubuntu server:
#   sudo vinorbits-create-user person@example.com
# The password is typed silently (or taken from $VINORBITS_NEW_PASSWORD for automation);
# it is never printed or stored. Sign-up is closed, so this is the only way to add users.
set -euo pipefail

EMAIL="${1:?usage: sudo vinorbits-create-user person@example.com}"
ENV_FILE=/etc/vinorbits/auth.env
API=http://127.0.0.1:9999

if [ "$(id -u)" -ne 0 ]; then echo "Run with sudo." >&2; exit 1; fi

if [ -n "${VINORBITS_NEW_PASSWORD:-}" ]; then
  PASSWORD="$VINORBITS_NEW_PASSWORD"
else
  read -r -s -p "Password (12+ characters): " PASSWORD; echo
  read -r -s -p "Repeat password: " AGAIN; echo
  [ "$PASSWORD" = "$AGAIN" ] || { echo "The passwords do not match." >&2; exit 1; }
fi
[ "${#PASSWORD}" -ge 12 ] || { echo "The password must have at least 12 characters." >&2; exit 1; }

SECRET=$(sed -n 's/^GOTRUE_JWT_SECRET=//p' "$ENV_FILE")
[ -n "$SECRET" ] || { echo "Missing JWT secret in $ENV_FILE." >&2; exit 1; }

b64() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
NOW=$(date +%s)
HEADER=$(printf '{"alg":"HS256","typ":"JWT"}' | b64)
CLAIMS=$(printf '{"role":"service_role","aud":"authenticated","iss":"vinorbits-admin","iat":%s,"exp":%s}' "$NOW" "$((NOW + 120))" | b64)
SIGNATURE=$(printf '%s.%s' "$HEADER" "$CLAIMS" | openssl dgst -sha256 -hmac "$SECRET" -binary | b64)
TOKEN="$HEADER.$CLAIMS.$SIGNATURE"

BODY=$(EMAIL="$EMAIL" PASSWORD="$PASSWORD" python3 -c 'import json,os;print(json.dumps({"email":os.environ["EMAIL"].strip().lower(),"password":os.environ["PASSWORD"],"email_confirm":True}))')
STATUS=$(curl -s -o /tmp/vinorbits-create-user.out -w '%{http_code}' -X POST "$API/admin/users" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' --data "$BODY")

if [ "$STATUS" = "200" ] || [ "$STATUS" = "201" ]; then
  echo "User created: $EMAIL"
else
  echo "Could not create the user (HTTP $STATUS):" >&2
  python3 -c 'import json;d=json.load(open("/tmp/vinorbits-create-user.out"));print(d.get("msg") or d.get("message") or d)' >&2 || true
  rm -f /tmp/vinorbits-create-user.out
  exit 1
fi
rm -f /tmp/vinorbits-create-user.out
