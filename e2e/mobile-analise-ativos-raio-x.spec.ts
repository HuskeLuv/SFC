import { test, expect, type Page } from '@playwright/test';
import { expectMinTarget, prepareMobilePage } from './helpers/mobileFit';
import { TICKERS_BLOCO_D_CI, exigirRecursoBlocoD } from './fixtures/analise-bloco-d';

/**
 * Análise de Ativos — Bloco D, fatia A: Raio-X no celular (projeto `mobile`, 390×844). SÓ LEITURA.
 * Sem rolagem horizontal da página a 390 e a 320 (a tabela rola dentro do card), chips abrem no 1º
 * bloco sem "Todos", alvos ≥ 44px. Pula sem ANALISE_ATIVOS_RAIOX_HABILITADO.
 */
test.describe.configure({ timeout: 180_000 });

const { acao, fiiPapel } = TICKERS_BLOCO_D_CI;

test.beforeEach(async ({ page }) => {
  await prepareMobilePage(page);
  await page.goto('/analise-ativos', { waitUntil: 'load' });
  await exigirRecursoBlocoD(page, 'raioX');
});

async function abrir(page: Page, ticker: string, width = 390) {
  await page.setViewportSize({ width, height: 844 });
  await page.goto(`/analise-ativos/${ticker}?fund=raiox`, { waitUntil: 'load' });
  await expect(page.locator('[data-pagina-ativo]')).toBeVisible({ timeout: 90_000 });
  const card = page.locator(`section[aria-labelledby="fundamentos-${ticker}"]`);
  for (let i = 0; i < 25 && (await card.count()) === 0; i++) {
    await page.evaluate(() => {
      const ph = document.querySelector('[aria-busy="true"][aria-label^="Fundamentos"]');
      (ph ?? document.body).scrollIntoView({ block: 'center' });
    });
    await page.waitForTimeout(600);
  }
  await card.scrollIntoViewIfNeeded();
  await expect(card.locator('[data-raio-x]')).toBeVisible({ timeout: 60_000 });
  return card;
}

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

for (const ticker of [acao, fiiPapel]) {
  test(`${ticker} a 390: sem overflow, 1º bloco aberto sem "Todos", alvos de 44px`, async ({
    page,
  }) => {
    const card = await abrir(page, ticker);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    const chips = card.getByRole('group', { name: 'Blocos do Raio-X' });
    await expect(chips.getByRole('button', { name: 'Todos' })).toHaveCount(0);
    await expect(chips.getByRole('button').first()).toHaveAttribute('aria-pressed', 'true');
    await expect(card.locator('tbody[data-bloco]')).toHaveCount(1);
    for (const b of await chips.getByRole('button').all()) await expectMinTarget(b);
    await expectMinTarget(card.getByRole('button', { name: 'Exportar CSV' }));
    const seletor = card.getByRole('group', { name: 'Nível de detalhe dos fundamentos' });
    for (const b of await seletor.getByRole('button').all()) await expectMinTarget(b);
    // a tabela rola dentro do card; a 1ª coluna continua fixa
    const th = card.locator('tbody th[scope="row"]').first();
    expect(await th.evaluate((el) => getComputedStyle(el).position)).toBe('sticky');
  });
}

test(`${acao} a 320: sem overflow da página`, async ({ page }) => {
  await abrir(page, acao, 320);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});

test('screenshots claro e escuro (só local)', async ({ page }) => {
  test.skip(!!process.env.CI, 'screenshots só locais');
  for (const tema of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: tema });
    const card = await abrir(page, acao);
    await card.screenshot({ path: test.info().outputPath(`raio-x-mobile-${acao}-${tema}.png`) });
  }
});
