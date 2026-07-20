namespace DungeonMaster.Api.Models;

public class World
{
    public int Id { get; set; }
    public required string Name { get; set; }
    public string Description { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public List<Folder> Folders { get; set; } = [];
    public List<Article> Articles { get; set; } = [];
    public List<ImageAsset> Images { get; set; } = [];
}
