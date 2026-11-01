import { defineConfig } from 'vitest/config';

// Only the platform-free modules (sync queue, trip state) are unit tested here.
export default defineConfig({
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
