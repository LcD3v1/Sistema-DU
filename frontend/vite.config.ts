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
  server: {
    proxy: {
      '/api': { target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:3001', changeOrigin: true },
    },
    hmr: {
      overlay: false,
    },
  },
})
