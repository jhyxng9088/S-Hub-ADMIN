import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { patchAdminQuotaSource } from './src/admin-quota-patch.js'

function adminQuotaPlugin() {
  return {
    name: 's-hub-admin-quota',
    enforce: 'pre',
    transform(source, id) {
      const next = patchAdminQuotaSource(source, id)
      return next === source ? null : { code: next, map: null }
    },
  }
}

export default defineConfig({
  plugins: [adminQuotaPlugin(), react()],
  base: '/S-Hub-ADMIN/',
  build: { sourcemap: true },
})
