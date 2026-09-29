import { test, expect } from '@playwright/test';
import {
  expectFitsWithoutClip,
  expectInViewport,
  expectMinTarget,
  gotoMobile,
  prepareMobilePage,
} from './helpers/mobileFit';

/**
 * PWA fase 3, fatia E: Perfil no celular (projeto `mobile`, SÓ LEITURA).
 *
 * Lista de ajustes; cada linha abre o formulário de hoje num sheet. "Sair de todos" vai só até a
 * confirmação e CANCELA (nunca executa: derrubaria as sessões dos outros testes). O 2FA não é
 * configurado (o POST grava um segredo pendente): só abre o sheet.
 */

test.beforeEach(async ({ page }) => {
  await prepareMobilePage(page);
});

const READY = '[data-mf-perfil-mobile]';
const itens = (page: import('@playwright/test').Page) => page.locator('[data-perfil-item]');
const sheet = (page: import('@playwright/test').Page) =>
  page.locator('[role="dialog"][aria-modal="true"]');

for (const width of [390, 320]) {
  test(`Perfil @ ${width}: cabe sem corte e tem 8 linhas de 44px+`, async ({ page }) => {
    test.setTimeout(120_000);
    await gotoMobile(page, '/profile', {
      width,
      height: width === 320 ? 640 : 844,
      readySelector: READY,
    });
    await expect(itens(page)).toHaveCount(8);
    for (let i = 0; i < 8; i++) {
      await itens(page).nth(i).scrollIntoViewIfNeeded();
      await expectMinTarget(itens(page).nth(i));
    }
    // Excluir minha conta por último, isolada.
    await expect(itens(page).last()).toHaveAttribute('data-perfil-item', 'excluir');
    await expectFitsWithoutClip(page, `perfil-${width}`, { width });
    if (!process.env.CI) {
      await page.screenshot({ path: test.info().outputPath(`perfil-${width}.png`) });
    }
  });
}

test('Perfil: Sessões ativas → Sair de todos → confirmação → Cancelar (não executa)', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await gotoMobile(page, '/profile', { readySelector: READY });
  let sessoesDelete = 0;
  page.on('request', (req) => {
    if (req.method() === 'DELETE' && req.url().includes('/api/profile/sessoes')) sessoesDelete++;
  });
  await page.locator('[data-perfil-item="sessoes"]').click();
  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page).getByRole('heading', { name: 'Sessões ativas' })).toBeVisible();
  await sheet(page)
    .getByRole('button', { name: 'Sair de todos os dispositivos', exact: true })
    .click();
  await expect(sheet(page).getByRole('alertdialog')).toBeVisible();
  const cancelar = sheet(page).getByRole('button', { name: 'Cancelar' });
  await expect(cancelar).toBeFocused();
  await expectMinTarget(cancelar);
  await expectInViewport(sheet(page).getByRole('button', { name: 'Sim, sair de todos' }));
  await cancelar.click();
  await expect(sheet(page).getByRole('alertdialog')).toHaveCount(0);
  expect(sessoesDelete).toBe(0);
});

test('Perfil: Verificação em duas etapas abre o sheet do 2FA', async ({ page }) => {
  test.setTimeout(120_000);
  await gotoMobile(page, '/profile', { readySelector: READY });
  await page.locator('[data-perfil-item="2fa"]').click();
  await expect(sheet(page)).toBeVisible();
  await expect(
    sheet(page).getByRole('heading', { name: 'Verificação em duas etapas' }),
  ).toBeVisible();
  await expect(
    sheet(page).getByRole('button', { name: /Configurar 2FA|Desativar 2FA/ }),
  ).toBeVisible({ timeout: 15_000 });
  // O código só aparece depois de Configurar (que grava): se já estiver na tela, confere o atributo.
  const codigo = sheet(page).getByLabel('Digite o código de 6 dígitos');
  if (await codigo.isVisible().catch(() => false)) {
    await expect(codigo).toHaveAttribute('autocomplete', 'one-time-code');
  }
  await page.keyboard.press('Escape');
  await expect(sheet(page)).toHaveCount(0);
});

test('Perfil: Alterar senha abre o formulário com autocomplete do gerenciador', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await gotoMobile(page, '/profile', { readySelector: READY });
  await page.locator('[data-perfil-item="senha"]').click();
  await expect(sheet(page).getByLabel('Senha atual')).toHaveAttribute(
    'autocomplete',
    'current-password',
  );
  await expect(sheet(page).getByLabel('Nova senha (mín. 8 caracteres)')).toHaveAttribute(
    'autocomplete',
    'new-password',
  );
  await expectMinTarget(sheet(page).getByLabel('Senha atual'));
});

// ── PWA fase 5 (fatia C): Perfil › Notificações ────────────────────────────────────────────────
//
// Estados do opt-in de push com Notification/PushManager MOCKADOS (nunca push real no CI) e as
// rotas /api/push/* respondidas por page.route (determinístico com ou sem o back-end da fatia A).
// SÓ LEITURA: a remoção de aparelho vai até a confirmação e CANCELA.

const ENDPOINT_LOCAL = 'https://push.e2e/aparelho-local';

