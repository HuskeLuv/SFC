import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['**/node_modules/**', '**/.claude/**', '**/dist/**', '**/e2e/**'],
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'text-summary'],
      include: [
        'src/app/api/carteira/operacao/**/*.ts',
        'src/app/api/carteira/aporte/**/*.ts',
        'src/app/api/carteira/resgate/**/*.ts',
        'src/services/**/*.ts',
        'src/hooks/**/*.ts',
      ],
      exclude: ['**/__tests__/**'],
      thresholds: {
        statements: 50,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
