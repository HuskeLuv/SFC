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

// Assinaturas (ClickUp 86e2zkhe2): o servidor principal fica com ASSINATURAS_HABILITADAS DESLIGADA
// (igual a prod; snapshots de hoje). O projeto "assinaturas" usa um SEGUNDO servidor, em porta
// própria, com a chave ligada e valores FAKE (nenhuma conta Stripe; nada chama a API do Stripe).
// No CI ele sobe do mesmo build (`next start`); localmente só entra com E2E_ASSINATURAS_PORT
// (aponte para um `next dev` já de pé com as mesmas variáveis: dois `next dev` não dividem o .next).
const ASSINATURAS_PORT = Number(process.env.E2E_ASSINATURAS_PORT ?? 3100);
const COM_ASSINATURAS = Boolean(process.env.CI || process.env.E2E_ASSINATURAS_PORT);
const ENV_ASSINATURAS_FAKE: Record<string, string> = {
  ASSINATURAS_HABILITADAS: 'true',
  STRIPE_SECRET_KEY: 'sk_test_fake_e2e',
  STRIPE_WEBHOOK_SECRET: 'whsec_test_e2e',
  STRIPE_PRICE_PRO_MENSAL: 'price_e2e_pro_mensal',
  STRIPE_PRICE_PRO_ANUAL: 'price_e2e_pro_anual',
  STRIPE_PRICE_ADV_MENSAL: 'price_e2e_adv_mensal',
  STRIPE_PRICE_ADV_ANUAL: 'price_e2e_adv_anual',
  // Ninguém é legado neste servidor e não há lançamento: basic.e2e resolve 'basic'.
  ASSINATURAS_CORTESIA_CORTE: '2000-01-01T00:00:00Z',
  ASSINATURAS_LANCAMENTO_ATE: '',
  ASSINATURAS_APP_URL: `http://localhost:${ASSINATURAS_PORT}`,
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
      testIgnore: [
        /auth\.setup\.ts/,
        /mobile-.*\.spec\.ts/,
        /\.escrita\.spec\.ts/,
        /assinaturas\.spec\.ts/,
      ],
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
      // Um de cada vez: o desktop-fase3.escrita espera o SEU evento na 1ª linha do Histórico e os
      // outros arquivos de escrita também criam/apagam eventos e dívidas.
      workers: 1,
      use: {
        browserName: 'chromium',
        storageState: 'e2e/.auth/user.json',
      },
      dependencies: ['chromium', 'mobile'],
      testMatch: /\.escrita\.spec\.ts/,
    },
    ...(COM_ASSINATURAS
      ? [
          {
            // Chave ligada, valores fake, segundo servidor. Cada teste entra com o próprio
            // usuário do seed (prisma/seedAssinaturas.ts); não depende do setup do demo.
            name: 'assinaturas',
            testMatch: /assinaturas\.spec\.ts/,
            timeout: 180000,
            use: {
              browserName: 'chromium' as const,
              baseURL: `http://localhost:${ASSINATURAS_PORT}`,
            },
          },
        ]
      : []),
  ],
  webServer: [
    {
      command: `npm run dev -- -p ${PORT}`,
      port: PORT,
      reuseExistingServer: true,
      timeout: 60000,
    },
    ...(COM_ASSINATURAS
      ? [
          {
            command: process.env.CI
              ? `npx next start -p ${ASSINATURAS_PORT}`
              : `npx next dev -p ${ASSINATURAS_PORT}`,
            port: ASSINATURAS_PORT,
            reuseExistingServer: !process.env.CI,
            timeout: 120000,
            env: ENV_ASSINATURAS_FAKE,
          },
        ]
      : []),
  ],
});
