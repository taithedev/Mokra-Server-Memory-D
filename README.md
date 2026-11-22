# MonkaMemory — private backend for Monka VR

MonkaMemory is the custom backend for **Monka VR only**. It replaces the old PlayFab player-data features using Neon PostgreSQL, while **Photon PUN 2** continues handling multiplayer rooms and gameplay traffic.

## Easiest setup: Windows + Unity (local development)

1. Install **Node.js 22+** if it is not already installed.
2. Open the repository folder and double-click **START-MONKAMEMORY.cmd**.
3. On the first launch, paste your **pooled Neon connection URL** for the existing `MonkaMemory` project, database `monkamemory`. It is stored locally in `backend/.env`, which Git ignores. Never paste that URL into Unity.
4. The launcher generates private secrets, installs Node dependencies and opens the dashboard's one-time owner setup. Choose an administrator username and a strong password.
5. Copy `Unity/Runtime/MonkaMemoryManager.cs` to `Assets/MokraMemory/Runtime/`, and `Unity/Editor/MonkaMemoryWindow.cs` to `Assets/MokraMemory/Editor/`. Or use the **MonkaMemory-Unity-Setup** artifact on the successful GitHub Actions run, which packages both files under `Assets/MokraMemory`.
6. In Unity, open **Monka → Setup MonkaMemory** and click **Install / Repair MonkaMemory**, then **Test Backend**. The local API URL defaults to `http://localhost:8787`.
7. In the Inspector, confirm the auto-detected TextMeshPro UI and cosmetic GameObjects; scene-specific cosmetic links still require assigning the correct objects if their names aren't detected.

The local launcher is useful for **testing on your PC**. It is **not a publicly reachable multiplayer authentication server**: the Photon Cloud cannot call `localhost` on your computer.

## For public Monka VR multiplayer

1. Deploy the **entire repository** to a Node.js 22+ hosting service that supports long-running processes, using `npm start` at the repository root. Keep the root directory `/` because the backend also serves `dashboard/`.
2. Configure these **server-side** variables: `DATABASE_URL` (pooled Neon URL), `AUTH_PEPPER` (64+ hex random chars), `ADMIN_SETUP_TOKEN` (another independent 64+ hex random chars), and `PUBLIC_URL` (your exact public HTTPS origin, without trailing slash). No Neon/owner secrets should be committed to GitHub or placed in Unity. The backend still supports optional `ADMIN_USERNAME`/`ADMIN_PASSWORD` initialization, but the one-time browser setup route is recommended instead.
3. Once deployed, open `https://YOUR_HOST/api/health` to verify `"ok":true`. Use `https://YOUR_HOST/#setup=YOUR_ADMIN_SETUP_TOKEN` once to create the owner account; remove the setup token from your deployment configuration after setup if desired, as it cannot create a second owner.
4. Edit `monkamemory-connection.json` in this repository with `{"apiUrl":"https://YOUR_HOST","version":"1.2.0"}`. This is **public configuration, not a secret**. Open the Unity MonkaMemory Console and click **Sync Hosted API Address**. It sets the URL without copy-pasting in Unity.
5. In the **Photon Dashboard**, set Custom Authentication to **GET** `https://YOUR_HOST/api/v1/photon/auth`, accepting the `ticket` URL parameter. Disable old Photon auto-connect scripts so MonkaMemory can obtain a one-time ticket *before* Photon connects.
6. Test with two separate Unity clients/accounts, the Photon Dashboard, and the owner console.

`PUBLIC_URL` must exactly match the browser's dashboard HTTPS origin because admin sessions use an origin check. Photon custom authentication uses a separate endpoint and does not require the owner's credentials.

## What works in the backend

- Guest identity stored under a local installation secret; persistent Monka ID and 7-day session
- Player data (name, Monka Bucks, owned cosmetics)
- Owner dashboard for players, catalog, bans, currency grants, MOTD, maintenance and minimum client version
- Audit history and server-authoritative currency adjustments
- One-time Photon custom-auth tickets (120 seconds); replay attempts rejected
- Single-instance Node.js SSE dashboard updates; periodic dashboard refresh on Vercel
- Unity C# manager plus installation window and auto-detection of common UI references
- GitHub Actions syntax/static integration checks and ready-to-copy Unity package artifact

## Limitations

The backend must be online for public multiplayer. No hosting account can be provisioned by importing Unity files alone. **Do not put a Neon database password or connection URL in any game client.** Guest accounts have no cross-device account recovery. The real Unity/Photon runtime is not covered by JavaScript syntax tests, and serverless dashboard refresh is polling rather than continuous SSE.

## Developer commands

```sh
npm install
npm test
cd backend
cp .env.example .env
# Set DATABASE_URL, AUTH_PEPPER, ADMIN_SETUP_TOKEN and PUBLIC_URL
npm install
npm run dev
```

After a running API is available, `node tests/smoke.mjs` exercises login, profile persistence and single-use Photon tickets (it creates a test profile).
