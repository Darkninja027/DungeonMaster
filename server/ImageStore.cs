namespace DungeonMaster.Api;

/// <summary>Stores uploaded images on disk under data/uploads/{worldId}/.</summary>
public class ImageStore(IWebHostEnvironment env)
{
    private static readonly Dictionary<string, string> AllowedTypes = new()
    {
        ["image/png"] = ".png",
        ["image/jpeg"] = ".jpg",
        ["image/gif"] = ".gif",
        ["image/webp"] = ".webp",
        ["image/svg+xml"] = ".svg",
    };

    public const long MaxSizeBytes = 20 * 1024 * 1024;

    public string RootPath => Path.Combine(env.ContentRootPath, "data", "uploads");

    public bool IsAllowed(string contentType) => AllowedTypes.ContainsKey(contentType);

    public async Task<string> SaveAsync(int worldId, string contentType, Stream stream)
    {
        var storedName = $"{Guid.NewGuid():N}{AllowedTypes[contentType]}";
        var dir = Path.Combine(RootPath, worldId.ToString());
        Directory.CreateDirectory(dir);
        await using var file = File.Create(Path.Combine(dir, storedName));
        await stream.CopyToAsync(file);
        return storedName;
    }

    public string? GetPath(int worldId, string storedFileName)
    {
        var path = Path.Combine(RootPath, worldId.ToString(), storedFileName);
        return File.Exists(path) ? path : null;
    }

    public void Delete(int worldId, string storedFileName)
    {
        var path = Path.Combine(RootPath, worldId.ToString(), storedFileName);
        if (File.Exists(path)) File.Delete(path);
    }

    public void DeleteWorldFolder(int worldId)
    {
        var dir = Path.Combine(RootPath, worldId.ToString());
        if (Directory.Exists(dir)) Directory.Delete(dir, recursive: true);
    }
}
