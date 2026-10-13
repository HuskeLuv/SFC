import { test, expect, type Page } from '@playwright/test';
import { encontrarProibidasV2 } from '../src/services/analiseAtivos/regras/comum/linguagemV2';

/**
 * Análise de Ativos — topo da página do ativo (desktop, projeto `chromium`). v2.4 (fatia C2): sem
 * Índice MF nem semáforo; card "Critérios de fundamentos" logo abaixo do cabeçalho, com as 3
 * janelas na mesma resposta (trocar a pílula não refaz a requisição).
 *
 * Exige ANALISE_ATIVOS_HABILITADA=true (ci.yml) e o usuário demo no beta + fixtures da área
 * (prisma/seedAnaliseAtivos.ts). Os critérios vêm de criteria_eval (job 'criterios', fatia A):
 * sem avaliação no banco o card mostra o texto de espera, e os passos que dependem dos itens são
 * pulados com anotação. SÓ LEITURA.
 */
test.describe.configure({ timeout: 180_000 });

async function abrir(page: Page, ticker: string) {
  await page.goto(`/analise-ativos/${ticker}`, { waitUntil: 'load' });
  await expect(page.locator('[data-card-criterios]')).toBeVisible({ timeout: 90_000 });
}

/** Itens do card (0 = ativo ainda sem avaliação no banco). */
async function itensCriterios(page: Page) {
  return page.locator('[data-card-criterios] li[data-criterio]').count();
}

test('WEGE3: cabeçalho sem IBOV, card de critérios sem Índice, 8 KPIs, gráfico', async ({
  page,
}) => {
  const topo: string[] = [];
  page.on('request', (r) => {
    if (/\/api\/analise-ativos\/ativos\/WEGE3$/.test(new URL(r.url()).pathname)) topo.push(r.url());
  });
  await abrir(page, 'WEGE3');
  const cab = page.locator('[data-bloco="cabecalho"]');
  await expect(cab.getByRole('heading', { level: 1 })).toContainText('WEGE3');
  await expect(cab).toContainText(/fechamento de \d{2}\/\d{2} · fonte B3/);
  await expect(cab).not.toContainText(/IBOV|Ibovespa/);

  // v2.4: o bloco do Índice saiu; o card de critérios entrou
  await expect(page.locator('[data-bloco="indice"]')).toHaveCount(0);
  await expect(page.locator('[data-pagina-ativo]')).not.toContainText(/Índice MF|semáforo/);
  const card = page.locator('[data-card-criterios="WEGE3"]');
  await expect(card.getByRole('heading', { name: 'Critérios de fundamentos' })).toBeVisible();
  if ((await itensCriterios(page)) > 0) {
    await expect(card.locator('li[data-criterio]')).toHaveCount(6);
    await expect(card.getByRole('radio', { name: '5 anos' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    const pedidos = topo.length;
    await card.getByRole('radio', { name: '10 anos' }).click();
    await expect(card).toHaveAttribute('data-janela', '10');
    await expect(card.locator('[data-contagem-criterios]')).toContainText(/\d+ de 6/);
    expect(topo.length).toBe(pedidos);
  } else {
    test.info().annotations.push({ type: 'nota', description: 'WEGE3 sem criteria_eval no seed' });
  }

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

test('HGLG11: FII — vacância "sem dado nas demonstrações" (D3) e KPIs de FII', async ({ page }) => {
  await abrir(page, 'HGLG11');
  if ((await itensCriterios(page)) > 0) {
    const vac = page.locator('[data-card-criterios] li[data-criterio="vac"]');
    await expect(vac).toHaveAttribute('data-estado-criterio', 'sem_dado');
    await expect(vac).toContainText('não atende · sem dado nas demonstrações');
  }
  await expect(page.locator('[data-kpi]')).toHaveCount(8);
  await expect(page.locator('[data-kpi="vacanciaCvm"]')).toBeVisible();
  await expect(page.locator('[data-bloco="cabecalho"]')).not.toContainText(/IFIX/);
});

test('ITUB4: financeira — n de 3 (D4) e endividamento não se aplica', async ({ page }) => {
  await abrir(page, 'ITUB4');
  if ((await itensCriterios(page)) > 0) {
    const card = page.locator('[data-card-criterios="ITUB4"]');
    await expect(card.locator('li[data-estado-criterio="nao_se_aplica"]')).toHaveCount(3);
    await expect(card.locator('[data-contagem-criterios]')).toContainText(/\d de 3/);
  }
  await expect(page.locator('[data-kpi="divLiqEbitda"]')).toContainText('n/a');
});

test('TGMA3 e AURE3: nada do Índice nem do semáforo na tela e na API', async ({ page }) => {
  for (const t of ['TGMA3', 'AURE3']) {
    const res = await page.request.get(`/api/analise-ativos/ativos/${t}`);
    expect(res.status(), t).toBe(200);
    const corpo = await res.text();
    expect(corpo, t).not.toMatch(/"[^"]*(indice|semaforo|destaque)[^"]*":/i);
    await abrir(page, t);
    await expect(page.locator('[data-bloco="indice"]')).toHaveCount(0);
    await expect(page.locator('[data-caixa]')).toHaveCount(0);
  }
});

test('ticker inexistente (XXXX3): API 404 e tela de não encontrado', async ({ page }) => {
  const res = await page.request.get('/api/analise-ativos/ativos/XXXX3');
  expect(res.status()).toBe(404);
  await page.goto('/analise-ativos/XXXX3', { waitUntil: 'load' });
  await expect(page.getByText('Ativo não encontrado na Análise de Ativos')).toBeVisible({
    timeout: 90_000,
  });
});

test('varredura de linguagem (linguagemV2) no topo e no card de critérios', async ({ page }) => {
  for (const t of ['WEGE3', 'AURE3', 'HGLG11']) {
    await abrir(page, t);
    const textos = await page.locator('[data-bloco]').evaluateAll((els) =>
      els.map((e) => {
        const c = e.cloneNode(true) as HTMLElement;
        c.querySelectorAll('[data-texto-legal], [data-nome-ativo]').forEach((n) => n.remove());
        return c.textContent ?? '';
      }),
    );
    const achados = textos.flatMap((x) => encontrarProibidasV2(x, { ignorarLiterais: true }));
    expect(achados, t).toEqual([]);
  }
});
