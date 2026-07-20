import { Link, Outlet, createRootRoute } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Castle } from 'lucide-react'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex h-screen flex-col">
        <header className="flex items-center gap-2 border-b px-4 py-2">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <Castle className="size-5" />
            Dungeon Master
          </Link>
        </header>
        <main className="min-h-0 flex-1">
          <Outlet />
        </main>
      </div>
    </QueryClientProvider>
  )
}
