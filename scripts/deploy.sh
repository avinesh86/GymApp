#!/bin/bash
# ─── Docker host deployment script ───────────────────────────────────────────
# Run on the server from anywhere: bash scripts/deploy.sh
#
# This script:
# 1. Records the current release so it can be rolled back to
# 2. Pulls latest code from git
# 3. Backs up the database, then checks and applies migrations
# 4. Rebuilds and restarts backend services, then the frontend
# 5. Health-checks the result, and rolls the code back automatically if it fails
#
# Prerequisites:
# - Project checked out on the server, .env configured at project root
# - docker compose stack created at least once (mysql volume exists)
#
# Config via environment:
#   DEPLOY_BRANCH    git branch to deploy      (default: main)
#   HEALTHCHECK_URL  URL that must return 2xx  (default: http://localhost/api/v1/public/health/)
#   HEALTHCHECK_HOST Host header to send with the check. Needed because Django
#                    returns 400 DisallowedHost when the host it sees is absent
#                    from ALLOWED_HOSTS, and "localhost" usually is. Defaults to
#                    the first entry in ALLOWED_HOSTS in .env.
#   BACKUP_DIR       where dumps are written   (default: <project>/backups)
#   SKIP_BACKUP=1    skip the dump (fast redeploys of frontend-only changes)
#
# Exit codes: 0 deployed, 1 deploy failed and code was rolled back,
#             2 deploy failed and rollback also failed (needs a human).

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-http://localhost/api/v1/public/health/}"
BACKUP_DIR="${BACKUP_DIR:-${PROJECT_DIR}/backups}"
SKIP_BACKUP="${SKIP_BACKUP:-0}"

# Django rejects a request whose Host header is not in ALLOWED_HOSTS with a 400,
# so probing http://localhost fails on a server that only allows its public
# name. Borrow the first allowed host from .env unless one was passed in.
if [ -z "${HEALTHCHECK_HOST:-}" ] && [ -f "${PROJECT_DIR}/.env" ]; then
    HEALTHCHECK_HOST="$(
        grep -E '^ALLOWED_HOSTS=' "${PROJECT_DIR}/.env" |
        head -1 | cut -d= -f2- | cut -d, -f1 | tr -d '"'"'"' \r'
    )"
fi

# docker-compose (v1) and docker compose (v2) are both in the wild.
if docker compose version >/dev/null 2>&1; then
    COMPOSE="docker compose"
else
    COMPOSE="docker-compose"
fi

cd "$PROJECT_DIR"

# Populated as the deploy progresses; the failure handler reads them.
PREVIOUS_COMMIT=""
BACKUP_FILE=""
MIGRATIONS_APPLIED="no"

banner() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "$1"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# ─── Rollback ────────────────────────────────────────────────────────────────
# Code is rolled back automatically. The database is NOT: restoring a dump
# discards every write since the deploy started, which is a call a human has to
# make. Migrations are additive in this codebase, so the old code usually runs
# fine against the new schema — the dump is there for when it does not.
rollback() {
    banner "✗ Deploy failed — rolling back to ${PREVIOUS_COMMIT:0:8}"

    if [ -z "$PREVIOUS_COMMIT" ]; then
        echo "No previous commit recorded — nothing to roll back to."
        return 1
    fi

    git reset --hard "$PREVIOUS_COMMIT"
    $COMPOSE build web frontend
    $COMPOSE up -d --force-recreate web worker beat frontend

    echo ""
    echo "▸ Waiting for the rolled-back release..."
    if ! wait_for_health 30; then
        banner "✗✗ Rollback did not come up healthy — manual intervention needed"
        $COMPOSE logs --tail=50 web
        return 1
    fi

    echo "  Rolled back and healthy at $(git log --oneline -1)"

    if [ "$MIGRATIONS_APPLIED" = "yes" ]; then
        echo ""
        echo "⚠ Migrations ran before the failure. The schema is NEWER than the"
        echo "  code now running. If the old code errors against it, restore the"
        echo "  database dump by hand:"
        echo ""
        echo "    $COMPOSE exec -T mysql mysql -u root -p\"\$MYSQL_ROOT_PASSWORD\" \\"
        echo "      \"\$MYSQL_DATABASE\" < ${BACKUP_FILE}"
        echo ""
        echo "  Restoring discards any data written since the deploy started."
    fi
    return 0
}

