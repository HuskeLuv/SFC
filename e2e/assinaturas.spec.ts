import { test, expect, type Page, type Response } from '@playwright/test';
import { planoExigidoPelaRota } from '../src/services/planos/acessoRotas';

/**
 * Assinaturas (ClickUp 86e2zkhe2), projeto Playwright "assinaturas": segundo servidor com
 * ASSINATURAS_HABILITADAS ligada e valores FAKE (playwright.config.ts) e os usuários de
 * prisma/seedAssinaturas.ts. Nada chama o Stripe: o Checkout é interceptado com page.route.
 *
 * O /me é o real (F1). Só o pós-Checkout é simulado: o Checkout é interceptado e nenhum webhook
 * chega, então depois dele o teste devolve um /me de exemplo do novo plano. Um 404 do /me (rotas
 * ausentes) também cai no exemplo.
 */

type Usuario = 'basic' | 'pro';
const EMAIL: Record<Usuario, string> = {
  basic: 'basic.e2e@finapp.local',
  pro: 'pro.e2e@finapp.local',
};

const ME_BASE = {
  status: 'none',
  planoAssinatura: null,
  intervalo: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  cortesiaAte: null,
  carenciaAte: null,
  podeAssinar: true,
  podeDesistirAte: null,
  pedidoArrependimento: null,
  habilitado: true,
};
const ME_EXEMPLO = {
  basic: { ...ME_BASE, plano: 'basic', origem: 'basic' },
  pro: {
    ...ME_BASE,
    plano: 'pro',
    origem: 'assinatura',
    status: 'active',
    planoAssinatura: 'pro',
    intervalo: 'mes',
    currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  },
};

async function entrar(page: Page, usuario: Usuario, opts: { meDepoisDoCheckout?: Usuario } = {}) {
  let meAtual: Usuario = usuario;
  await page.route('**/api/assinaturas/me**', async (route) => {
    if (meAtual === usuario) {
      const real = await route.fetch().catch(() => null);
      if (real && real.status() !== 404) return route.fulfill({ response: real });
    }
    return route.fulfill({ json: ME_EXEMPLO[meAtual] });
  });
  if (opts.meDepoisDoCheckout) {
    const depois = opts.meDepoisDoCheckout;
    await page.route('**/api/assinaturas/checkout', async (route) => {
      meAtual = depois;
      const base = new URL(page.url()).origin;
      await route.fulfill({ json: { url: `${base}/planos/sucesso?session_id=cs_test_e2e` } });
    });
  }
  await page.addInitScript(() => {
    try {
      localStorage.setItem(
        'lgpd-cookie-consent',
        JSON.stringify({ version: '1', acceptedAt: new Date().toISOString() }),
      );
    } catch {
      // sem storage: o banner só aparece
    }
  });
  const res = await page.request.post('/api/auth/login', {
    data: { email: EMAIL[usuario], password: '123456' },
  });
  expect(res.ok(), `login de ${EMAIL[usuario]} (rodou prisma/seedAssinaturas.ts?)`).toBe(true);
}

async function abrir(page: Page, rota: string) {
  await page.goto(rota, { waitUntil: 'domcontentloaded', timeout: 150_000 });
}

/** Coleta toda resposta da API que bloqueou por plano (403 plano_insuficiente). */
function vigiarBloqueios(page: Page) {
  const bloqueios: string[] = [];
  const pendentes: Promise<void>[] = [];
  page.on('response', (r: Response) => {
    const url = new URL(r.url());
    if (!url.pathname.startsWith('/api/')) return;
    const metodo = r.request().method();
    // Prova estática (vale antes da F2): nenhuma chamada do Basic a rota Pro/Adv do ACESSO_ROTAS.
    // /api/analise-ativos/config é lida pelo menu de todo usuário e a F2 a trata como livre
    // (exigirAcessoAnalise responde habilitada:false); fica fora só da prova estática.
    if (
      planoExigidoPelaRota(url.pathname, metodo) &&
      url.pathname !== '/api/analise-ativos/config'
    ) {
      bloqueios.push(
        `${metodo} ${url.pathname} (rota acima do Basic, em ${new URL(page.url()).pathname})`,
      );
    }
    if (r.status() !== 403) return;
    pendentes.push(
      r
        .json()
        .then((body: { codigo?: string }) => {
          if (body?.codigo === 'plano_insuficiente') {
            bloqueios.push(`${metodo} ${url.pathname} → 403 plano_insuficiente`);
          }
        })
        .catch(() => undefined),
    );
  });
  return async () => {
    await Promise.all(pendentes);
    return bloqueios;
  };
}

