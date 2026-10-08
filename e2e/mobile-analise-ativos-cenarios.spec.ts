import { test, expect, type Locator, type Page } from '@playwright/test';
import { expectMinTarget, prepareMobilePage } from './helpers/mobileFit';
import { exigirRecursoBlocoD } from './fixtures/analise-bloco-d';

/**
 * Análise de Ativos — Bloco D, fatia B: Meus cenários no celular (projeto `mobile`, 390×844).
 * SÓ LEITURA (nada é salvo). Sem rolagem horizontal a 390 e a 320; campos com 48px e fonte de
 * 16px (sem zoom no iOS); métodos em CARTÕES (decisão 13); alvos ≥ 44px; rodapé literal.
 */
test.describe.configure({ timeout: 180_000 });

test.beforeEach(async ({ page }) => {
  await prepareMobilePage(page);
});

async function abrir(page: Page, ticker: string, width = 390): Promise<Locator> {
  await page.setViewportSize({ width, height: 844 });
  await page.goto(`/analise-ativos/${ticker}`, { waitUntil: 'load' });
  await exigirRecursoBlocoD(page, 'cenarios');
  const card = page.locator(`section[aria-labelledby="valuation-${ticker}"]`);
  // o card fica numa SecaoPreguicosa (monta perto do viewport): rola até o marcador da seção
  const marcador = page.locator('[aria-label^="Valuation"]').first();
  await marcador.waitFor({ state: 'attached', timeout: 90_000 });
  await marcador.scrollIntoViewIfNeeded();
  await card.waitFor({ timeout: 90_000 });
  await card.scrollIntoViewIfNeeded();
  await card.getByRole('button', { name: 'Meus cenários', exact: true }).click();
  await expect(card.locator('[data-meus-cenarios]')).toBeVisible({ timeout: 90_000 });
  return card;
}

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

test('WEGE3 a 390: cartões, campos de 48px/16px, alvos de 44px e rodapé', async ({ page }) => {
  const card = await abrir(page, 'WEGE3');
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await expect(card.locator('[data-cenarios-cartoes] > li')).toHaveCount(5);
  await expect(card.locator('[data-cenarios-tabela]')).toHaveCount(0);

  const campo = card.getByLabel('Yield desejado (Bazin)', { exact: true });
  const medida = await campo.evaluate((el) => ({
    h: el.getBoundingClientRect().height,
    f: parseFloat(getComputedStyle(el).fontSize),
  }));
  expect(medida.h).toBeGreaterThanOrEqual(47.5);
  expect(medida.f).toBeGreaterThanOrEqual(16);

  for (const nome of ['Múltiplos', 'Meus cenários']) {
    await expectMinTarget(card.getByRole('button', { name: nome, exact: true }));
  }
  await expectMinTarget(card.locator('[data-slider-margem]'));
  await expectMinTarget(card.locator('[data-cenario-salvar]'));
  await expect(card.locator('[data-rodape-cenarios]')).toContainText(
    "O My Finance não calcula 'preço justo' nem preço-alvo",
  );

  // caso-limite na tela: k = g ⇒ Gordon "—" com o motivo, sem quebrar
  await card.getByLabel('Crescimento g (Gordon)', { exact: true }).fill('13');
  await expect(card.locator('[data-metodo="gordon"]')).toContainText(
    'k ≤ g: o modelo não tem resultado',
  );
});

test('WEGE3 e MXRF11 a 320: sem rolagem horizontal', async ({ page }) => {
  for (const ticker of ['WEGE3', 'MXRF11']) {
    await abrir(page, ticker, 320);
    expect(await overflow(page), ticker).toBeLessThanOrEqual(0);
  }
});

test('screenshots locais de Meus cenários (390)', async ({ page }) => {
  test.skip(!!process.env.CI, 'screenshots só locais');
  for (const ticker of ['WEGE3', 'MXRF11']) {
    const card = await abrir(page, ticker);
    await card.screenshot({ path: `test-results/cenarios-${ticker}-390.png` });
  }
});
