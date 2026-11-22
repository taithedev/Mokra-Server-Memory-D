# MonkaMemory: Unity installation

**You do not link Neon directly to Unity.** Unity sends HTTPS requests to MonkaMemory, and the backend connects to Neon privately.

## One-click install

1. Copy only `Unity/Runtime/MonkaMemoryManager.cs` into `Assets/MokraMemory/Runtime` and `Unity/Editor/MonkaMemoryWindow.cs` into `Assets/MokraMemory/Editor`. Or download and extract the GitHub Actions artifact **MonkaMemory-Unity-Setup** directly into the Unity project root.
2. Let Unity finish importing scripts.
3. Select **Monka → Setup MonkaMemory** → **Install / Repair MonkaMemory**. It creates the manager and attempts to detect the currency, MOTD and username TextMeshPro objects.
4. Test the API connection. For local testing, run `START-MONKAMEMORY.cmd` on the same PC and use the default `http://localhost:8787`. For a hosted backend, publish its URL in `monkamemory-connection.json` and click **Sync Hosted API Address**.
5. Match cosmetics in the manager Inspector to item IDs in the owner dashboard, and assign ban UI objects if needed.

## Old PlayFab components

Do **not** import two `Playfablogin.cs` files. MonkaMemory no longer includes a compiled duplicate compatibility class in its main Runtime folder. The optional shim lives at `Unity/OptionalLegacy/Playfablogin.cs.txt`.

If the wizard detects an old `Playfablogin` component, it offers to copy its UI/cosmetic inspector references and disable the old login **without deleting the component or your scripts**. After verifying your game, remove old PlayFab dependencies if they're no longer needed. If other scripts still require the `Playfablogin` class, rename/use the optional shim only **after** removing the original class definition.

## Photon PUN 2

- Keep PUN 2 installed. Use **Custom Server** authentication in your Photon app with HTTP GET `https://YOUR_PUBLIC_HOST/api/v1/photon/auth`.
- Do not connect Photon from other scripts before MonkaMemory authentication; otherwise the ticket cannot be attached to that connection.
- The manager automatically requests a short-lived ticket and calls `PhotonNetwork.ConnectUsingSettings()` when it has a public HTTPS API URL and auto-connect is enabled.
- Localhost cannot be called by Photon Cloud. Test local database features first, then use hosted HTTPS for multiplayer.
- On PUN 2 builds, verify that the `PHOTON_UNITY_NETWORKING` scripting define is enabled so the optional Photon code compiles.

## Tests and errors

Click **Test Backend** in the window. Verify that player creation, cosmetic grants, currency changes, bans, and Photon login are reflected in a Unity development build. Unity references and scene setup cannot be fully tested by GitHub Actions alone.
