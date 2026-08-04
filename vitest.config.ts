import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Frontend-only test runner — backend/ has its own Jest config, and
// packages/*'s Jest config runs its own specs; this file's `include` keeps
// Vitest scoped to the Vite-built frontend so the two runners never pick up
// each other's test files.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['{pages,components,services,state}/**/*.spec.{ts,tsx}'],
  },
});
