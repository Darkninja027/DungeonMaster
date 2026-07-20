import { defineConfig } from 'vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const config = defineConfig({
  base: './',
  resolve: { tsconfigPaths: true },
  server: {
    proxy: {
      '/api': 'http://localhost:5199',
    },
  },
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    tailwindcss(),
    viteReact(),
  ],
})

export default config
