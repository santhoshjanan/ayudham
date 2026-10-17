import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@ayudham/protocol': fileURLToPath(new URL('../protocol/src/index.ts', import.meta.url)),
    },
  },
});
