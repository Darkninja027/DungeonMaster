import ReactDOM from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'

import './styles.css'
import { getRouter } from './router'
import { initTheme } from './lib/theme'

initTheme()

const router = getRouter()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <RouterProvider router={router} />,
)
