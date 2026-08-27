import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { configDefaults, defineConfig } from 'vitest/config';

const eagerChunkLimit = 500_000;
const eagerTotalLimit = 650_000;
const eagerChunkCountLimit = 8;
const reviewedDeferredChunkLimit = 1_700_000;
const reviewedLargeDeferredChunk = /\/(?:survey-core\.min|VisualFormBuilder)-[^/]+\.js$/;

function ospBundleBudget(): Plugin {
  return {
    name: 'osp-bundle-budget',
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).filter((item) => item.type === 'chunk');
      const chunksByFile = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
      const eagerFiles = new Set<string>();

      const visitEagerChunk = (fileName: string) => {
        if (eagerFiles.has(fileName)) return;
        eagerFiles.add(fileName);
        for (const importedFile of chunksByFile.get(fileName)?.imports ?? []) visitEagerChunk(importedFile);
      };

      for (const entry of chunks.filter((chunk) => chunk.isEntry)) visitEagerChunk(entry.fileName);

      const violations: string[] = [];
      const eagerChunks = [...eagerFiles].map((fileName) => chunksByFile.get(fileName)).filter((chunk) => chunk !== undefined);
      const eagerTotal = eagerChunks.reduce((total, chunk) => total + chunk.code.length, 0);

      if (eagerChunks.length > eagerChunkCountLimit) violations.push(`eager chunk count ${eagerChunks.length} exceeds ${eagerChunkCountLimit}`);
      if (eagerTotal > eagerTotalLimit) violations.push(`eager JavaScript ${eagerTotal} bytes exceeds ${eagerTotalLimit}`);

      for (const chunk of chunks) {
        if (eagerFiles.has(chunk.fileName) && chunk.code.length > eagerChunkLimit) {
          violations.push(`eager chunk ${chunk.fileName} is ${chunk.code.length} bytes`);
        }
        if (!eagerFiles.has(chunk.fileName) && chunk.code.length > eagerChunkLimit &&
          (!reviewedLargeDeferredChunk.test(`/${chunk.fileName}`) || chunk.code.length > reviewedDeferredChunkLimit)) {
          violations.push(`unreviewed deferred chunk ${chunk.fileName} is ${chunk.code.length} bytes`);
        }
      }

      if (violations.length > 0) this.error(`OSP_BUNDLE_BUDGET_EXCEEDED: ${violations.join('; ')}`);
    },
  };
}

export default defineConfig({
  base: '/app/',
  plugins: [
    react(),
    ospBundleBudget(),
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
    // SurveyJS ships two large single-module chunks that cannot be subdivided.
    // The semantic budget above permits them only when they remain deferred.
    chunkSizeWarningLimit: 1_700,
    rolldownOptions: {
      output: {
        strictExecutionOrder: true,
        codeSplitting: {
          groups: [
            {
              name: 'app-vendor',
              test: /node_modules[\\/](?:react|react-dom|scheduler|@tanstack|@kinde-oss|zod|jose)[\\/]/,
              priority: 20,
            },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    exclude: [...configDefaults.exclude, 'e2e/**', 'scripts/**/*.test.mjs'],
  },
});
