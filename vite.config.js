import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { devApiPlugin } from './server/devApiPlugin.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), devApiPlugin()],
  server: {
    host: true,
    // Allow the app to be opened through tunnels / cloud preview hosts.
    allowedHosts: true,
  },
  preview: {
    host: true,
    allowedHosts: true,
  },
})
