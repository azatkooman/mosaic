import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import globals from "globals";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals"),
  {
    // next/core-web-vitals leaves no-undef off, so a missing import is only a
    // ReferenceError at render time — the build and lint both stay green.
    languageOptions: {
      globals: { ...globals.browser, ...globals.node, ...globals.es2021 },
    },
    rules: { "no-undef": "error" },
  },
  {
    // Vitest injects describe/it/expect.
    files: ["**/*.test.js", "**/*.test.jsx", "vitest.setup.*"],
    languageOptions: { globals: globals.vitest },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
