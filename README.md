# DungeonMaster

A little tool to help with D&D world building. Create multiple worlds, organise lore
into folders, write articles in markdown, and embed uploaded images.

## Stack

- **client/** — [TanStack Start](https://tanstack.com/start) (React, file-based routing via TanStack Router), Tailwind CSS 4, shadcn/ui, TanStack Query, react-markdown
- **server/** — ASP.NET Core (.NET 10) minimal API, Entity Framework Core, SQLite

## Running it

Two terminals:

```sh
# Terminal 1 — API (http://localhost:5199)
cd server
dotnet run --launch-profile http

# Terminal 2 — frontend (http://localhost:4280)
cd client
npm install
npm run dev
```

Open http://localhost:4280. The dev server proxies `/api/**` to the .NET API
(configured via nitro `routeRules` in `client/vite.config.ts`).

The SQLite database and uploaded images live in `server/data/` (gitignored).
EF Core migrations apply automatically on API startup.

## EF Core migrations

```sh
cd server
dotnet tool run dotnet-ef migrations add SomeChange
```

## API overview

| Route | Purpose |
| --- | --- |
| `GET/POST /api/worlds`, `PUT/DELETE /api/worlds/{id}` | Worlds CRUD |
| `GET /api/worlds/{id}/tree` | Folder + article tree for a world |
| `POST/PUT/DELETE /api/folders/{id}` | Folder CRUD (nested folders supported) |
| `GET/POST/PUT/DELETE /api/articles/{id}` | Markdown articles |
| `GET/POST /api/worlds/{id}/images`, `GET /api/images/{id}/file` | Image upload/serving |
