import { defineConfig, createLogger } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

const logger = createLogger()
const loggerInfo = logger.info.bind(logger)
logger.info = (msg, opts) => {
  // Suprimir mensagem "press h to show help" e banner do Vite
  if (msg.includes('press h') || msg.includes('h + enter') || msg.includes('help')) return
  loggerInfo(msg, opts)
}

export default defineConfig({
  plugins: [react({ jsxRuntime: 'automatic' }), tailwindcss()],
  customLogger: logger,
  clearScreen: false,
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    sourcemap: false,
    minify: true,
    cssMinify: true,
    target: 'es2022',
    // PNG/SVG pequenos viram data URI; imagens grandes seguem como arquivo (cache do navegador)
    assetsInlineLimit: 4096,
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      output: {
        // Bibliotecas em chunks próprios: cache estável entre deploys e download paralelo
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom)[\\/]/, priority: 30 },
            { name: 'query', test: /node_modules[\\/](@tanstack|zustand|axios)[\\/]/, priority: 25 },
            { name: 'motion', test: /node_modules[\\/](framer-motion|motion-dom|motion-utils)[\\/]/, priority: 20 },
            { name: 'charts', test: /node_modules[\\/](recharts|d3-[^\\/]+|victory-vendor|@reduxjs|redux|immer|reselect|es-toolkit|decimal\.js-light)[\\/]/, priority: 15 },
            { name: 'pdf', test: /node_modules[\\/](jspdf|jspdf-autotable|fflate|fast-png|iobuffer|pako|@babel[\\/]runtime)[\\/]/, priority: 15 },
            { name: 'dnd', test: /node_modules[\\/]@dnd-kit[\\/]/, priority: 15 },
            { name: 'icons', test: /node_modules[\\/]lucide-react[\\/]/, priority: 10 },
          ],
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': { target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:3000', changeOrigin: true },
    },
    hmr: {
      overlay: false,
    },
  },
})
