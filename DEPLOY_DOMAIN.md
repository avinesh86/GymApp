# Hosting FitOps at fitops.northernarena.co.nz

Northern Arena's public website already occupies `northernarena.co.nz` and
`www.northernarena.co.nz`. FitOps is deployed to a **subdomain** rather than a
path on that site.

## Why a subdomain, not northernarena.co.nz/fitops

- **Tenant resolution is Host-based.** `TenantMiddleware._resolve_tenant`
  (`apps/tenants/middleware.py`) looks up `TenantDomain` by
  `request.get_host()`. There is no path-based tenant logic anywhere. A path
  prefix would leave every request on the `_resolve_from_jwt` fallback, which
  cannot resolve a tenant for anonymous requests — login, the public endpoints,
  the SPA shell.
- **The SPA is served from the root.** In production `fitops/urls.py` mounts a
  `SPAView` catch-all at `<path:path>`, and `frontend/src/api/client.ts` hard-codes
  a root-relative `BASE_URL = '/api/v1/'`. A prefix would require changes to the
  Vite `base`, the React Router basename, `FORCE_SCRIPT_NAME`, `STATIC_URL` and an
  nginx rewrite — five places that break URL reversing when any one is wrong.
- **A path prefix means reconfiguring a live business website.** Most hosted
  platforms cannot reverse-proxy a path at all, and it would couple the staff
  tool's uptime to the marketing site's host. Adding a subdomain is additive:
  one DNS record, no risk to the existing site, and no effect on email — the MX
  records live on the apex and are untouched.
- **Token isolation.** `frontend/src/store/auth.ts` persists JWTs in
  origin-scoped browser storage. A separate subdomain is a separate origin, so
  an XSS on the marketing site cannot read staff tokens.

## What serves what

nginx terminates TLS and splits traffic two ways:

| Path | Container | Why |
|---|---|---|
| `/api/`, `/platform-admin/` | `web` (Django) | the API and the admin |
| `/static/`, `/media/` | volumes | Django's collected static and uploads |
| everything else | `frontend` | the React build |

The React app is **not** served by Django here. `SPAView` exists for the
PythonAnywhere deployment, where one process serves both — but the `web`
Docker image never runs `npm run build`, so it has no `index.html` to return
and answers 404. The `frontend` image builds the bundle and serves it.

## Before you start: check the nameservers

In the DiscountDomains control panel, check the **nameservers** for
`northernarena.co.nz`.

- Still pointing at DiscountDomains → add the DNS record there.
- Pointing somewhere else (the web agency's host, Cloudflare) → the record must
  be added **there**. Changing it at DiscountDomains will do nothing.

## 1. DNS

Add a single record. Nothing else on the domain changes.

| Type | Name     | Value                  | TTL |
|------|----------|------------------------|-----|
| A    | `fitops` | *your server's IPv4*   | 3600 |

Confirm it resolves before going further — a certificate request against a
domain that does not yet resolve will fail, and repeated failures hit Let's
Encrypt rate limits:

```bash
dig +short fitops.northernarena.co.nz
```

## 2. Environment

In the server's `.env`:

```ini
DJANGO_SETTINGS_MODULE=fitops.settings.prod
ALLOWED_HOSTS=fitops.northernarena.co.nz
CSRF_TRUSTED_ORIGINS=https://fitops.northernarena.co.nz
```

`ALLOWED_HOSTS` takes bare hostnames; `CSRF_TRUSTED_ORIGINS` requires the
scheme. Without the latter, Django 4.x rejects the `/platform-admin/` login with
*"CSRF verification failed — Origin checking failed"* as soon as TLS is
terminated upstream.

`CORS_ALLOWED_ORIGINS` needs nothing here: Django serves both the API and the
SPA from one origin, so requests are same-origin.

## 3. TLS

Ports 80 and 443 must be reachable from the internet — Let's Encrypt connects
in to verify domain control. Then, once:

```bash
LETSENCRYPT_EMAIL=ops@northernarena.co.nz bash scripts/init-letsencrypt.sh
```

This puts a self-signed placeholder in place so nginx can start, requests the
real certificate over the ACME webroot challenge, and reloads. Renewal is
automatic afterwards via the `certbot` service in `docker-compose.prod.yml`;
nginx reloads every 6 hours to pick up a renewed certificate.

## 4. Register the host against the tenant

`TenantMiddleware` needs a `TenantDomain` row or every request falls back to the
JWT claim:

```bash
docker compose -f docker-compose.prod.yml exec web \
  python manage.py add_tenant_domain \
    --tenant <tenant-slug> \
    --domain fitops.northernarena.co.nz \
    --primary
```

Use `--dry-run` first to check the slug. The command normalises the hostname to
match what the middleware compares against (lowercased, scheme and port
stripped), because a mismatched row fails silently.

## 5. Bring it up

```bash
docker compose -f docker-compose.prod.yml up -d
curl -sSI https://fitops.northernarena.co.nz/ | head -1
```

## Verifying

| Check | Expected |
|---|---|
| `curl -sSI http://fitops.northernarena.co.nz/` | `301` to `https://` |
| `curl -sSI https://fitops.northernarena.co.nz/` | `200`, and a `Strict-Transport-Security` header |
| `https://fitops.northernarena.co.nz/api/v1/...` | resolves to the right tenant |
| `https://www.northernarena.co.nz/` | unchanged |
| Email to the domain | unchanged |

## Notes for later

- **HSTS.** `prod.py` sets `SECURE_HSTS_INCLUDE_SUBDOMAINS`. Served from
  `fitops.northernarena.co.nz` this only covers names beneath it and cannot
  affect the marketing site. If FitOps is ever moved to the apex, revisit —
  the header would then force HTTPS on `www` and every sibling subdomain for a
  year.
- **A second gym.** `northernarena.co.nz` is one tenant's brand. If FitOps is
  sold to another gym, give the product its own domain and serve tenants at
  `<gym>.fitops.example`; `TenantDomain.is_custom` already exists for gyms that
  want to map their own hostname.
- **Wildcard certificates.** A subdomain per tenant needs a wildcard cert, which
  requires a DNS-01 challenge and therefore a DNS provider with an API. If
  DiscountDomains does not offer one, keep registration there and delegate the
  nameservers to a provider that does.
