import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const source = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@pokerji/protocol': source('../protocol/src/index.ts'),
      '@pokerji/poker-engine': source('../poker-engine/src/index.ts'),
    },
  },
  test: { testTimeout: 15_000 },
});
