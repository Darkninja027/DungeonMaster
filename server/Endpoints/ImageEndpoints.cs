using DungeonMaster.Api.Data;
using DungeonMaster.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace DungeonMaster.Api.Endpoints;

public static class ImageEndpoints
{
    private static ImageInfo ToInfo(ImageAsset i) =>
        new(i.Id, i.FileName, i.ContentType, i.SizeBytes, i.UploadedAt, $"/api/images/{i.Id}/file");

    public static void MapImageEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/worlds/{worldId:int}/images", async (int worldId, AppDbContext db) =>
            await db.Images.Where(i => i.WorldId == worldId)
                .OrderByDescending(i => i.UploadedAt)
                .Select(i => ToInfo(i))
                .ToListAsync());

        app.MapPost("/api/worlds/{worldId:int}/images", async (int worldId, IFormFile file, AppDbContext db, ImageStore store) =>
        {
            if (!await db.Worlds.AnyAsync(w => w.Id == worldId)) return Results.NotFound();
            if (file.Length == 0) return Results.BadRequest("File is empty.");
            if (file.Length > ImageStore.MaxSizeBytes) return Results.BadRequest("File exceeds the 20 MB limit.");
            if (!store.IsAllowed(file.ContentType))
                return Results.BadRequest("Unsupported image type. Use png, jpeg, gif, webp, or svg.");

            await using var stream = file.OpenReadStream();
            var storedName = await store.SaveAsync(worldId, file.ContentType, stream);

            var image = new ImageAsset
            {
                WorldId = worldId,
                FileName = file.FileName,
                StoredFileName = storedName,
                ContentType = file.ContentType,
                SizeBytes = file.Length,
            };
            db.Images.Add(image);
            await db.SaveChangesAsync();
            return Results.Created($"/api/images/{image.Id}/file", ToInfo(image));
        }).DisableAntiforgery();

        app.MapGet("/api/images/{id:int}/file", async (int id, AppDbContext db, ImageStore store) =>
        {
            if (await db.Images.FindAsync(id) is not { } image) return Results.NotFound();
            return store.GetPath(image.WorldId, image.StoredFileName) is { } path
                ? Results.File(path, image.ContentType)
                : Results.NotFound();
        });

        app.MapDelete("/api/images/{id:int}", async (int id, AppDbContext db, ImageStore store) =>
        {
            if (await db.Images.FindAsync(id) is not { } image) return Results.NotFound();
            db.Images.Remove(image);
            await db.SaveChangesAsync();
            store.Delete(image.WorldId, image.StoredFileName);
            return Results.NoContent();
        });
    }
}
