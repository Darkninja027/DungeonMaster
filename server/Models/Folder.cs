namespace DungeonMaster.Api.Models;

public class Folder
{
    public int Id { get; set; }
    public int WorldId { get; set; }
    public World? World { get; set; }
    public int? ParentFolderId { get; set; }
    public Folder? ParentFolder { get; set; }
    public required string Name { get; set; }
    public int SortOrder { get; set; }

    public List<Folder> Children { get; set; } = [];
    public List<Article> Articles { get; set; } = [];
}