on_failure() {
    local exit_code=$?
    trap - ERR EXIT
    if rollback; then
        exit 1
    fi
    exit 2
}

wait_for_health() {
    local attempts="$1"
    local curl_args=(-fsS --max-time 5)
    if [ -n "${HEALTHCHECK_HOST:-}" ]; then
        curl_args+=(-H "Host: ${HEALTHCHECK_HOST}")
    fi

    for _ in $(seq 1 "$attempts"); do
        if curl "${curl_args[@]}" "$HEALTHCHECK_URL" >/dev/null 2>&1; then
            return 0
        fi
        sleep 2
    done
    return 1
}

trap on_failure ERR

banner "FitOps Docker Deploy — branch ${DEPLOY_BRANCH}"

# ─── 1. Record the current release ───────────────────────────────────────────
PREVIOUS_COMMIT="$(git rev-parse HEAD)"
echo ""
echo "▸ Current release: $(git log --oneline -1)"

# ─── 2. Pull latest code ─────────────────────────────────────────────────────
echo ""
echo "▸ Pulling latest code..."
git fetch origin "$DEPLOY_BRANCH"
git checkout "$DEPLOY_BRANCH"
git reset --hard "origin/${DEPLOY_BRANCH}"
echo "  Deploying $(git log --oneline -1)"

if [ "$PREVIOUS_COMMIT" = "$(git rev-parse HEAD)" ]; then
    echo "  Already up to date — continuing anyway (rebuild may still be wanted)."
fi

# ─── 3. Back up the database ─────────────────────────────────────────────────
if [ "$SKIP_BACKUP" = "1" ]; then
    echo ""
    echo "▸ Skipping database backup (SKIP_BACKUP=1)."
else
    echo ""
    echo "▸ Backing up the database..."
    mkdir -p "$BACKUP_DIR"
    BACKUP_FILE="${BACKUP_DIR}/pre-deploy-$(date +%Y%m%d-%H%M%S).sql"
    $COMPOSE exec -T mysql sh -c \
        'exec mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" --single-transaction "$MYSQL_DATABASE"' \
        > "$BACKUP_FILE"
    echo "  Wrote $(du -h "$BACKUP_FILE" | cut -f1) to ${BACKUP_FILE}"
fi

# ─── 4. Rebuild the backend image ────────────────────────────────────────────
# web, worker and beat share one image, so a single build covers all three.
echo ""
echo "▸ Rebuilding backend image..."
$COMPOSE build web

# ─── 5. Check migrations before applying them ────────────────────────────────
# The old containers are still serving while this runs, so a bad migration set
# is caught before any traffic sees the new release.
echo ""
echo "▸ Checking for model changes with no migration..."
$COMPOSE run --rm --no-deps -T web python manage.py makemigrations --check --dry-run

echo ""
echo "▸ Migrations to apply:"
$COMPOSE run --rm -T web python manage.py migrate --plan

echo ""
echo "▸ Applying migrations..."
MIGRATIONS_APPLIED="yes"
$COMPOSE run --rm -T web python manage.py migrate --noinput

# ─── 6. Restart services ─────────────────────────────────────────────────────
echo ""
echo "▸ Restarting backend services..."
$COMPOSE up -d --force-recreate web worker beat

# Vite bakes env vars in at build time, so the frontend needs a real rebuild —
# a restart would keep serving the old bundle.
echo ""
echo "▸ Rebuilding frontend..."
$COMPOSE build frontend
$COMPOSE up -d --force-recreate frontend

# ─── 7. Health check ─────────────────────────────────────────────────────────
echo ""
echo "▸ Waiting for ${HEALTHCHECK_URL} (Host: ${HEALTHCHECK_HOST:-none})..."
if ! wait_for_health 30; then
    echo "  No healthy response after 60s."
    echo ""
    echo "▸ Recent web logs:"
    $COMPOSE logs --tail=50 web
    false  # hand over to the ERR trap, which rolls back
fi

trap - ERR EXIT
banner "✓ Deploy complete — $(git log --oneline -1)"
