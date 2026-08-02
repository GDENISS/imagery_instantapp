# Deploying the Sentinel-2 Explorer to a VPS

The app is a **static bundle**. There is no server runtime, no database and nothing to keep alive —
Nginx only has to serve files. Everything below is therefore about packaging, TLS and DNS rather than
about running an application.

One consequence is worth understanding up front: **the app is configured at build time, not at run
time.** Webpack inlines the values from the env file via `DefinePlugin`, so an image is tied to one
ArcGIS app id and one service URL. Changing either means rebuilding, not restarting.

---

## 1. Before you build

### 1.1 Create `.env.production`

Copy `.env.template` to `.env.production` in the repository root and fill in the Sentinel-2 section.
It is not committed to git.

```bash
SENTINEL2_EXPLORER_APP_ID   = <your ArcGIS OAuth client id>
SENTINEL2_PROXY_SERVICE_URL = <your proxy service URL>
```

These values are **not secrets** — they ship inside the JavaScript bundle regardless — but keep the
file out of git so environments stay independent.

### 1.2 Add the production redirect URI to your ArcGIS app

This is the step people forget, and it fails at the login screen.

Your OAuth app currently only trusts `https://localhost:8080`. Add your production origin:

```
https://s2.example.com
```

ArcGIS Online → your app item → **Settings → App Registration → Registered Info → Update** →
add it under **Redirect URIs**. No trailing slash, and `https` — ArcGIS rejects `http` for anything
but localhost.

You can verify a redirect URI is accepted without touching the app:

```bash
curl -s "https://www.arcgis.com/sharing/rest/oauth2/authorize?client_id=<CLIENT_ID>&response_type=token&redirect_uri=https%3A%2F%2Fs2.example.com&f=json"
```

A JSON error naming `redirect_uri` means it is not registered yet. HTML for a sign-in page means it is.

### 1.3 Point DNS at the VPS

An `A` record for `s2.example.com` → your Contabo IPv4 (and `AAAA` → IPv6 if you use it). Let TLS
issuance wait until this resolves, or the certificate request will fail.

---

## 2. Build and run

From the **repository root**:

```bash
docker compose -f deploy/docker-compose.yml up -d --build
```

This produces a ~60 MB image and publishes it on `127.0.0.1:8090`. Check it:

```bash
curl -I http://127.0.0.1:8090/
```

`HTTP/1.1 200 OK` means the container is fine and everything remaining is reverse-proxy work.

> **Low-RAM VPS:** the ArcGIS bundle is heavy to compile. The Dockerfile already sets
> `NODE_OPTIONS=--max-old-space-size=4096`. If the build is killed, either raise it, add swap, or
> build the image elsewhere and `docker save`/`docker load` it across.

---

## 3. Exposing it — the part specific to your host

**Port 80 on your VPS is already taken** by `rapida_backend_nginx_1`, so a new Nginx or a standard
Certbot HTTP-01 challenge cannot bind it. Port **443 appears free** — no container in your `docker ps`
publishes it. Confirm before choosing:

```bash
sudo ss -tlnp | grep -E ':(80|443)\b'
```

### Option A — put it behind the Nginx that already owns port 80

Best if you want everything reachable on one hostname and normal HTTP→HTTPS behaviour. Add a vhost to
the existing edge Nginx proxying to this container, and issue the certificate through that Nginx.

Attach both to a shared Docker network and proxy by container name:

```nginx
server {
    listen 80;
    server_name s2.example.com;

    location / {
        proxy_pass http://sentinel2explorer:80;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Trade-off: it means editing another project's running config. Take a backup first.

### Option B — standalone on port 443 with Caddy (default, already wired up)

Self-contained: it cannot break the revenue-system or geonode stacks, and changes nothing that is
already running. Caddy obtains its certificate over **TLS-ALPN-01**, which uses port 443 only and
never needs port 80.

This is already configured — `deploy/docker-compose.yml` includes the `caddy` service and
`deploy/Caddyfile` has the config. **Edit two placeholders in `deploy/Caddyfile` before starting:**

```caddyfile
email you@example.com     # your address, for Let's Encrypt expiry warnings
s2.example.com { ... }    # your domain, which must already resolve to this server
```

Two settings in there are doing load-bearing work on this particular host, so do not remove them:

| Setting | Why |
|---|---|
| `auto_https disable_redirects` | Caddy otherwise tries to bind port 80 for the HTTP→HTTPS redirect and **fails to start**, because `rapida_backend_nginx_1` already has it |
| `disable_http_challenge` | The HTTP-01 challenge needs port 80. TLS-ALPN-01 runs entirely over 443 |

The `caddy_data` volume holds the certificates and **must** persist — without it Caddy re-requests a
certificate on every restart and will eventually hit Let's Encrypt rate limits.

The catch: with port 80 owned by another service, plain `http://s2.example.com` lands on that other
app rather than redirecting. Only advertise the `https://` URL.

If you pick Option A instead, delete the `caddy` service from the compose file.

---

## 4. Verify

```bash
curl -I https://s2.example.com/
curl -s https://s2.example.com/public/locales/en/common.json | head -c 80
```

The second matters: the i18n files are fetched at **runtime**, not bundled. If they 404, the UI renders
with raw translation keys instead of text.

In the browser, confirm:

1. The page loads and redirects you to ArcGIS sign-in
2. After signing in you land back on the app — a failure here is almost always the redirect URI
3. The renderer grid shows EVI, MSAVI2, NDRE with colour-ramp thumbnails
4. **Analysis → Parcel / report** draws and uploads a parcel

---

## 5. Updating

```bash
git pull
docker compose -f deploy/docker-compose.yml up -d --build
```

Old assets keep content-hashed names and `index.html` is served `no-store`, so browsers pick up a new
deployment on the next load without a hard refresh.

---

## ⚠️ Read this before making the site public

The app reaches Sentinel-2 imagery through **your** ArcGIS proxy item, which has your credentials
embedded. Access control on that item is the only thing standing between the internet and your
subscription.

If you resolve the current `403 You do not have permissions` by **sharing the proxy item publicly**,
then once this site is on a public domain, anyone who finds it — or simply extracts the proxy URL from
the JavaScript bundle, where it is plainly visible — can consume Sentinel-2 imagery on your account.
Esri accepts that trade-off for their own public demo. For a private or internal deployment it is the
wrong one.

The alternative is to keep the item private and have the app send the signed-in user's token, so
requests authenticate as a real user and the item's sharing rules apply normally. That is a code
change to four call sites (scene query, `getSamples`, `identify`, `exportImage`) and it is still
pending.

**Decide this before pointing a public DNS record at the server.**
