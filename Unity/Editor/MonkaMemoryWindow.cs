#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;
using UnityEngine.Networking;

public class MonkaMemoryWindow : EditorWindow
{
    private MonkaMemoryManager manager;
    private string result = "Not tested";
    private UnityWebRequest request;
    private UnityWebRequestAsyncOperation operation;

    [MenuItem("Monka/MonkaMemory Console")]
    public static void Open()
    {
        MonkaMemoryWindow window = GetWindow<MonkaMemoryWindow>("MonkaMemory");
        window.minSize = new Vector2(390, 400);
    }

    private void OnEnable() { manager = FindObjectOfType<MonkaMemoryManager>(); }

    private void OnGUI()
    {
        GUILayout.Space(12);
        EditorGUILayout.LabelField("MONKA VR / PRIVATE BACKEND", EditorStyles.miniBoldLabel);
        EditorGUILayout.LabelField("MonkaMemory", EditorStyles.largeLabel);
        EditorGUILayout.HelpBox("Neon player data, Monka Bucks, cosmetics, bans and Photon authentication.", MessageType.Info);
        GUILayout.Space(12);
        manager = (MonkaMemoryManager)EditorGUILayout.ObjectField("Manager in scene",manager,typeof(MonkaMemoryManager),true);
        GUILayout.BeginHorizontal();
        if (GUILayout.Button("Find Manager",GUILayout.Height(29))) manager = FindObjectOfType<MonkaMemoryManager>();
        if (GUILayout.Button("Create Manager",GUILayout.Height(29))) CreateManager();
        GUILayout.EndHorizontal();
        if (manager != null)
        {
            GUILayout.Space(12);
            SerializedObject data = new SerializedObject(manager);
            data.Update();
            EditorGUILayout.PropertyField(data.FindProperty("ApiBaseUrl"));
            EditorGUILayout.PropertyField(data.FindProperty("CatalogName"));
            EditorGUILayout.PropertyField(data.FindProperty("CurrencyName"));
            EditorGUILayout.PropertyField(data.FindProperty("StartingUsername"));
            EditorGUILayout.PropertyField(data.FindProperty("RefreshIntervalSeconds"));
            EditorGUILayout.PropertyField(data.FindProperty("ConnectPhotonAutomatically"));
            data.ApplyModifiedProperties();
            if (GUILayout.Button("Select in Hierarchy")) Selection.activeGameObject = manager.gameObject;
            EditorGUILayout.HelpBox("Configure cosmetic GameObjects, banned player UI, and TextMeshPro references in the Inspector.",MessageType.None);
        }
        GUILayout.Space(13);
        if (GUILayout.Button("Test Backend Connection",GUILayout.Height(34))) Check();
        EditorGUILayout.LabelField("API status: " + result,EditorStyles.wordWrappedLabel);
        if (GUILayout.Button("Open Web Dashboard",GUILayout.Height(29)))
            Application.OpenURL(manager != null ? manager.ApiBaseUrl : "http://localhost:8787");
        EditorGUILayout.HelpBox("Do not put Neon database credentials or administrator passwords in your Unity project.",MessageType.Warning);
    }

    private void CreateManager()
    {
        if (manager != null) { Selection.activeGameObject = manager.gameObject; return; }
        GameObject item = new GameObject("MonkaMemory Manager");
        Undo.RegisterCreatedObjectUndo(item,"Create MonkaMemory Manager");
        manager = Undo.AddComponent<MonkaMemoryManager>(item);
        Selection.activeGameObject = item;
    }

    private void Check()
    {
        if (request != null) return;
        string url = manager != null ? manager.ApiBaseUrl : "http://localhost:8787";
        request = UnityWebRequest.Get(url.TrimEnd('/') + "/api/health");
        request.timeout = 12;
        operation = request.SendWebRequest();
        result = "Connecting...";
        EditorApplication.update += Poll;
        Repaint();
    }

    private void Poll()
    {
        if (operation == null || !operation.isDone) return;
        EditorApplication.update -= Poll;
        result = request.result == UnityWebRequest.Result.Success && request.responseCode == 200
          ? "Connected / Neon responding"
          : "Connection failed: " + request.error;
        request.Dispose();request=null;operation=null;
        Repaint();
    }

    private void OnDisable()
    {
        EditorApplication.update -= Poll;
        if (request != null) request.Dispose();
        request=null;operation=null;
    }
}
#endif
