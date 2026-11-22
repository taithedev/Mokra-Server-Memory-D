#if UNITY_EDITOR
using System;
using System.Linq;
using TMPro;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Networking;

public sealed class MonkaMemoryWindow : EditorWindow
{
    private const string ManifestUrl =
        "https://raw.githubusercontent.com/taithedev/Mokra-Server-Memory-D/main/monkamemory-connection.json";
    private MonkaMemoryManager manager;
    private UnityWebRequest request;
    private UnityWebRequestAsyncOperation operation;
    private bool syncing;
    private string result = "Ready to install.";
    private Vector2 scroll;

    [Serializable] private class ConnectionManifest { public string apiUrl; public string version; }

    [MenuItem("Monka/Setup MonkaMemory")]
    [MenuItem("Monka/MonkaMemory Console")]
    public static void Open()
    {
        var window = GetWindow<MonkaMemoryWindow>("MonkaMemory");
        window.minSize = new Vector2(425f, 525f);
        window.Show();
    }

    private void OnEnable()
    {
        manager = FindObjectsOfType<MonkaMemoryManager>(true).FirstOrDefault();
    }

    private void OnGUI()
    {
        scroll = EditorGUILayout.BeginScrollView(scroll);
        GUILayout.Space(14);
        EditorGUILayout.LabelField("MONKA VR · BACKEND", EditorStyles.miniBoldLabel);
        GUILayout.Label("MonkaMemory", EditorStyles.largeLabel);
        EditorGUILayout.HelpBox(
            "Click one button to create the manager, detect common UI references, and connect Photon after authentication. " +
            "Your Neon credentials stay on the backend, never in Unity.", MessageType.Info);
        GUILayout.Space(10);

        if (GUILayout.Button("1. Install / Repair MonkaMemory", GUILayout.Height(39)))
            Install();
        if (GUILayout.Button("2. Sync Hosted API Address", GUILayout.Height(31)))
            SyncConnectionManifest();
        if (GUILayout.Button("3. Test Backend", GUILayout.Height(31)))
            TestConnection();

        GUILayout.Space(7);
        EditorGUILayout.LabelField("STATUS", EditorStyles.miniBoldLabel);
        EditorGUILayout.HelpBox(result, MessageType.None);

        GUILayout.Space(12);
        manager = (MonkaMemoryManager)EditorGUILayout.ObjectField(
            "Manager in scene", manager, typeof(MonkaMemoryManager), true);

        if (manager != null)
        {
            SerializedObject serialized = new SerializedObject(manager);
            serialized.Update();
            DrawProperty(serialized, "ApiBaseUrl");
            DrawProperty(serialized, "CatalogName");
            DrawProperty(serialized, "CurrencyName");
            DrawProperty(serialized, "StartingUsername");
            DrawProperty(serialized, "RefreshIntervalSeconds");
            DrawProperty(serialized, "ConnectPhotonAutomatically");
            serialized.ApplyModifiedProperties();

            GUILayout.Space(10);
            GUILayout.Label("GAME UI REFERENCES", EditorStyles.boldLabel);
            DrawProperty(serialized, "currencyText");
            DrawProperty(serialized, "MOTDText");
            DrawProperty(serialized, "UserName");
            if (GUILayout.Button("Select Manager in Hierarchy"))
                Selection.activeGameObject = manager.gameObject;

            string baseUrl = manager.ApiBaseUrl == null ? "" : manager.ApiBaseUrl.TrimEnd('/');
            if (Uri.TryCreate(baseUrl, UriKind.Absolute, out Uri uri) &&
                (uri.Scheme == Uri.UriSchemeHttps || uri.Host == "localhost"))
            {
                if (GUILayout.Button("Open Admin Dashboard", GUILayout.Height(27)))
                    Application.OpenURL(baseUrl);
            }
        }
        GUILayout.Space(12);
        EditorGUILayout.HelpBox(
            "Photon PUN 2 still needs Custom Authentication configured once in the Photon Dashboard. " +
            "The URL is your public API followed by /api/v1/photon/auth. " +
            "Only one script should connect to Photon.", MessageType.Warning);
        EditorGUILayout.EndScrollView();
    }

