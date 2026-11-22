# MonkaMemory — Monka VR backend

Private game backend and admin dashboard built for Monka VR. Neon PostgreSQL stores player data, inventory, currency, bans and title config. Photon PUN 2 handles real-time multiplayer with single-use custom authentication tickets issued by this API.

## Setup
1. Use the existing Neon project **MonkaMemory** with database **monkamemory**.
2. Deploy the **whole repository** as one long-running Node.js service (Node 22+, start command `npm start` from the repository root). **Leave Railway's Root Directory blank or `/`**, because `backend/server.js` serves the adjacent `dashboard/` folder. Do not use `/backend` as Railway's Root Directory or the dashboard assets will be excluded. GitHub does not itself host the backend.
3. In Railway, generate a public HTTPS domain in Settings → Networking, then set runtime environment variables: `DATABASE_URL` (Neon pooled connection URL), `AUTH_PEPPER` (random 32+ character secret), `ADMIN_USERNAME`, `ADMIN_PASSWORD` (12+ characters for first-time setup), and `PUBLIC_URL` (exact HTTPS origin).
4. `PUBLIC_URL` must be exactly `https://YOUR-RAILWAY-DOMAIN` without a trailing slash (or your custom domain), since the admin login checks browser Origin. Do not commit passwords or Neon credentials. Remove `ADMIN_PASSWORD` from deployment variables after bootstrapping the administrator.
5. Redeploy after variables change. Visit `/api/health` to verify Neon connection, then sign in to the dashboard.
6. In the Photon Dashboard, configure **Custom Authentication** endpoint at `https://YOUR_HOST/api/v1/photon/auth`. Use the ticket parameter supplied by the Unity manager.
7. The repo is only for Monka VR. The API retains compatibility with MonkaMemoryManager.cs and the original Playfablogin.cs fields.

## Features
- Secure HTTP-only admin session, login, logout
- Overview: player totals, recent activity, coins, catalog, bans
- Players: search, inspect, grant/revoke cosmetics, adjust MB coins, permanent/temporary bans
- Cosmetics catalog creation/update, maintenance mode, minimum version, MOTD
- Audit log and SSE dashboard refresh
- Guest login, persistent profiles and session-based player API
- Photon single-use tickets with server-side validation

## Important limitations
MonkaMemory uses a persistent Node.js process and SSE. Do not deploy the backend as a static-only site. This baseline is single-instance; use shared pub/sub/rate limiting before horizontal scaling. Photon realtime rooms are managed by Photon, not the Neon database. Guest profiles do not have cross-device recovery. Full Unity/Photon integration and live hosting require configuration and real client testing.

## Run locally
```bash
cp backend/.env.example backend/.env
# edit backend/.env; never commit it
cd backend
npm install
npm run dev
```
Open http://localhost:8787. For smoke tests run `node tests/smoke.mjs` from the repository root with the API running.
