import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    exclude: ['**/node_modules/**', '**/.claude/**', '**/dist/**'],
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