test.describe('Assinaturas · Basic', () => {
  test('cadeado de página na Carteira e menu com selo do plano', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 900 });
    await entrar(page, 'basic');
    await abrir(page, '/carteira');
    const cadeado = page.locator('[data-mf-cadeado="pagina"][data-need="pro"]');
    await expect(cadeado).toBeVisible({ timeout: 150_000 });
    await expect(cadeado.getByRole('heading', { name: 'Disponível no Pro' })).toBeVisible();
    await expect(cadeado.getByRole('link', { name: 'Ver planos' })).toHaveAttribute(
      'href',
      '/planos?need=pro',
    );
    // A prévia é fictícia e não recebe foco.
    await expect(cadeado.locator('[aria-hidden="true"][inert]')).toHaveCount(1);
    const menu = page.locator('aside');
    await expect(menu.locator('a[href="/carteira"] [data-mf-selo-plano="pro"]')).toBeVisible();
    await expect(
      menu.locator('a[href="/saude-financeira"] [data-mf-selo-plano="adv"]'),
    ).toBeVisible();
    await expect(menu.locator('a[href="/planos"]')).toBeVisible();
  });

  test('/planos: Assinar abre o aceite e o Checkout (interceptado) volta em /planos/sucesso', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1366, height: 900 });
    await entrar(page, 'basic', { meDepoisDoCheckout: 'pro' });
    await abrir(page, '/planos');
    await expect(page.locator('[data-mf-plano]')).toHaveCount(3, { timeout: 150_000 });
    await expect(page.locator('[data-mf-plano="pro"]')).toContainText('Recomendado');
    await expect(page.locator('[data-mf-plano="basic"]')).toContainText('Seu plano');
    await page.locator('[data-mf-assinar="pro"]').click();
    const modal = page.getByRole('dialog');
    await expect(modal).toContainText('renova sozinha');
    const ir = modal.getByRole('button', { name: 'Ir para o pagamento' });
    await expect(ir).toBeDisabled();
    await modal.locator('[data-mf-aceite]').check();
    const pedido = page.waitForRequest('**/api/assinaturas/checkout');
    await ir.click();
    const corpo = (await pedido).postDataJSON() as Record<string, unknown>;
    expect(corpo).toMatchObject({ plano: 'pro', aceiteTermos: true });
    await page.waitForURL('**/planos/sucesso?session_id=cs_test_e2e', { timeout: 150_000 });
    await expect(page.locator('[data-mf-retorno]')).toBeVisible({ timeout: 150_000 });
  });

  test('navega por todas as páginas sem nenhum 403 plano_insuficiente', async ({ page }) => {
    test.setTimeout(600_000);
    await page.setViewportSize({ width: 1366, height: 900 });
    await entrar(page, 'basic');
    const bloqueios = vigiarBloqueios(page);
    for (const rota of [
      '/fluxodecaixa',
      '/dividas',
      '/calendario',
      '/conexoes-bancarias',
      '/relatorios/financeiro',
      '/historico-alteracoes',
      '/educacao',
      '/ajuda',
      '/profile',
      '/planos',
      // Trancadas: o cadeado aparece e nada de dentro monta.
      '/carteira',
      '/planejamento-financeiro',
      '/saude-financeira',
      '/relatorios',
      '/analise-ativos',
    ]) {
      await abrir(page, rota);
      // Tempo para hidratar e os hooks da página buscarem (networkidle não fecha com polling).
      await page.waitForLoadState('load', { timeout: 150_000 }).catch(() => undefined);
      await page.waitForTimeout(5000);
    }
    expect(await bloqueios()).toEqual([]);
  });
});

test.describe('Assinaturas · Pro', () => {
  test('carteira liberada; Saúde Financeira trancada no Advanced', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 900 });
    await entrar(page, 'pro');
    await abrir(page, '/carteira');
    await expect(
      page.locator('[data-mf-carteira-ready]').or(page.getByText('Nenhum dado encontrado')).first(),
    ).toBeVisible({ timeout: 150_000 });
    await expect(page.locator('[data-mf-cadeado="pagina"]')).toHaveCount(0);
    await abrir(page, '/saude-financeira');
    await expect(page.locator('[data-mf-cadeado][data-need="adv"]')).toBeVisible({
      timeout: 150_000,
    });
    await expect(page.locator('aside a[href="/carteira"] [data-mf-selo-plano]')).toHaveCount(0);
  });

  test('aba Análise da carteira com cadeado de bloco do Advanced', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 900 });
    await entrar(page, 'pro');
    await abrir(page, '/carteira?aba=analise');
    const pronto = page.locator('[data-mf-carteira-ready]');
    const vazio = page.getByText('Nenhum dado encontrado');
    await expect(pronto.or(vazio).first()).toBeVisible({ timeout: 150_000 });
    test.skip(await vazio.isVisible(), 'carteira do pro.e2e vazia: sem abas para conferir');
    await expect(page.locator('[data-mf-cadeado="bloco"][data-need="adv"]')).toBeVisible();
  });
});

test.describe('Assinaturas · 390 px', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  const semRolagemHorizontal = async (page: Page) =>
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);

  test('/planos com o Pro primeiro, comparativo em acordeão e sem rolagem lateral', async ({
    page,
  }) => {
    await entrar(page, 'basic');
    await abrir(page, '/planos');
    await expect(page.locator('[data-mf-plano]').first()).toBeVisible({ timeout: 150_000 });
    const topos = await page
      .locator('[data-mf-plano]')
      .evaluateAll((els) =>
        els.map((e) => [e.getAttribute('data-mf-plano'), e.getBoundingClientRect().top] as const),
      );
    const primeiro = [...topos].sort((a, b) => a[1] - b[1])[0][0];
    expect(primeiro).toBe('pro');
    await expect(page.locator('[data-mf-comparativo-acordeao]')).toBeVisible();
    await expect(page.locator('[data-mf-comparativo]')).toBeHidden();
    await semRolagemHorizontal(page);
  });

  test('Minha assinatura no Perfil e cadeado da Carteira', async ({ page }) => {
    await entrar(page, 'pro');
    await abrir(page, '/profile');
    const item = page.locator('[data-perfil-item="assinatura"]');
    await expect(item).toBeVisible({ timeout: 150_000 });
    await item.click();
    await expect(page.locator('[data-mf-minha-assinatura="ativa"]')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Mudar de plano' })).toBeVisible();
    await semRolagemHorizontal(page);
  });

  test('cadeado da Carteira no Basic cabe na tela', async ({ page }) => {
    await entrar(page, 'basic');
    await abrir(page, '/carteira');
    await expect(page.locator('[data-mf-cadeado="pagina"]')).toBeVisible({ timeout: 150_000 });
    await semRolagemHorizontal(page);
  });
});
