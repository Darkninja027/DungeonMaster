namespace DungeonMaster.Api;

public record WorldInput(string Name, string? Description);
public record WorldSummary(int Id, string Name, string Description, DateTime CreatedAt, int ArticleCount);

public record FolderInput(int WorldId, int? ParentFolderId, string Name, int? SortOrder);
public record FolderUpdate(string Name, int? ParentFolderId, int? SortOrder);
public record FolderNode(int Id, int? ParentFolderId, string Name, int SortOrder);

public record ArticleInput(int WorldId, int? FolderId, string Title, string? Content);
public record ArticleUpdate(string Title, string Content, int? FolderId);
public record ArticleSummary(int Id, int? FolderId, string Title, DateTime UpdatedAt);

public record WorldTree(List<FolderNode> Folders, List<ArticleSummary> Articles);

public record ImageInfo(int Id, string FileName, string ContentType, long SizeBytes, DateTime UploadedAt, string Url);
