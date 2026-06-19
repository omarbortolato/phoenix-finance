#!/bin/bash
set -e

echo "▶ Reload servizi..."
docker compose pull
docker compose up -d --build
echo "✓ Reload completato."
