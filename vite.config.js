import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { marketHttpHandler } from './server/marketData.mjs'
import { historyHttpHandler } from './server/assetHistory.mjs'

function marketDataApi() {
  const configure = (server) => {
    server.middlewares.use((req, res, next) => {
      const pathname = new URL(req.url, 'http://localhost').pathname
      const handler =
        pathname === '/api/market'
          ? marketHttpHandler
          : pathname === '/api/history'
            ? historyHttpHandler
            : null
      if (!handler) return next()
      handler(req, res).catch(() => {
        res.statusCode = 503
        res.end(JSON.stringify({ error: 'Service de données indisponible.' }))
      })
    })
  }
  return {
    name: 'market-data-api',
    configureServer: configure,
    configurePreviewServer: configure
  }
}

export default defineConfig({
  plugins: [react(), marketDataApi()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src')
    }
  }
})
