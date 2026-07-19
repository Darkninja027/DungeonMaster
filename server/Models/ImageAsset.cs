namespace DungeonMaster.Api.Models;

public class ImageAsset
{
    public int Id { get; set; }
    public int WorldId { get; set; }
    public World? World { get; set; }
    public required string FileName { get; set; }
    public required string StoredFileName { get; set; }
    public required string ContentType { get; set; }
    public long SizeBytes { get; set; }
    public DateTime UploadedAt { get; set; } = DateTime.UtcNow;
}
