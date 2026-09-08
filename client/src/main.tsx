import ReactDOM from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'

import './styles.css'
import { getRouter } from './router'
import { initTheme } from './lib/theme'
import { initSkin } from './lib/skin'

// Both stamp <html> before the first paint, so nothing flashes the wrong
// palette on the way in.
initTheme()
initSkin()

const router = getRouter()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <RouterProvider router={router} />,
)
