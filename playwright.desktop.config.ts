import { defineConfig } from '@playwright/test';

// Exercises the desktop-mode frontend with a mocked native transport.
// This is NOT a substitute for running the packaged system WebViews.
export default defineConfig({
  testDir: './tests/desktop',
  outputDir: './test-results-desktop',
  fullyParallel: false,
  timeout: 90_000,
  use: {
    viewport: { width: 1280, height: 800 },
    baseURL: 'http://127.0.0.1:1421',
    trace: 'retain-on-failure',
  },
  webServer: {
    command:
      'pnpm exec vite preview --mode desktop --host 127.0.0.1 --port 1421 --strictPort',
    url: 'http://127.0.0.1:1421',
    reuseExistingServer: false,
  },
});
