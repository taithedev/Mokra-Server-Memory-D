using System;
using System.Collections;
using System.Collections.Generic;
using System.Text;
using TMPro;
using UnityEngine;
using UnityEngine.Networking;
#if PHOTON_UNITY_NETWORKING
using Photon.Pun;
using Photon.Realtime;
#endif

/// <summary>
/// Monka VR persistence and identity manager. No PlayFab dependency.
/// Do not place database credentials or administrator passwords in Unity.
/// </summary>
public class MonkaMemoryManager : MonoBehaviour
{
    [Header("MONKAMEMORY API")]
    public string ApiBaseUrl = "http://localhost:8787";
    [Min(5)] public float RefreshIntervalSeconds = 15f;
    public bool ConnectPhotonAutomatically = false;
    public bool ShowDebugLogs = true;

    [Header("COSMETICS")]
    public static MonkaMemoryManager instance;
    public string MyMonkaID;
    [Tooltip("Legacy alias for scripts reading the old PlayFab ID. Contains a MonkaMemory UUID.")]
    public string MyPlayFabID;
    public string CatalogName = "main";
    public List<GameObject> specialitems = new List<GameObject>();
    public List<GameObject> disableitems = new List<GameObject>();

    [Header("CURRENCY")]
    public string CurrencyName = "Monka Bucks";
    public TextMeshPro currencyText;
    public int coins;

    [Header("BAN STUFF")]
    public GameObject[] StuffToDisable;
    public GameObject[] StuffToEnable;
    public MeshRenderer[] StuffToMaterialChange;
    public Material MaterialToChangeToo;
    public TextMeshPro[] BanTimes;
    public TextMeshPro[] BanReasons;

    [Header("TITLE DATA")]
    public TextMeshPro MOTDText;

    [Header("PLAYER DATA")]
    public TextMeshPro UserName;
    public string StartingUsername = "Monke";
    public string Name;
    public bool UpdateName;

    [Header("DON'T DESTROY ON LOAD")]
    public GameObject[] DDOLObjects;

    public bool IsAuthenticated { get; private set; }
    public bool IsBanned { get; private set; }
    public string SessionToken { get; private set; }
    public string LastError { get; private set; }
    public event Action OnAuthenticated;
    public event Action OnStateUpdated;

    private const string SecretPlayerPrefsKey = "MonkaMemory_GuestSecret_v1";
    private bool loginRunning;
    private bool refreshRunning;
    private bool photonConnecting;
    private string guestSecret;

    [Serializable] private class GuestRequest { public string guestKey; public string version; public string startingName; }
    [Serializable] private class NameRequest { public string name; }
    [Serializable] private class LoginReply { public string sessionToken; public PlayerState player; }
    [Serializable] private class PlayerState
    {
        public string id;
        public string displayName;
        public int coins;
        public string motd;
        public string[] inventory;
        public InventoryEntry[] inventoryDetails;
    }
    [Serializable] private class InventoryEntry { public string itemId; public string catalog; }
    [Serializable] private class TicketReply { public string ticket; }
    [Serializable] private class ErrorReply
    {
        public string error;
        public string reason;
        public string bannedUntil;
        public string minimumClientVersion;
    }

    protected virtual void Awake()
    {
        if (instance != null && instance != this) { Destroy(gameObject); return; }
        instance = this;
        // Persist the manager itself if it is on a root GameObject.
        if (transform.parent == null) DontDestroyOnLoad(gameObject);
    }

    protected virtual void Start()
    {
        if (instance != this) return;
        if (DDOLObjects != null)
        {
            foreach (GameObject obj in DDOLObjects)
            {
                if (obj == null) continue;
                GameObject root = obj.transform.root.gameObject;
                if (root != gameObject) DontDestroyOnLoad(root);
            }
        }
        login();
    }

    protected virtual void Update()
    {
        if (UpdateName && IsAuthenticated && !IsBanned)
        {
            UpdateName = false;
            SetPlayerName(Name);
        }
    }

