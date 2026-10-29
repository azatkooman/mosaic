import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Mirrors the "@/*" path alias from jsconfig.json (Vitest doesn't read it) and
// enables the automatic JSX runtime so component tests can render without
// importing React explicitly. Next compiles JSX in plain .js files too (every
// page.js is one), so the transform covers them as well as .jsx.
export default defineConfig({
  oxc: {
    lang: 'jsx',
    jsx: { runtime: 'automatic' },
    include: /\.(m?js|jsx)$/,
    exclude: /node_modules/,
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
})