const stubPushApi = async (page: import('@playwright/test').Page) => {
  await page.route('**/api/push/preferencias', (route) =>
    route.fulfill({
      json: {
        habilitado: true,
        vapidPublicKey: 'BExemploDeChavePublica',
        categorias: { orcamento: true, agenda: true, comunidade: true, conta: true },
        comunidadeVisivel: false,
      },
    }),
  );
  await page.route('**/api/push/subscriptions', (route) =>
    route.fulfill({
      json: {
        subscriptions: [
          {
            id: 'sub-local',
            rotulo: 'Chrome · celular',
            criadoEm: '2026-09-29T12:00:00Z',
            endpoint: ENDPOINT_LOCAL,
          },
          {
            id: 'sub-remoto',
            rotulo: 'Chrome · computador',
            criadoEm: '2026-09-20T12:00:00Z',
            endpoint: 'https://push.e2e/outro-aparelho',
          },
        ],
      },
    }),
  );
};

/** Stub do lado do navegador: permissão fixa + PushManager com (ou sem) assinatura local. */
const stubPushBrowser = async (
  page: import('@playwright/test').Page,
  { permission, subscribed }: { permission: 'default' | 'granted' | 'denied'; subscribed: boolean },
) => {
  await page.addInitScript(
    (args) => {
      Object.defineProperty(Notification, 'permission', {
        configurable: true,
        get: () => args.permission,
      });
      // Cinto: nenhum código pode pedir permissão fora de gesto — se pedir, o teste enxerga.
      (window as unknown as { __mfPediuPermissao: boolean }).__mfPediuPermissao = false;
      Notification.requestPermission = async () => {
        (window as unknown as { __mfPediuPermissao: boolean }).__mfPediuPermissao = true;
        return args.permission;
      };
      const subscription = args.subscribed
        ? {
            endpoint: args.endpoint,
            unsubscribe: async () => true,
            toJSON: () => ({ endpoint: args.endpoint, keys: { p256dh: 'p', auth: 'a' } }),
          }
        : null;
      const registration = {
        pushManager: {
          getSubscription: async () => subscription,
          subscribe: async () => subscription,
        },
      };
      Object.defineProperty(navigator.serviceWorker, 'getRegistration', {
        configurable: true,
        value: async () => registration,
      });
    },
    { permission, subscribed, endpoint: ENDPOINT_LOCAL },
  );
};

const abrirNotificacoes = async (page: import('@playwright/test').Page) => {
  await gotoMobile(page, '/profile', { readySelector: READY });
  await page.locator('[data-perfil-item="notificacoes"]').click();
  await expect(sheet(page)).toBeVisible();
};

test('Notificações (nunca pediu): Ativar visível, categorias inertes, sem pedir permissão na carga', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await stubPushApi(page);
  await stubPushBrowser(page, { permission: 'default', subscribed: false });
  await abrirNotificacoes(page);
  const ativar = sheet(page).getByRole('button', { name: 'Ativar neste aparelho' });
  await expect(ativar).toBeVisible();
  await expectMinTarget(ativar);
  const categoria = sheet(page).getByRole('switch', { name: /Orçamento/ });
  await expect(categoria).toHaveAttribute('aria-disabled', 'true');
  // Comunidade fora (comunidadeVisivel=false no stub) e regra LGPD no rodapé.
  await expect(sheet(page).getByRole('switch', { name: /Comunidade/ })).toHaveCount(0);
  await expect(sheet(page).getByText(/nunca mostram valores em R\$/)).toBeVisible();
  // NINGUÉM pediu permissão fora de gesto.
  expect(await page.evaluate(() => (window as never)['__mfPediuPermissao'])).toBe(false);
});

test('Notificações (ativas): master ligado, lista de aparelhos e remoção cancelada não deleta', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await stubPushApi(page);
  await stubPushBrowser(page, { permission: 'granted', subscribed: true });
  let pushDelete = 0;
  page.on('request', (req) => {
    if (req.method() === 'DELETE' && req.url().includes('/api/push/subscriptions')) pushDelete++;
  });
  await abrirNotificacoes(page);
  const master = sheet(page).getByRole('switch', { name: /Avisos neste aparelho/ });
  await expect(master).toBeVisible();
  await expect(master).toHaveAttribute('aria-checked', 'true');
  await expectMinTarget(master);
  // Lista de aparelhos (decisão 3): este aparelho marcado, remoto com lixeira.
  await expect(sheet(page).getByText('Este aparelho', { exact: true })).toBeVisible();
  await expect(sheet(page).getByText('Chrome · computador')).toBeVisible();
  await expect(
    sheet(page).getByRole('button', { name: 'Enviar notificação de teste' }),
  ).toBeVisible();
  const lixeira = sheet(page).getByRole('button', {
    name: 'Remover os avisos de Chrome · computador',
  });
  await expectMinTarget(lixeira);
  await lixeira.click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  expect(pushDelete).toBe(0);
  expect(await page.evaluate(() => (window as never)['__mfPediuPermissao'])).toBe(false);
});

test('Notificações (negada): instrução por plataforma e "Já liberei" sem reexibir o diálogo', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await stubPushApi(page);
  await stubPushBrowser(page, { permission: 'denied', subscribed: false });
  await abrirNotificacoes(page);
  await expect(sheet(page).getByText('Sem permissão')).toBeVisible();
  await expect(sheet(page).getByText(/Ajustes/)).toBeVisible();
  await sheet(page).getByRole('button', { name: 'Android · Chrome' }).click();
  await expect(sheet(page).getByText(/cadeado/)).toBeVisible();
  const verificar = sheet(page).getByRole('button', { name: 'Já liberei — verificar de novo' });
  await expectMinTarget(verificar);
  await verificar.click();
  await expect(sheet(page).getByText(/ainda está sem permissão/)).toBeVisible();
  // denied: nunca reexibe o diálogo do sistema.
  expect(await page.evaluate(() => (window as never)['__mfPediuPermissao'])).toBe(false);
});
