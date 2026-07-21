import { useState } from 'react'
import { Link, Outlet, createRootRoute } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Castle, Moon, Sun } from 'lucide-react'
import { UpdateIndicator } from '#/components/UpdateIndicator'
import { isDark, setTheme } from '#/lib/theme'
import { Button } from '#/components/ui/button'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

export const Route = createRootRoute({
  component: RootLayout,
})

function ThemeToggle() {
  const [dark, setDark] = useState(isDark())
  const toggle = () => {
    setTheme(dark ? 'light' : 'dark')
    setDark(!dark)
  }
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-7"
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={toggle}
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  )
}

function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex h-screen flex-col">
        <header className="flex items-center gap-2 border-b px-4 py-2">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <Castle className="size-5" />
            Dungeon Master
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <UpdateIndicator />
            <ThemeToggle />
          </div>
        </header>
        <main className="min-h-0 flex-1">
          <Outlet />
        </main>
      </div>
    </QueryClientProvider>
  )
}
