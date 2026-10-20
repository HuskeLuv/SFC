import { test, expect, type Page } from '@playwright/test';
import { expectMinTarget, prepareMobilePage } from './helpers/mobileFit';

/**
 * Análise de Ativos · Fase 1 · fatia B — topo da página do ativo no celular (projeto `mobile`,
 * 390×844). Sem rolagem horizontal a 390 e a 320; KPIs em 2 colunas (1 quando o card fica
 * abaixo de ~300px, a 320); alvos ≥ 44px. v2.4 (fatia C2): o card "Critérios de fundamentos" no
 * lugar do Índice, com as pílulas de janela de 44px e os itens em 1 coluna. SÓ LEITURA.
 */
test.describe.configure({ timeout: 180_000 });

test.beforeEach(async ({ page }) => {
  await prepareMobilePage(page);
});

async function abrir(page: Page, ticker: string, width = 390) {
  await page.setViewportSize({ width, height: 844 });
  await page.goto(`/analise-ativos/${ticker}`, { waitUntil: 'load' });
  await expect(page.locator('[data-card-criterios]')).toBeVisible({ timeout: 90_000 });
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
    // desde #309 o bloco mostra o card do curso (ModuloCard) e não o botão 'Abrir na Educação'
    await expectMinTarget(page.locator('[data-bloco="educacao"]').getByRole('link').first());
    await expect(page.locator('[data-bloco="indice"]')).toHaveCount(0);
    const card = page.locator('[data-card-criterios]');
    if ((await card.locator('li[data-criterio]').count()) > 0) {
      for (const anos of [3, 5, 10]) {
        await expectMinTarget(card.getByRole('radio', { name: `${anos} anos` }));
      }
      // itens em 1 coluna no celular
      const colunas = await card
        .locator('ul')
        .first()
        .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
      expect(colunas).toBe(1);
    }
  });
}

test('WEGE3 a 320: sem overflow e KPIs em 1 coluna', async ({ page }) => {
  await abrir(page, 'WEGE3', 320);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  expect(await colunasKpis(page)).toBe(1);
});

// QA 13/10: os sr-only dos <th> com ⓘ (Fundamentos) escapavam do contêiner overflow-x-auto não
// posicionado e alargavam o layout viewport do celular (innerWidth 809 a 390) DEPOIS da rolagem.
for (const [ticker, width] of [
  ['WEGE3', 390],
  ['HGLG11', 320],
] as const) {
  test(`${ticker} a ${width}: rolar a página toda não alarga o layout viewport`, async ({
    page,
  }) => {
    await abrir(page, ticker, width);
    const fundamentos = page.locator('[data-rolagem-card="fundamentos"]');
    if ((await fundamentos.count()) > 0) await fundamentos.first().scrollIntoViewIfNeeded();
    await page.evaluate(async () => {
      for (let y = 0; y <= document.documentElement.scrollHeight; y += 400) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 30));
      }
    });
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.innerWidth)).toBe(width);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
}