    private string Base => (ApiBaseUrl ?? "").TrimEnd('/');
    private string GetOrCreateSecret()
    {
        if (!string.IsNullOrEmpty(guestSecret)) return guestSecret;
        guestSecret = PlayerPrefs.GetString(SecretPlayerPrefsKey, "");
        if (guestSecret.Length != 64)
        {
            guestSecret = (Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N")).ToLowerInvariant();
            PlayerPrefs.SetString(SecretPlayerPrefsKey, guestSecret);
            PlayerPrefs.Save();
        }
        return guestSecret;
    }

    public void login()
    {
        if (!loginRunning && !IsBanned) StartCoroutine(LoginRoutine());
    }

    private IEnumerator LoginRoutine()
    {
        loginRunning = true;
        IsAuthenticated = false;
        GuestRequest request = new GuestRequest { guestKey = GetOrCreateSecret(), version = Application.version, startingName = StartingUsername };
        string response = null;
        long status = 0;
        yield return Request("POST", "/api/v1/auth/guest", JsonUtility.ToJson(request), false,
            (code, text) => { status = code; response = text; });
        if (status == 200)
        {
            LoginReply reply = null;
            try { reply = JsonUtility.FromJson<LoginReply>(response); }
            catch (Exception e) { LastError = e.Message; }
            if (reply != null && reply.player != null && !string.IsNullOrEmpty(reply.sessionToken))
            {
                SessionToken = reply.sessionToken;
                MyMonkaID = reply.player.id;
                MyPlayFabID = MyMonkaID;
                IsAuthenticated = true;
                LastError = null;
                ApplyState(reply.player);
                if (ShowDebugLogs) Debug.Log("[MonkaMemory] Authorized player " + MyMonkaID);
                if (!refreshRunning) StartCoroutine(RefreshLoop());
                OnAuthenticated?.Invoke();
                if (ConnectPhotonAutomatically) ConnectPhoton();
            }
        }
        else HandleApiError(status, response);
        loginRunning = false;
        // Never retry immediately on each frame or recurse into login().
        if (!IsAuthenticated && !IsBanned && status != 426 && status != 503)
            StartCoroutine(RetryLoginAfterDelay());
    }

    private IEnumerator RetryLoginAfterDelay() { yield return new WaitForSecondsRealtime(10f); login(); }

    private IEnumerator Request(string method, string path, string jsonBody, bool authenticated, Action<long, string> completed)
    {
        if (string.IsNullOrEmpty(Base) || !Uri.IsWellFormedUriString(Base, UriKind.Absolute))
        {
            LastError = "Invalid MonkaMemory API URL";
            completed?.Invoke(0, "");
            yield break;
        }
        using (UnityWebRequest request = new UnityWebRequest(Base + path, method))
        {
            request.downloadHandler = new DownloadHandlerBuffer();
            request.timeout = 15;
            if (jsonBody != null)
            {
                request.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(jsonBody));
                request.SetRequestHeader("Content-Type", "application/json");
            }
            if (authenticated && !string.IsNullOrEmpty(SessionToken))
                request.SetRequestHeader("Authorization", "Bearer " + SessionToken);
            yield return request.SendWebRequest();
            completed?.Invoke(request.responseCode, request.downloadHandler != null ? request.downloadHandler.text : "");
        }
    }

    private IEnumerator RefreshLoop()
    {
        refreshRunning = true;
        while (IsAuthenticated && !IsBanned)
        {
            yield return new WaitForSecondsRealtime(Mathf.Max(5f, RefreshIntervalSeconds));
            if (IsAuthenticated && !IsBanned) yield return FetchState();
        }
        refreshRunning = false;
    }

    private IEnumerator FetchState()
    {
        long status = 0;
        string response = null;
        yield return Request("GET", "/api/v1/player/state", null, true, (code, text) => { status = code; response = text; });
        if (status == 200)
        {
            try
            {
                PlayerState state = JsonUtility.FromJson<PlayerState>(response);
                if (state != null) ApplyState(state);
            }
            catch (Exception e) { Debug.LogWarning("[MonkaMemory] State parsing failed: " + e.Message); }
        }
        else if (status == 403 || status == 401) HandleApiError(status, response);
        else if (ShowDebugLogs) Debug.LogWarning("[MonkaMemory] Refresh failed; will retry later (HTTP " + status + ")");
    }

    public void GetVirtualCurrencies() { if (IsAuthenticated) StartCoroutine(FetchState()); }
    public void GetMOTD() { if (IsAuthenticated) StartCoroutine(FetchState()); }
    public void RefreshInventory() { if (IsAuthenticated) StartCoroutine(FetchState()); }

    public void SetPlayerName(string newName)
    {
        if (!IsAuthenticated || IsBanned) return;
        StartCoroutine(SetNameRoutine(newName));
    }

    private IEnumerator SetNameRoutine(string newName)
    {
        long status = 0;
        string body = null;
        yield return Request("PATCH", "/api/v1/player/name", JsonUtility.ToJson(new NameRequest { name = newName }), true,
            (code, text) => { status = code; body = text; });
        if (status == 200) { Name = newName.Trim(); if (UserName != null) UserName.text = Name; }
        else HandleApiError(status, body);
    }

