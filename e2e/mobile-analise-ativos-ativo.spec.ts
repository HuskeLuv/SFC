import { test, expect, type Page } from '@playwright/test';
import { expectMinTarget, prepareMobilePage } from './helpers/mobileFit';

/**
 * Análise de Ativos · Fase 1 · fatia B — topo da página do ativo no celular (projeto `mobile`,
 * 390×844). Sem rolagem horizontal a 390 e a 320; KPIs em 2 colunas (1 quando o card fica
 * abaixo de ~300px, a 320); alvos ≥ 44px. SÓ LEITURA.
 */
test.describe.configure({ timeout: 180_000 });

test.beforeEach(async ({ page }) => {
  await prepareMobilePage(page);
});

async function abrir(page: Page, ticker: string, width = 390) {
  await page.setViewportSize({ width, height: 844 });
  await page.goto(`/analise-ativos/${ticker}`, { waitUntil: 'load' });
  await expect(page.locator('[data-bloco="indice"]')).toBeVisible({ timeout: 90_000 });
}

const colunasKpis = (page: Page) =>
  page
    .locator('[data-kpis]')
    .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

for (const ticker of ['WEGE3', 'HGLG11']) {
  test(`${ticker} a 390: sem overflow, KPIs em 2 colunas, alvos de 44px`, async ({ page }) => {
    await abrir(page, ticker);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    expect(await colunasKpis(page)).toBe(2);
    const grafico = page.locator('[data-bloco="grafico"]');
    for (const nome of ['Período de 5 anos', 'Período de 10 anos', 'Ver dados em tabela']) {
      await expectMinTarget(grafico.getByRole('button', { name: nome }));
    }
    await expectMinTarget(page.getByRole('link', { name: 'Abrir na Educação' }));
    await expectMinTarget(page.locator('[data-bloco="indice"] summary').first());
  });
}

test('WEGE3 a 320: sem overflow e KPIs em 1 coluna', async ({ page }) => {
  await abrir(page, 'WEGE3', 320);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  expect(await colunasKpis(page)).toBe(1);
});
