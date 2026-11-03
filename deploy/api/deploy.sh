#!/usr/bin/env bash
# Deploys the API on the EC2 box: what the GitHub Actions workflow runs over
# SSH on every push to main (docs/DEPLOYMENT.md). Idempotent — safe to run by
# hand: `bash ~/reclit/deploy/api/deploy.sh`.
#
#   1. reset the checkout to origin/main (the server never has local changes)
#   2. install dependencies and regenerate the Prisma client
#   3. apply pending migrations to the database
#   4. restart the systemd service and wait for /health
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/reclit}"
BRANCH="${BRANCH:-main}"
SERVICE="reclit-api"
HEALTH_URL="http://127.0.0.1:4001/health"

cd "$APP_DIR"
echo "==> fetching $BRANCH"
git fetch --quiet origin "$BRANCH"
git reset --quiet --hard "origin/$BRANCH"
echo "    at $(git log --oneline -1)"

echo "==> installing dependencies"
# Not --frozen-lockfile: bun may re-resolve an unpinned @types package on
# Linux; the next deploy's reset discards that drift.
bun install --silent

cd apps/api
echo "==> generating the Prisma client"
bunx prisma generate >/dev/null

echo "==> applying migrations"
bunx prisma migrate deploy

echo "==> restarting $SERVICE"
sudo systemctl restart "$SERVICE"

for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null "$HEALTH_URL"; then
    echo "==> healthy: $(curl -fsS "$HEALTH_URL")"
    exit 0
  fi
  sleep 1
done
echo "!! $SERVICE did not answer $HEALTH_URL within 30 s" >&2
sudo journalctl -u "$SERVICE" -n 50 --no-pager >&2
exit 1