    private void ApplyState(PlayerState state)
    {
        if (state == null) return;
        MyMonkaID = state.id;
        MyPlayFabID = MyMonkaID;
        coins = state.coins;
        Name = string.IsNullOrEmpty(state.displayName) ? StartingUsername : state.displayName;
        if (UserName != null) UserName.text = Name;
        if (currencyText != null) currencyText.text = "You Have : " + coins + " " + CurrencyName;
        if (MOTDText != null) MOTDText.text = state.motd ?? "";
        HashSet<string> owned = new HashSet<string>(StringComparer.Ordinal);
        if (state.inventoryDetails != null)
        {
            foreach (InventoryEntry item in state.inventoryDetails)
                if (item != null && item.catalog == CatalogName && !string.IsNullOrEmpty(item.itemId)) owned.Add(item.itemId);
        }
        // Set both owned and unowned cosmetic states, so revocations are visible immediately.
        if (specialitems != null) foreach (GameObject obj in specialitems) if (obj != null) obj.SetActive(owned.Contains(obj.name));
        if (disableitems != null) foreach (GameObject obj in disableitems) if (obj != null) obj.SetActive(!owned.Contains(obj.name));
        OnStateUpdated?.Invoke();
    }

    private void HandleApiError(long status, string text)
    {
        ErrorReply reply = null;
        try { if (!string.IsNullOrEmpty(text)) reply = JsonUtility.FromJson<ErrorReply>(text); }
        catch { /* fallback to status */ }
        LastError = reply != null ? reply.error : ("HTTP " + status);
        if (reply != null && reply.error == "BANNED") { ShowBan(reply); return; }
        if (status == 401) { SessionToken = null; IsAuthenticated = false; login(); return; }
        if (status == 426) { Debug.LogError("[MonkaMemory] Update required. Minimum version: " + (reply != null ? reply.minimumClientVersion : "unknown")); return; }
        if (status == 503) { Debug.LogWarning("[MonkaMemory] The game is in maintenance mode."); return; }
        Debug.LogWarning("[MonkaMemory] API request failed: " + LastError);
    }

    private void ShowBan(ErrorReply reply)
    {
        IsBanned = true;
        IsAuthenticated = false;
        SessionToken = null;
#if PHOTON_UNITY_NETWORKING
        if (PhotonNetwork.IsConnected) PhotonNetwork.Disconnect();
#endif
        if (StuffToDisable != null) foreach (GameObject obj in StuffToDisable) if (obj != null) obj.SetActive(false);
        if (StuffToEnable != null) foreach (GameObject obj in StuffToEnable) if (obj != null) obj.SetActive(true);
        if (StuffToMaterialChange != null && MaterialToChangeToo != null)
            foreach (MeshRenderer renderer in StuffToMaterialChange) if (renderer != null) renderer.material = MaterialToChangeToo;
        string until = "Permanent Ban";
        if (!string.IsNullOrEmpty(reply.bannedUntil) && DateTime.TryParse(reply.bannedUntil, out DateTime expires))
        {
            TimeSpan remaining = expires.ToUniversalTime() - DateTime.UtcNow;
            until = "Hours Left: " + Mathf.Max(0, Mathf.CeilToInt((float)remaining.TotalHours));
        }
        if (BanTimes != null) foreach (TextMeshPro line in BanTimes) if (line != null) line.text = until;
        if (BanReasons != null) foreach (TextMeshPro line in BanReasons) if (line != null) line.text = "Reason: " + reply.reason;
        Debug.LogWarning("[MonkaMemory] Access blocked by server ban.");
    }

    /// <summary>Obtain a short-lived one-use Photon auth ticket before connecting.</summary>
    public void ConnectPhoton()
    {
        if (!IsAuthenticated || IsBanned || photonConnecting) return;
        StartCoroutine(GetPhotonTicket());
    }

    private IEnumerator GetPhotonTicket()
    {
        photonConnecting = true;
        long status = 0;
        string text = null;
        yield return Request("POST", "/api/v1/player/photon-ticket", "{}", true,
            (code, response) => { status = code; text = response; });
        photonConnecting = false;
        if (status == 200)
        {
            TicketReply ticket = null;
            try { ticket = JsonUtility.FromJson<TicketReply>(text); }
            catch (Exception e) { Debug.LogWarning("[MonkaMemory] Photon ticket parsing failed: " + e.Message); }
            if (ticket == null || string.IsNullOrEmpty(ticket.ticket)) yield break;
#if PHOTON_UNITY_NETWORKING
            if (PhotonNetwork.IsConnected) { Debug.LogWarning("[MonkaMemory] Photon was connected before custom auth was set. Disconnect and reconnect after MonkaMemory login."); yield break; }
            PhotonNetwork.AuthValues = new AuthenticationValues { AuthType = CustomAuthenticationType.Custom };
            PhotonNetwork.AuthValues.AddAuthParameter("ticket", ticket.ticket);
            PhotonNetwork.ConnectUsingSettings();
#else
            Debug.LogWarning("[MonkaMemory] PUN 2 is not installed or PHOTON_UNITY_NETWORKING is missing. Install PUN 2 for Photon integration.");
#endif
        }
        else HandleApiError(status, text);
    }
}