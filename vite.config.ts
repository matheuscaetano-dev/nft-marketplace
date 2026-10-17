import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import path from 'path'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [
    TanStackRouterVite({ autoCodeSplitting: true }),
    tailwindcss(),
    react()
  ],
  resolve: {
    alias: {
      "@": path.resolve(projectRoot, "./src"),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return null
          if (id.includes('/react/') || id.includes('/react-dom/')) return 'react-vendor'
          if (id.includes('/@tanstack/')) return 'tanstack-vendor'
          if (id.includes('/msw/') || id.includes('/@mswjs/')) return 'mock-vendor'
          if (id.includes('/socket.io-client/') || id.includes('/engine.io-client/')
            || id.includes('/socket.io-parser/')) return 'realtime-vendor'
          if (id.includes('/radix-ui/') || id.includes('/@radix-ui/')
            || id.includes('/lucide-react/') || id.includes('/react-icons/')) return 'ui-vendor'
          return null
        },
      },
    },
  },
})