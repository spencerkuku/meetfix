import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Frontend-only test runner — backend/ has its own Jest config, and
// packages/*'s Jest config runs its own specs; this file's `include` keeps
// Vitest scoped to the Vite-built frontend so the two runners never pick up
// each other's test files.
//
// The `test` script in package.json runs with NODE_OPTIONS=
// --no-experimental-webstorage: Node 22+ ships its own experimental global
// `localStorage` (on by default), which shadows jsdom's window.localStorage
// under Vitest and resolves to `undefined` without a --localstorage-file.
// Disabling Node's version restores jsdom's real, per-test-isolated
// implementation — needed by anything that touches localStorage directly
// (services/auth.ts's getToken/setToken/clearToken) rather than through a
// mock.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/{pages,components,services,state}/**/*.spec.{ts,tsx}'],
  },
});
