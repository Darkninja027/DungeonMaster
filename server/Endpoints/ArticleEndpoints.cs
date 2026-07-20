using DungeonMaster.Api.Data;
using DungeonMaster.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace DungeonMaster.Api.Endpoints;

public static class ArticleEndpoints
{
    public static void MapArticleEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/articles");

        group.MapGet("/{id:int}", async (int id, AppDbContext db) =>
            await db.Articles.FindAsync(id) is { } article ? Results.Ok(article) : Results.NotFound());

        group.MapPost("/", async (ArticleInput input, AppDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(input.Title)) return Results.BadRequest("Title is required.");
            if (!await db.Worlds.AnyAsync(w => w.Id == input.WorldId)) return Results.BadRequest("World does not exist.");
            if (input.FolderId is { } folderId &&
                !await db.Folders.AnyAsync(f => f.Id == folderId && f.WorldId == input.WorldId))
                return Results.BadRequest("Folder does not exist in this world.");

            var article = new Article
            {
                WorldId = input.WorldId,
                FolderId = input.FolderId,
                Title = input.Title.Trim(),
                Content = input.Content ?? "",
            };
            db.Articles.Add(article);
            await db.SaveChangesAsync();
            return Results.Created($"/api/articles/{article.Id}", article);
        });

        group.MapPut("/{id:int}", async (int id, ArticleUpdate input, AppDbContext db) =>
        {
            if (await db.Articles.FindAsync(id) is not { } article) return Results.NotFound();
            if (string.IsNullOrWhiteSpace(input.Title)) return Results.BadRequest("Title is required.");
            if (input.FolderId is { } folderId &&
                !await db.Folders.AnyAsync(f => f.Id == folderId && f.WorldId == article.WorldId))
                return Results.BadRequest("Folder does not exist in this world.");
            article.Title = input.Title.Trim();
            article.Content = input.Content;
            article.FolderId = input.FolderId;
            article.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return Results.Ok(article);
        });

        // Articles in the same world whose content wiki-links [[Title]] this article.
        group.MapGet("/{id:int}/mentions", async (int id, AppDbContext db) =>
        {
            if (await db.Articles.FindAsync(id) is not { } article) return Results.NotFound();
            var title = article.Title
                .Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_");
            var exact = $"%[[{title}]]%";
            var aliased = $"%[[{title}|%";
            var mentions = await db.Articles
                .Where(a => a.WorldId == article.WorldId && a.Id != id &&
                    (EF.Functions.Like(a.Content, exact, "\\") || EF.Functions.Like(a.Content, aliased, "\\")))
                .OrderBy(a => a.Title)
                .Select(a => new MentionResult(a.Id, a.Title))
                .ToListAsync();
            return Results.Ok(mentions);
        });

        group.MapPut("/{id:int}/move", async (int id, ArticleMove input, AppDbContext db) =>
        {
            if (await db.Articles.FindAsync(id) is not { } article) return Results.NotFound();
            if (input.FolderId is { } folderId &&
                !await db.Folders.AnyAsync(f => f.Id == folderId && f.WorldId == article.WorldId))
                return Results.BadRequest("Folder does not exist in this world.");
            article.FolderId = input.FolderId;
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        group.MapDelete("/{id:int}", async (int id, AppDbContext db) =>
        {
            if (await db.Articles.FindAsync(id) is not { } article) return Results.NotFound();
            db.Articles.Remove(article);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }
}
