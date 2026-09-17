import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { include: ['src/**/*.test.ts'] },
  build: { rollupOptions: { output: { manualChunks: { phaser: ['phaser'] } } } }
});
