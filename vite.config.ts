import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // SQL tests need a live database; they self-skip when SUPABASE_DB_URL is absent.
    testTimeout: 30_000,
  },
})
