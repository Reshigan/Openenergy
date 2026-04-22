import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globals: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/utils/**/*.ts', 'src/middleware/**/*.ts'],
      // ai.ts wraps Cloudflare Workers AI bindings that can't run outside a
      // worker; types.ts is type-only. Everything else is in-scope for
      // coverage.
      exclude: ['src/utils/ai.ts', 'src/utils/types.ts'],
    },
  },
});
