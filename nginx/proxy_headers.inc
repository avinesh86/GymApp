# Shared by every proxied location in nginx.prod.conf.
#
# Host: TenantMiddleware resolves the tenant from it.
# X-Forwarded-Proto: SECURE_PROXY_SSL_HEADER trusts it to decide whether the
# original request was HTTPS, which drives SECURE_SSL_REDIRECT.
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_connect_timeout 60s;
proxy_read_timeout 120s;
