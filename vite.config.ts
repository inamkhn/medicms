import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: process.env.VERCEL ? '/' : './',
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: { port: 5173, strictPort: true },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('react-dom') || id.includes('react-router-dom')) return 'vendor';
          if (id.includes('@radix-ui') || id.includes('lucide-react')) return 'ui';
          if (id.includes('zod') || id.includes('react-hook-form') || id.includes('@hookform') || id.includes('zustand')) return 'form';
          if (id.includes('date-fns')) return 'charts';
        },
      },
    },
  },
})
