import { defineConfig } from 'vitest/config';
import packageInfo from './package.json';
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(packageInfo.version) },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    setupFiles: ['tests/unit/setup.ts'],
  },
});
