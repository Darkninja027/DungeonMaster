using DungeonMaster.Api.Data;
using DungeonMaster.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace DungeonMaster.Api.Endpoints;

public static class WorldEndpoints
{
    private static string EscapeLike(string value) =>
        value.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_");

    public static void MapWorldEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/worlds");

        group.MapGet("/", async (AppDbContext db) =>
            await db.Worlds
                .OrderBy(w => w.Name)
                .Select(w => new WorldSummary(w.Id, w.Name, w.Description, w.CreatedAt, w.Articles.Count))
                .ToListAsync());

        group.MapGet("/{id:int}", async (int id, AppDbContext db) =>
            await db.Worlds.FindAsync(id) is { } world
                ? Results.Ok(new WorldSummary(world.Id, world.Name, world.Description, world.CreatedAt,
                    await db.Articles.CountAsync(a => a.WorldId == id)))
                : Results.NotFound());

        group.MapPost("/", async (WorldInput input, AppDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(input.Name))
                return Results.BadRequest("Name is required.");
            var world = new World { Name = input.Name.Trim(), Description = input.Description?.Trim() ?? "" };
            db.Worlds.Add(world);
            await db.SaveChangesAsync();
            return Results.Created($"/api/worlds/{world.Id}",
                new WorldSummary(world.Id, world.Name, world.Description, world.CreatedAt, 0));
        });

        group.MapPut("/{id:int}", async (int id, WorldInput input, AppDbContext db) =>
        {
            if (await db.Worlds.FindAsync(id) is not { } world) return Results.NotFound();
            if (string.IsNullOrWhiteSpace(input.Name)) return Results.BadRequest("Name is required.");
            world.Name = input.Name.Trim();
            world.Description = input.Description?.Trim() ?? "";
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        group.MapDelete("/{id:int}", async (int id, AppDbContext db, ImageStore images) =>
        {
            if (await db.Worlds.FindAsync(id) is not { } world) return Results.NotFound();
            db.Worlds.Remove(world);
            await db.SaveChangesAsync();
            images.DeleteWorldFolder(id);
            return Results.NoContent();
        });

        // Case-insensitive search across article titles and bodies.
        group.MapGet("/{id:int}/search", async (int id, string q, AppDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(q)) return Results.Ok(new List<SearchResult>());
            var term = q.Trim();
            var pattern = $"%{EscapeLike(term)}%";
            var matches = await db.Articles
                .Where(a => a.WorldId == id &&
                    (EF.Functions.Like(a.Title, pattern, "\\") || EF.Functions.Like(a.Content, pattern, "\\")))
                .OrderBy(a => a.Title)
                .Take(50)
                .Select(a => new { a.Id, a.FolderId, a.Title, a.Content })
                .ToListAsync();
            var results = matches.Select(a =>
            {
                var idx = a.Content.IndexOf(term, StringComparison.OrdinalIgnoreCase);
                var snippet = "";
                if (idx >= 0)
                {
                    var start = Math.Max(0, idx - 40);
                    var length = Math.Min(a.Content.Length - start, term.Length + 120);
                    snippet = (start > 0 ? "…" : "") + a.Content.Substring(start, length).ReplaceLineEndings(" ")
                        + (start + length < a.Content.Length ? "…" : "");
                }
                return new SearchResult(a.Id, a.FolderId, a.Title, snippet);
            }).ToList();
            return Results.Ok(results);
        });

        // Full organisational tree for a world: folders + article summaries.
        group.MapGet("/{id:int}/tree", async (int id, AppDbContext db) =>
        {
            if (!await db.Worlds.AnyAsync(w => w.Id == id)) return Results.NotFound();
            var folders = await db.Folders.Where(f => f.WorldId == id)
                .OrderBy(f => f.SortOrder).ThenBy(f => f.Name)
                .Select(f => new FolderNode(f.Id, f.ParentFolderId, f.Name, f.SortOrder))
                .ToListAsync();
            var articles = await db.Articles.Where(a => a.WorldId == id)
                .OrderBy(a => a.Title)
                .Select(a => new ArticleSummary(a.Id, a.FolderId, a.Title, a.UpdatedAt))
                .ToListAsync();
            return Results.Ok(new WorldTree(folders, articles));
        });
    }
}
