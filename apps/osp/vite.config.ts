import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/app/',
  plugins: [
    react(),
    {
      name: 'redirect-development-app-base',
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (request.url === '/app') {
            response.writeHead(302, { Location: '/app/' });
            response.end();
            return;
          }

          next();
        });
      },
    },
  ],
  server: {
    host: 'localhost',
    port: 8791,
    strictPort: true,
  },
  build: {
    outDir: 'dist/app',
    emptyOutDir: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    exclude: [...configDefaults.exclude, 'e2e/**', 'scripts/**/*.test.mjs'],
  },
});
