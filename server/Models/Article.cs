namespace DungeonMaster.Api.Models;

public class Article
{
    public int Id { get; set; }
    public int WorldId { get; set; }
    public World? World { get; set; }
    public int? FolderId { get; set; }
    public Folder? Folder { get; set; }
    public required string Title { get; set; }
    public string Content { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
