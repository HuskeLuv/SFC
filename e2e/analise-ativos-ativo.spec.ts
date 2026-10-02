import { test, expect, type Page } from '@playwright/test';
import { encontrarPalavrasProibidas } from '../src/services/analiseAtivos/regras/comum/linguagem';

/**
 * Análise de Ativos · Fase 1 · fatia B — topo da página do ativo (desktop, projeto `chromium`).
 * Exige ANALISE_ATIVOS_HABILITADA=true (ci.yml) e o usuário demo no beta + fixtures da área
 * (prisma/seedAnaliseAtivos.ts). SÓ LEITURA.
 */
test.describe.configure({ timeout: 180_000 });

async function abrir(page: Page, ticker: string) {
  await page.goto(`/analise-ativos/${ticker}`, { waitUntil: 'load' });
  await expect(page.locator('[data-bloco="indice"]')).toBeVisible({ timeout: 90_000 });
}

test('WEGE3: cabeçalho sem IBOV, Índice com critérios, 8 KPIs, gráfico, proventos em conferência', async ({
  page,
}) => {
  await abrir(page, 'WEGE3');
  const cab = page.locator('[data-bloco="cabecalho"]');
  await expect(cab.getByRole('heading', { level: 1 })).toContainText('WEGE3');
  await expect(cab).toContainText(/fechamento de \d{2}\/\d{2} · fonte B3/);
  await expect(cab).not.toContainText(/IBOV|Ibovespa/);

  const indice = page.locator('[data-bloco="indice"]');
  await expect(indice).toContainText(/\d de \d critérios atendidos/);
  await expect(indice.locator('[data-criterio]')).toHaveCount(5);

  await expect(page.locator('[data-kpi]')).toHaveCount(8);
  const grafico = page.locator('[data-bloco="grafico"]');
  await expect(grafico.locator('figcaption')).toBeVisible();
  await grafico.getByRole('button', { name: 'Ver dados em tabela' }).click();
  await expect(grafico.locator('[data-tabela-grafico] table')).toBeVisible();

  // Só anos fechados: nada do ano corrente na série anual de proventos
  const anoAtual = new Date().getFullYear();
  await expect(page.locator(`[data-bloco="dividendos"] rect[data-ano="${anoAtual}"]`)).toHaveCount(
    0,
  );
  await expect(page.locator('[data-bloco="eventos"]')).not.toContainText(/JCP estimado/i);
  await expect(page.locator('[data-bloco="frescor"]')).toContainText('cotação B3 de');
});

test('HGLG11: FII com critérios desligados como "Não se aplica"', async ({ page }) => {
  await abrir(page, 'HGLG11');
  const indice = page.locator('[data-bloco="indice"]');
  await expect(indice.locator('[data-criterio="vacancia"]')).toContainText('Não se aplica');
  await expect(page.locator('[data-kpi]')).toHaveCount(8);
  await expect(page.locator('[data-kpi="vacanciaCvm"]')).toBeVisible();
  await expect(page.locator('[data-bloco="cabecalho"]')).not.toContainText(/IFIX/);
});

test('ITUB4: endividamento não se aplica (financeira)', async ({ page }) => {
  await abrir(page, 'ITUB4');
  await expect(page.locator('[data-criterio="endividamento"]')).toHaveAttribute(
    'data-status',
    'nao_se_aplica',
  );
  await expect(page.locator('[data-kpi="divLiqEbitda"]')).toContainText('n/a');
});

test('TGMA3 incompleto x AURE3 zero pela regra: caixas e formas distintas', async ({ page }) => {
  await abrir(page, 'TGMA3');
  await expect(page.locator('[data-bloco="indice"]')).toHaveAttribute(
    'data-estado-indice',
    'incompleto',
  );
  await expect(page.locator('[data-caixa="incompleto"]')).toContainText('O que falta');
  await expect(page.locator('[data-caixa="zero_regra"]')).toHaveCount(0);

  await abrir(page, 'AURE3');
  await expect(page.locator('[data-bloco="indice"]')).toHaveAttribute(
    'data-estado-indice',
    'zero_regra',
  );
  await expect(page.locator('[data-caixa="zero_regra"]')).toContainText(
    'Componente zerado pela regra',
  );
  await expect(page.locator('[data-caixa="incompleto"]')).toHaveCount(0);
  await expect(page.locator('[data-criterio="preco_historico"]')).toHaveAttribute(
    'data-status',
    'nao_atende',
  );
});

test('ticker inexistente (XXXX3): API 404 e tela de não encontrado', async ({ page }) => {
  const res = await page.request.get('/api/analise-ativos/ativos/XXXX3');
  expect(res.status()).toBe(404);
  await page.goto('/analise-ativos/XXXX3', { waitUntil: 'load' });
  await expect(page.getByText('Ativo não encontrado na Análise de Ativos')).toBeVisible({
    timeout: 90_000,
  });
});

test('varredura de linguagem no topo', async ({ page }) => {
  for (const t of ['WEGE3', 'AURE3', 'HGLG11']) {
    await abrir(page, t);
    const texto = await page
      .locator('[data-bloco]')
      .evaluateAll((els) => els.map((e) => e.textContent ?? '').join(' '));
    expect(encontrarPalavrasProibidas(texto), t).toEqual([]);
  }
});
