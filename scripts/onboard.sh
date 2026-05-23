#!/bin/bash
set -e
CLIENT_ID=$1
if [ -z "$CLIENT_ID" ]; then
  echo "Usage: bash scripts/onboard.sh <client_id>"
  exit 1
fi
echo "[onboard] Starting onboard for $CLIENT_ID"
mkdir -p clients/$CLIENT_ID/{session,faq}
if [ ! -f clients/$CLIENT_ID/config.yaml ]; then
  cp templates/config.yaml clients/$CLIENT_ID/config.yaml
  echo "[onboard] Config copied. Edit clients/$CLIENT_ID/config.yaml before launching."
fi
if [ ! -f clients/$CLIENT_ID/.env ]; then
  cp .env clients/$CLIENT_ID/.env
  echo "[onboard] Env copied to client folder."
fi
CLIENT_ID=$CLIENT_ID docker-compose -f docker/docker-compose.yml up -d --build
echo "[onboard] Container launched for $CLIENT_ID"
echo "[onboard] Run: docker logs juru_client to see QR code"
