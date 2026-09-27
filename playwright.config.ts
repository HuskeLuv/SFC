import { defineConfig } from '@playwright/test';

// Porta e Chromium sobrescrevíveis por ambiente (worktrees paralelos / WSL sem o browser padrão).
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3000);
const CHROMIUM_PATH = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

// O middleware limita 60 req/min por IP e prefixo de rota (src/lib/rateLimit.ts) e toda página
// chama /api/auth/me. A suíte inteira sai do mesmo IP: com 2 workers o balde do /api/auth/me
// esgotava, a página ficava sem usuário (avatar "?") e o teste esperava o conteúdo por 60s (CI
// 36282243449: mobile-perfil e mobile-overflow /saude-financeira); um worker sozinho chega perto
// de 60/min. O x-forwarded-for é a chave do limitador: cada contexto (cada teste) ganha um IP
// próprio — o getter roda a cada browser.newContext / request.newContext.
const WORKER = Number(process.env.TEST_WORKER_INDEX ?? 0) % 256;
let contextSeq = 0;
const E2E_HEADERS = {
  get 'x-forwarded-for'() {
    contextSeq += 1;
    return `10.${WORKER}.${Math.floor(contextSeq / 256) % 256}.${contextSeq % 256}`;
  },
};

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
    extraHTTPHeaders: E2E_HEADERS,
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
      testIgnore: [/auth\.setup\.ts/, /mobile-.*\.spec\.ts/, /\.escrita\.spec\.ts/],
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
      testIgnore: /\.escrita\.spec\.ts/,
    },
    {
      // PWA fase 3: testes que GRAVAM no banco (`*.escrita.spec.ts`). Rodam por último, depois de
      // chromium e mobile, para não mexer no que os guardas de só leitura retratam. Cada arquivo
      // pula sem E2E_ALLOW_WRITES=1 (o CI liga: banco efêmero) e só afirma sobre o que criou.
      // Desktop 1280 por padrão; os de celular declaram o próprio test.use (390x844, isMobile).
      name: 'escrita',
      use: {
        browserName: 'chromium',
        storageState: 'e2e/.auth/user.json',
      },
      dependencies: ['chromium', 'mobile'],
      testMatch: /\.escrita\.spec\.ts/,
    },
  ],
  webServer: {
    command: `npm run dev -- -p ${PORT}`,
    port: PORT,
    reuseExistingServer: true,
    timeout: 60000,
  },
});
