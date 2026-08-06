import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        url: 'http://localhost/',
      },
    },
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}', 'src/**/*.integration.test.{ts,tsx}', 'src/**/corruptedUpload.integration.test.{ts,tsx}'],
    exclude: ['node_modules', '.next', 'e2e'],
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['node_modules', 'src/app/', 'src/middleware.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
  esbuild: {
    jsx: 'automatic',
  },
  resolve: {
    alias: {
      '@': __dirname + '/src',
    },
  },
});
