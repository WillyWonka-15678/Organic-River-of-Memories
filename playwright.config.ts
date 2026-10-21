import { defineConfig } from '@playwright/test';
const production = process.env.RIVER_TEST_PRODUCTION === '1';
const baseURL = production ? 'http://127.0.0.1:4173' : 'http://127.0.0.1:5173';
export default defineConfig({
  outputDir: production ? 'test-results-production' : 'test-results',
  testDir: './tests/browser', timeout: 60000, workers: 1,
  use: { baseURL, viewport: { width: 1920, height: 1080 },
    channel: 'msedge', launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } },
  webServer: { command: production ? 'npm run preview' : 'npm run dev', url: baseURL, reuseExistingServer: true },
});