    private static void DrawProperty(SerializedObject serialized, string name)
    {
        serialized.Update();
        SerializedProperty property = serialized.FindProperty(name);
        if (property != null)
        {
            EditorGUILayout.PropertyField(property, true);
            serialized.ApplyModifiedProperties();
        }
    }

    private void Install()
    {
        if (EditorApplication.isPlayingOrWillChangePlaymode)
        {
            result = "Exit Play Mode before installing.";
            return;
        }

        MonkaMemoryManager[] existing = FindObjectsOfType<MonkaMemoryManager>(true);
        if (existing.Length > 1)
        {
            result = "Multiple managers found. Keep one manager to avoid duplicate logins.";
            return;
        }

        manager = existing.FirstOrDefault();
        if (manager == null)
        {
            GameObject gameObject = new GameObject("MonkaMemory Manager");
            Undo.RegisterCreatedObjectUndo(gameObject, "Create MonkaMemory Manager");
            manager = Undo.AddComponent<MonkaMemoryManager>(gameObject);
        }

        Undo.RecordObject(manager, "Configure MonkaMemory");
        manager.ConnectPhotonAutomatically = true;
        manager.CatalogName = string.IsNullOrWhiteSpace(manager.CatalogName) ? "main" : manager.CatalogName;
        manager.CurrencyName = string.IsNullOrWhiteSpace(manager.CurrencyName) ? "Monka Bucks" : manager.CurrencyName;
        manager.StartingUsername = string.IsNullOrWhiteSpace(manager.StartingUsername) ? "Monke" : manager.StartingUsername;
        manager.RefreshIntervalSeconds = Mathf.Max(10f, manager.RefreshIntervalSeconds);
        AutoAssignText();
        MigrateLegacyManager();
        EditorUtility.SetDirty(manager);
        if (manager.gameObject.scene.IsValid()) EditorSceneManager.MarkSceneDirty(manager.gameObject.scene);
        Selection.activeGameObject = manager.gameObject;
        result = "Manager installed. Sync the hosted API address, then press Test Backend.";
        SyncConnectionManifest();
    }

    private void AutoAssignText()
    {
        TextMeshPro[] labels = Resources.FindObjectsOfTypeAll<TextMeshPro>()
            .Where(t => t != null && t.gameObject.scene.IsValid() &&
                        (t.hideFlags & HideFlags.NotEditable) == 0).ToArray();
        if (manager.currencyText == null)
            manager.currencyText = FindLabel(labels, "currency", "coins", "monka bucks");
        if (manager.MOTDText == null)
            manager.MOTDText = FindLabel(labels, "motd", "message of the day");
        if (manager.UserName == null)
            manager.UserName = FindLabel(labels, "username text", "player name", "username");
    }

    private static TextMeshPro FindLabel(TextMeshPro[] labels, params string[] names)
    {
        foreach (string name in names)
            foreach (TextMeshPro label in labels)
                if (label.gameObject.name.IndexOf(name, StringComparison.OrdinalIgnoreCase) >= 0)
                    return label;
        return null;
    }

