import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';

export default defineConfig({
  base: '/app/',
  plugins: [
    react(),
    {
      name: 'osp-dev-app-base-redirect',
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          const requestUrl = new URL(request.url ?? '/', 'http://localhost');
          if (requestUrl.pathname !== '/app') {
            next();
            return;
          }
          response.statusCode = 307;
          response.setHeader('Location', `/app/${requestUrl.search}`);
          response.end();
        });
      },
    },
  ],
  build: { outDir: 'dist/app', emptyOutDir: true },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    globals: true,
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
});
