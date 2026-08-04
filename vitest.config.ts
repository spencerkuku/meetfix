import { defineConfig } from 'vitest/config';

// Frontend-only test runner — backend/ has its own Jest config, and
// packages/*'s Jest config runs its own specs; this file's `include` keeps
// Vitest scoped to the Vite-built frontend so the two runners never pick up
// each other's test files.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['{pages,components,services}/**/*.spec.ts'],
  },
});