    private void MigrateLegacyManager()
    {
        MonoBehaviour[] components = Resources.FindObjectsOfTypeAll<MonoBehaviour>();
        MonoBehaviour old = components.FirstOrDefault(component =>
            component != null && component.GetType().Name == "Playfablogin" &&
            !(component is MonkaMemoryManager) && component.gameObject.scene.IsValid());
        if (old == null) return;

        if (!EditorUtility.DisplayDialog("Migrate legacy PlayFab",
            "Your scene contains the old Playfablogin component. Copy its cosmetic, currency and ban UI references " +
            "to MonkaMemory and disable its old login? The original component will be preserved.",
            "Migrate", "Not now"))
            return;

        SerializedObject from = new SerializedObject(old);
        SerializedObject to = new SerializedObject(manager);
        string[] refs = { "specialitems", "disableitems", "currencyText", "MOTDText",
                          "UserName", "StuffToDisable", "StuffToEnable", "StuffToMaterialChange",
                          "MaterialToChangeToo", "BanTimes", "BanReasons", "DDOLObjects" };
        from.Update();
        to.Update();
        foreach (string field in refs)
        {
            SerializedProperty source = from.FindProperty(field);
            SerializedProperty dest = to.FindProperty(field);
            if (source != null && dest != null && source.propertyType == dest.propertyType)
                to.CopyFromSerializedProperty(source);
        }
        to.ApplyModifiedProperties();
        Undo.RecordObject(old, "Disable previous PlayFab manager");
        old.enabled = false;
        EditorUtility.SetDirty(old);
    }

    private void SyncConnectionManifest()
    {
        StartRequest(ManifestUrl, true);
    }

    private void TestConnection()
    {
        if (manager == null) { result = "First click Install / Repair."; return; }
        string baseUrl = manager.ApiBaseUrl == null ? "" : manager.ApiBaseUrl.TrimEnd('/');
        if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out Uri uri) ||
            (uri.Scheme != Uri.UriSchemeHttps && uri.Host != "localhost"))
        {
            result = "No valid hosted API URL yet. Sync it after the backend is deployed.";
            return;
        }
        StartRequest(baseUrl + "/api/health", false);
    }

    private void StartRequest(string url, bool manifest)
    {
        if (request != null) { result = "A connection check is already running."; return; }
        request = UnityWebRequest.Get(url);
        request.timeout = 12;
        syncing = manifest;
        operation = request.SendWebRequest();
        result = manifest ? "Checking published server address…" : "Connecting to MonkaMemory…";
        EditorApplication.update += Poll;
        Repaint();
    }

    private void Poll()
    {
        if (operation == null || !operation.isDone) return;
        EditorApplication.update -= Poll;
        bool success = request.result == UnityWebRequest.Result.Success && request.responseCode == 200;
        string response = request.downloadHandler == null ? "" : request.downloadHandler.text;

        if (!success)
        {
            result = "Connection failed: " + request.error;
        }
        else if (syncing)
        {
            ConnectionManifest link = null;
            try { link = JsonUtility.FromJson<ConnectionManifest>(response); }
            catch (Exception exception) { result = "Invalid public connection file: " + exception.Message; }
            if (link != null && !string.IsNullOrWhiteSpace(link.apiUrl) &&
                Uri.TryCreate(link.apiUrl.TrimEnd('/'), UriKind.Absolute, out Uri uri) &&
                uri.Scheme == Uri.UriSchemeHttps)
            {
                if (manager == null) Install();
                if (manager != null)
                {
                    Undo.RecordObject(manager, "Set MonkaMemory API URL");
                    manager.ApiBaseUrl = uri.AbsoluteUri.TrimEnd('/');
                    EditorUtility.SetDirty(manager);
                    if (manager.gameObject.scene.IsValid())
                        EditorSceneManager.MarkSceneDirty(manager.gameObject.scene);
                    result = "Public API URL linked: " + manager.ApiBaseUrl;
                }
            }
            else result = "The server URL hasn't been published yet. You can still install the manager.";
        }
        else
        {
            result = response.Contains("\"ok\":true") ?
                "Connected: MonkaMemory backend and Neon are responding." :
                "The server returned an unexpected health response.";
        }
        request.Dispose(); request = null; operation = null;
        Repaint();
    }

    private void OnDisable()
    {
        EditorApplication.update -= Poll;
        if (request != null) request.Dispose();
        request = null; operation = null;
    }
}
#endif
