export interface WorldSummary {
  id: number
  name: string
  description: string
  createdAt: string
  articleCount: number
}

export interface FolderNode {
  id: number
  parentFolderId: number | null
  name: string
  sortOrder: number
}

export interface ArticleSummary {
  id: number
  folderId: number | null
  title: string
  updatedAt: string
}

export interface WorldTree {
  folders: Array<FolderNode>
  articles: Array<ArticleSummary>
}

export interface Article {
  id: number
  worldId: number
  folderId: number | null
  title: string
  content: string
  createdAt: string
  updatedAt: string
}

export interface ImageInfo {
  id: number
  fileName: string
  contentType: string
  sizeBytes: number
  uploadedAt: string
  url: string
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: init?.body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `${res.status} ${res.statusText}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  worlds: {
    list: () => request<Array<WorldSummary>>('/api/worlds'),
    get: (id: number) => request<WorldSummary>(`/api/worlds/${id}`),
    tree: (id: number) => request<WorldTree>(`/api/worlds/${id}/tree`),
    create: (input: { name: string; description?: string }) =>
      request<WorldSummary>('/api/worlds', { method: 'POST', body: JSON.stringify(input) }),
    update: (id: number, input: { name: string; description?: string }) =>
      request<void>(`/api/worlds/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
    delete: (id: number) => request<void>(`/api/worlds/${id}`, { method: 'DELETE' }),
  },
  folders: {
    create: (input: { worldId: number; parentFolderId?: number | null; name: string }) =>
      request<FolderNode>('/api/folders', { method: 'POST', body: JSON.stringify(input) }),
    update: (id: number, input: { name: string; parentFolderId?: number | null; sortOrder?: number }) =>
      request<void>(`/api/folders/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
    move: (id: number, parentFolderId: number | null) =>
      request<void>(`/api/folders/${id}/move`, {
        method: 'PUT',
        body: JSON.stringify({ parentFolderId }),
      }),
    delete: (id: number) => request<void>(`/api/folders/${id}`, { method: 'DELETE' }),
  },
  articles: {
    get: (id: number) => request<Article>(`/api/articles/${id}`),
    create: (input: { worldId: number; folderId?: number | null; title: string; content?: string }) =>
      request<Article>('/api/articles', { method: 'POST', body: JSON.stringify(input) }),
    update: (id: number, input: { title: string; content: string; folderId: number | null }) =>
      request<Article>(`/api/articles/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
    move: (id: number, folderId: number | null) =>
      request<void>(`/api/articles/${id}/move`, {
        method: 'PUT',
        body: JSON.stringify({ folderId }),
      }),
    delete: (id: number) => request<void>(`/api/articles/${id}`, { method: 'DELETE' }),
  },
  images: {
    list: (worldId: number) => request<Array<ImageInfo>>(`/api/worlds/${worldId}/images`),
    upload: (worldId: number, file: File) => {
      const form = new FormData()
      form.append('file', file)
      return request<ImageInfo>(`/api/worlds/${worldId}/images`, { method: 'POST', body: form })
    },
    delete: (id: number) => request<void>(`/api/images/${id}`, { method: 'DELETE' }),
  },
}
