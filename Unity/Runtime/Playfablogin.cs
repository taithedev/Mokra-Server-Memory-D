/// <summary>
/// Compatibility shim for legacy scene references to Playfablogin.
/// Replace the old Playfablogin.cs contents with this shim; never keep two classes.
/// </summary>
public class Playfablogin : MonkaMemoryManager
{
    public new static Playfablogin instance;

    protected override void Awake()
    {
        base.Awake();
        if (MonkaMemoryManager.instance == this) instance = this;
    }
}
