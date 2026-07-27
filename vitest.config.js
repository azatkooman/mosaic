import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Mirrors the "@/*" path alias from jsconfig.json (Vitest doesn't read it) and
// enables the automatic JSX runtime so component tests can render without
// importing React explicitly.
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
})
