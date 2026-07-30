import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        },
        // repair-visibility is a workspace package (npm workspaces symlink)
        // that builds to CommonJS (see its tsconfig.json — shared with the
        // NestJS backend, which needs CJS for Jest). Without this, Vite
        // resolves the symlink to its real path outside node_modules and
        // treats it as project source rather than a dependency, skipping
        // the CJS→ESM interop that named imports from it need.
        preserveSymlinks: true,
      }
    };
});
