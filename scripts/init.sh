#!/bin/bash
set -e

echo "▶ Avvio phoenix-finance..."
docker compose up -d --build
echo "✓ Servizi avviati."
