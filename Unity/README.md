# Unity integration for Monka VR

1. Copy the files in Unity/Runtime to Assets/MokraMemory/Runtime and Unity/Editor to Assets/MokraMemory/Editor.
2. If you already have Playfablogin.cs in Unity, **replace its file contents** with the compatibility shim. Never keep both implementations of Playfablogin.
3. Open the Unity menu Monka > MonkaMemory Console to create a manager, set the public API URL, and test /api/health.
4. In your scene, connect TextMeshPro, cosmetics, ban UI, catalog name and inventory references via the manager inspector.
5. In the Photon dashboard, configure Photon PUN 2 **Custom Authentication** at https://YOUR_PUBLIC_API/api/v1/photon/auth, with a GET parameter named ticket.
6. Disable any old Photon auto-connect that runs before MonkaMemoryManager authenticates; either enable ConnectPhotonAutomatically or call ConnectPhoton() after a successful MonkaMemory login. Photon auth tickets are one-use and expire in 120 seconds.
7. If your project is using Photon PUN 2, ensure the PHOTON_UNITY_NETWORKING define is enabled; otherwise the manager compiles without Photon integration and logs an instruction.
8. Test in Unity Editor and a development build with two accounts. This repository has static checks but cannot guarantee compilation with every Unity/PUN version.

Unity should never connect directly to Neon using database credentials.
