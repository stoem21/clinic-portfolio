import { defineConfig } from 'vitest/config';

export default defineConfig({
  cacheDir: "./.cache/vitest",
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    // Routes import a shared Express app + module-level prisma singleton; run
    // serially so mocked modules don't bleed across files.
    fileParallelism: false,
  },
});
