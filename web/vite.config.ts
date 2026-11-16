import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// ../shared holds the engine used for client-side fairness verification.
export default defineConfig({
  plugins: [react()],
  server: { fs: { allow: ['..'] } },
})
