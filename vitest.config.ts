import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    exclude: ['dist/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/**/*.old.ts',
        'src/**/types.ts',
        'src/cli/**',
        'node_modules/**',
      ],
      reportsDirectory: './coverage',
      all: true,
      lines: 50,
      functions: 50,
      branches: 50,
      statements: 50,
    },
  },
});
