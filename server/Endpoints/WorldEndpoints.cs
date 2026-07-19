using DungeonMaster.Api.Data;
using DungeonMaster.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace DungeonMaster.Api.Endpoints;

public static class WorldEndpoints
{
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
