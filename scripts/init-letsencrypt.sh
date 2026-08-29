#!/bin/bash
# ─── One-time TLS bootstrap for fitops.northernarena.co.nz ───────────────────
# Run on the server, once, before the first HTTPS deploy:
#
#     bash scripts/init-letsencrypt.sh
#
# Solves the chicken-and-egg problem: nginx will not start without the
# certificate files that nginx.prod.conf references, but certbot cannot obtain
# a certificate without nginx answering the ACME challenge on port 80.  So we
# put a self-signed placeholder in place, start nginx, swap in the real
# certificate, and reload.
#
# Prerequisites:
#   - DNS A record for the domain already resolves to this server
#   - Ports 80 and 443 reachable from the internet (Let's Encrypt connects in)
#   - docker compose available, run from the repository root
#
# Renewal is automatic thereafter — see the certbot service in
# docker-compose.prod.yml.  This script is not needed again.

set -euo pipefail

DOMAIN="${DOMAIN:-fitops.northernarena.co.nz}"
EMAIL="${LETSENCRYPT_EMAIL:-}"
COMPOSE="docker compose -f docker-compose.prod.yml"
CERT_PATH="/etc/letsencrypt/live/$DOMAIN"

if [ -z "$EMAIL" ]; then
    echo "ERROR: set LETSENCRYPT_EMAIL so Let's Encrypt can warn you before expiry."
    echo "       LETSENCRYPT_EMAIL=ops@northernarena.co.nz bash scripts/init-letsencrypt.sh"
    exit 1
fi

echo "==> Checking $DOMAIN resolves to this server"
RESOLVED="$(getent hosts "$DOMAIN" | awk '{print $1}' | head -1 || true)"
if [ -z "$RESOLVED" ]; then
    echo "ERROR: $DOMAIN does not resolve. Add the DNS A record first and wait for"
    echo "       propagation — issuance will fail and repeated failures hit rate limits."
    exit 1
fi
echo "    resolves to $RESOLVED"

echo "==> Creating a self-signed placeholder so nginx can start"
$COMPOSE run --rm --entrypoint "\
  sh -c 'mkdir -p $CERT_PATH && \
         openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
           -keyout $CERT_PATH/privkey.pem \
           -out $CERT_PATH/fullchain.pem \
           -subj \"/CN=$DOMAIN\"'" certbot

echo "==> Starting nginx"
$COMPOSE up -d nginx

echo "==> Removing the placeholder and requesting the real certificate"
$COMPOSE run --rm --entrypoint "rm -rf /etc/letsencrypt/live/$DOMAIN \
  /etc/letsencrypt/archive/$DOMAIN /etc/letsencrypt/renewal/$DOMAIN.conf" certbot

$COMPOSE run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
    --email $EMAIL \
    -d $DOMAIN \
    --rsa-key-size 4096 \
    --agree-tos \
    --no-eff-email" certbot

echo "==> Reloading nginx with the real certificate"
$COMPOSE exec nginx nginx -s reload

echo
echo "Done. Verify with:  curl -sSI https://$DOMAIN/ | head -1"
