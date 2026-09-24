# Deploying SpeedTyper (Dokploy + Traefik + Cloudflare)

The app is a single container (`web`) plus PostgreSQL 17 (`postgres`). HTTP and
the race websocket (`/ws`) are served by the same Node process on port 3000.

## 1. Prerequisites

- A Dokploy server (Traefik is installed by Dokploy and attached to the external
  docker network `dokploy-network`).
- DNS: `speedtyper.uz` and `www.speedtyper.uz` → server IP (A/AAAA records).
  With Cloudflare proxy enabled use SSL mode **Full (strict)**. WebSockets are
  enabled by default on Cloudflare.

## 2. Create the app in Dokploy

1. **Create project → Compose** and point it at this repository (branch `main`),
   compose path `docker-compose.yml`.
2. **Environment** (Dokploy "Environment" tab):

   ```env
   APP_URL=https://speedtyper.uz
   POSTGRES_PASSWORD=<openssl rand -base64 32>
   SESSION_SECRET=<openssl rand -base64 48>
   TLS_CERT_RESOLVER=letsencrypt
   ```

   Optional: `POSTGRES_USER`, `POSTGRES_DB`, `TRUSTED_PROXIES`, `TRUST_CLOUDFLARE`,
   `WS_MAX_CONN_PER_IP`, `WS_ALLOWED_ORIGINS`, `SKIP_MIGRATIONS` (see `.env.example`).
3. **Deploy.** On start the container runs `prisma migrate deploy` and then
   `node dist/server.cjs`. The Docker healthcheck calls `GET /api/health`
   (returns `503` while the database is unreachable).

The compose file already contains the Traefik labels:

| Router | Entrypoint | What it does |
|---|---|---|
| `speedtyper-http` | `web` | redirects `http://` → `https://` |
| `speedtyper` | `websecure` | TLS via `${TLS_CERT_RESOLVER:-letsencrypt}`, `www.` → apex redirect, service port 3000 |

Websockets need no extra Traefik configuration: Traefik forwards the
`Upgrade` handshake for `/ws` to the same service.

If you prefer Dokploy "Domains" UI instead of labels, remove the `traefik.*`
labels and add the domain `speedtyper.uz` (port 3000, HTTPS on) in the UI.

## 3. Real client IPs

The server only honours `X-Forwarded-For` when the TCP peer is in
`TRUSTED_PROXIES` (defaults to private/docker ranges, i.e. Traefik). It walks
the chain right-to-left skipping trusted hops; if the first untrusted hop is a
Cloudflare edge address (built-in list of Cloudflare ranges) it uses
`CF-Connecting-IP`. Clients cannot spoof their IP by sending these headers
directly. The resolved IP is used for login/registration rate limits and
websocket connection limits.

## 4. Security notes

- Sessions: random 256-bit token in an `httpOnly`, `SameSite=Lax`, `Secure`
  (when `APP_URL` is https) cookie; only `HMAC-SHA256(SESSION_SECRET, token)` is
  stored. Sessions slide for 30 days and are re-keyed at most once a day on API
  calls; login always issues a fresh session.
- Passwords: argon2id (19 MiB, t=2).
- CSRF: double-submit token (`st_csrf` cookie + `x-csrf-token` header) and
  Origin check on every mutation.
- Rate limits: login 5 failures / 15 min per IP+account and 30 / 15 min per IP;
  registration 10 / hour per IP; results 12 / min per user; websocket upgrades
  60 / min per IP.
- CSP with per-request nonce: scripts from self (+ Cloudflare Insights), connect
  to self / same-host ws(s), no framing.

## 5. Operations

```bash
# logs
docker compose logs -f web
# database backup
docker compose exec postgres pg_dump -U speedtyper speedtyper > backup.sql
# restore
cat backup.sql | docker compose exec -T postgres psql -U speedtyper speedtyper
# ban a cheater (hidden from leaderboards, sessions rejected)
docker compose exec postgres psql -U speedtyper -c "update users set banned = true where username_lower = 'name';"
```

Flagged results (`results.flagged = true`, reason in `flag_reason`) are saved
but excluded from leaderboards.

## 6. Capacity

One process comfortably handles many rooms: the load test (`scripts/race-load.ts`)
ran 1 room × 200 players with p99 snapshot latency ≈ 14 ms and ~4 % average CPU,
and 5 rooms × 200 players (1000 sockets) with p99 ≈ 36 ms and ~14 % average CPU
on a laptop. Memory stays around 200 MB RSS.
