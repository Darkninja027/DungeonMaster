using DungeonMaster.Api.Data;
using DungeonMaster.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace DungeonMaster.Api.Endpoints;

public static class FolderEndpoints
{
    public static void MapFolderEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/folders");

        group.MapPost("/", async (FolderInput input, AppDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(input.Name)) return Results.BadRequest("Name is required.");
            if (!await db.Worlds.AnyAsync(w => w.Id == input.WorldId)) return Results.BadRequest("World does not exist.");
            if (input.ParentFolderId is { } parentId &&
                !await db.Folders.AnyAsync(f => f.Id == parentId && f.WorldId == input.WorldId))
                return Results.BadRequest("Parent folder does not exist in this world.");

            var folder = new Folder
            {
                WorldId = input.WorldId,
                ParentFolderId = input.ParentFolderId,
                Name = input.Name.Trim(),
                SortOrder = input.SortOrder ?? 0,
            };
            db.Folders.Add(folder);
            await db.SaveChangesAsync();
            return Results.Created($"/api/folders/{folder.Id}",
                new FolderNode(folder.Id, folder.ParentFolderId, folder.Name, folder.SortOrder));
        });

        group.MapPut("/{id:int}", async (int id, FolderUpdate input, AppDbContext db) =>
        {
            if (await db.Folders.FindAsync(id) is not { } folder) return Results.NotFound();
            if (string.IsNullOrWhiteSpace(input.Name)) return Results.BadRequest("Name is required.");
            if (input.ParentFolderId == id) return Results.BadRequest("A folder cannot be its own parent.");
            if (input.ParentFolderId is { } parentId)
            {
                if (!await db.Folders.AnyAsync(f => f.Id == parentId && f.WorldId == folder.WorldId))
                    return Results.BadRequest("Parent folder does not exist in this world.");
                if (await IsDescendant(db, folder.WorldId, ancestorId: id, candidateId: parentId))
                    return Results.BadRequest("Cannot move a folder into its own descendant.");
            }
            folder.Name = input.Name.Trim();
            folder.ParentFolderId = input.ParentFolderId;
            if (input.SortOrder is { } sort) folder.SortOrder = sort;
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        group.MapPut("/{id:int}/move", async (int id, FolderMove input, AppDbContext db) =>
        {
            if (await db.Folders.FindAsync(id) is not { } folder) return Results.NotFound();
            if (input.ParentFolderId == id) return Results.BadRequest("A folder cannot be its own parent.");
            if (input.ParentFolderId is { } parentId)
            {
                if (!await db.Folders.AnyAsync(f => f.Id == parentId && f.WorldId == folder.WorldId))
                    return Results.BadRequest("Parent folder does not exist in this world.");
                if (await IsDescendant(db, folder.WorldId, ancestorId: id, candidateId: parentId))
                    return Results.BadRequest("Cannot move a folder into its own descendant.");
            }
            folder.ParentFolderId = input.ParentFolderId;
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        group.MapDelete("/{id:int}", async (int id, AppDbContext db) =>
        {
            if (await db.Folders.FindAsync(id) is not { } folder) return Results.NotFound();
            db.Folders.Remove(folder);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }

    private static async Task<bool> IsDescendant(AppDbContext db, int worldId, int ancestorId, int candidateId)
    {
        var parents = await db.Folders.Where(f => f.WorldId == worldId)
            .Select(f => new { f.Id, f.ParentFolderId })
            .ToDictionaryAsync(f => f.Id, f => f.ParentFolderId);
        int? current = candidateId;
        while (current is { } c && parents.TryGetValue(c, out var parent))
        {
            if (c == ancestorId) return true;
            current = parent;
        }
        return false;
    }
}
