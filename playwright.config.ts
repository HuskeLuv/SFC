import { defineConfig } from '@playwright/test';

// Porta e Chromium sobrescrevíveis por ambiente (worktrees paralelos / WSL sem o browser padrão).
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3000);
const CHROMIUM_PATH = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    ...(CHROMIUM_PATH ? { launchOptions: { executablePath: CHROMIUM_PATH } } : {}),
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        storageState: 'e2e/.auth/user.json',
      },
      dependencies: ['setup'],
      testIgnore: [/auth\.setup\.ts/, /mobile-.*\.spec\.ts/],
    },
    {
      // PWA fase 0: iPhone-like 390x844 (layout viewport estica com isMobile — ver
      // e2e/mobile-overflow.spec.ts). Só roda os arquivos mobile-*.spec.ts.
      name: 'mobile',
      use: {
        browserName: 'chromium',
        storageState: 'e2e/.auth/user.json',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
      dependencies: ['setup'],
      testMatch: /mobile-.*\.spec\.ts/,
    },
  ],
  webServer: {
    command: `npm run dev -- -p ${PORT}`,
    port: PORT,
    reuseExistingServer: true,
    timeout: 60000,
  },
});
