import { test, expect, type Page } from '@playwright/test';
import { TICKERS_BLOCO_D_CI, exigirRecursoBlocoD } from './fixtures/analise-bloco-d';

/**
 * Análise de Ativos — Bloco D, fatia A: Fundamentos · Raio-X + Exportar CSV (projeto `chromium`,
 * desktop). SÓ LEITURA. No CI as 3 flags do bloco D ficam ligadas e o seed traz WEGE3/HGLG11/KNCR11;
 * localmente o teste pula sem ANALISE_ATIVOS_RAIOX_HABILITADO.
 *
 * Seletor Essencial | Raio-X com o nível na URL (?fund=raiox), 1ª coluna fixa com rolagem interna,
 * download do CSV (raio-x_<TICKER>_<AAAA-MM-DD>.csv), alvos de 44px, API (400/404, cabeçalhos).
 */
test.describe.configure({ timeout: 180_000 });

const { acao, fiiTijolo } = TICKERS_BLOCO_D_CI;

async function abrirFundamentos(page: Page, ticker: string, query = '') {
  await page.goto(`/analise-ativos/${ticker}${query}`, { waitUntil: 'load' });
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
  return card;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/analise-ativos', { waitUntil: 'load' });
  await exigirRecursoBlocoD(page, 'raioX');
});

test.describe('API do Raio-X', () => {
  test('JSON com anos fechados e CSV com o nome e o formato da decisão 13', async ({ page }) => {
    const r = await page.request.get(`/api/analise-ativos/ativos/${acao}/raio-x`);
    expect(r.status()).toBe(200);
    expect(r.headers()['cache-control']).toMatch(/^private/);
    const corpo = await r.json();
    expect(corpo.ticker).toBe(acao);
    expect(corpo.anos.length).toBeGreaterThanOrEqual(1);
    expect(corpo.anos.every((a: number) => a < new Date().getFullYear())).toBe(true);
    expect(JSON.stringify(corpo)).not.toMatch(/FCF|inadimpl|prazo médio/i);

    const csv = await page.request.get(`/api/analise-ativos/ativos/${acao}/raio-x?formato=csv`);
    expect(csv.status()).toBe(200);
    expect(csv.headers()['content-type']).toBe('text/csv; charset=utf-8');
    expect(csv.headers()['content-disposition']).toMatch(
      new RegExp(`^attachment; filename="raio-x_${acao}_\\d{4}-\\d{2}-\\d{2}\\.csv"$`),
    );
    const bytes = await csv.body();
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const texto = bytes.toString('utf8');
    expect(texto).toContain('\r\n');
    expect(texto.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    expect(texto.split('\r\n')[0]).toMatch(/^﻿Linha;\d{4}/);
  });

  test('formato inválido = 400; ticker fora da área = 404', async ({ page }) => {
    expect(
      (await page.request.get(`/api/analise-ativos/ativos/${acao}/raio-x?formato=xlsx`)).status(),
    ).toBe(400);
    expect((await page.request.get('/api/analise-ativos/ativos/ZZZZ3/raio-x')).status()).toBe(404);
  });
});

test.describe('Página do ativo — Raio-X', () => {
  test(`${acao}: seletor grava ?fund=raiox, coluna fixa e rolagem interna, alvos de 44px`, async ({
    page,
  }) => {
    const card = await abrirFundamentos(page, acao);
    const grupo = card.getByRole('group', { name: 'Nível de detalhe dos fundamentos' });
    await expect(grupo).toBeVisible({ timeout: 60_000 });
    await grupo.getByRole('button', { name: 'Raio-X' }).click();
    await expect(page).toHaveURL(/[?&]fund=raiox/);
    const tabela = card.locator('[data-raio-x] table');
    await expect(tabela).toBeVisible({ timeout: 60_000 });
    await expect(grupo.getByRole('button', { name: 'Raio-X' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // 1ª coluna fixa: continua no lugar ao rolar a tabela para o lado
    const regiao = card.getByRole('region', { name: new RegExp(`Raio-X de ${acao}`) });
    const th = tabela.locator('tbody th[scope="row"]').first();
    const antes = (await th.boundingBox())!.x;
    await regiao.evaluate((el) => (el.scrollLeft = 400));
    await page.waitForTimeout(200);
    expect(Math.abs((await th.boundingBox())!.x - antes)).toBeLessThan(2);
    expect(await th.evaluate((el) => getComputedStyle(el).position)).toBe('sticky');

    // alvos ≥ 44px: seletor, chips e Exportar CSV
    for (const b of await card.locator('button[aria-pressed], [data-exportar-csv]').all()) {
      expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }

    // o nível está na URL: abrir o link com ?fund=raiox abre direto no Raio-X
    const card2 = await abrirFundamentos(page, acao, '?fund=raiox');
    await expect(card2.locator('[data-raio-x]')).toBeVisible({ timeout: 60_000 });

    // voltar ao Essencial tira o parâmetro
    await card2
      .getByRole('group', { name: 'Nível de detalhe dos fundamentos' })
      .getByRole('button', { name: 'Essencial' })
      .click();
    await expect(page).not.toHaveURL(/fund=raiox/);
  });

  test(`${acao}: Exportar CSV baixa raio-x_${acao}_<data>.csv`, async ({ page }) => {
    const card = await abrirFundamentos(page, acao, '?fund=raiox');
    const botao = card.getByRole('button', { name: 'Exportar CSV' });
    await expect(botao).toBeVisible({ timeout: 60_000 });
    const [download] = await Promise.all([page.waitForEvent('download'), botao.click()]);
    expect(download.suggestedFilename()).toMatch(
      new RegExp(`^raio-x_${acao}_\\d{4}-\\d{2}-\\d{2}\\.csv$`),
    );
    await expect(page.getByRole('status').filter({ hasText: 'baixado' })).toBeVisible();
  });

  test(`${fiiTijolo}: blocos do FII e chips filtram a tabela`, async ({ page }) => {
    const card = await abrirFundamentos(page, fiiTijolo, '?fund=raiox');
    const chips = card.getByRole('group', { name: 'Blocos do Raio-X' });
    await expect(chips).toBeVisible({ timeout: 60_000 });
    await expect(chips.getByRole('button', { name: 'Todos' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await chips.getByRole('button', { name: 'Patrimônio e cota' }).click();
    await expect(card.locator('tbody[data-bloco]')).toHaveCount(1);
    await expect(card.locator('tbody[data-bloco="patrimonio_cota"]')).toBeVisible();
  });

  test('screenshots claro e escuro (só local)', async ({ page }) => {
    test.skip(!!process.env.CI, 'screenshots só locais');
    for (const tema of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: tema });
      const card = await abrirFundamentos(page, acao, '?fund=raiox');
      await expect(card.locator('[data-raio-x]')).toBeVisible({ timeout: 60_000 });
      await card.screenshot({ path: test.info().outputPath(`raio-x-${acao}-${tema}.png`) });
    }
  });
});
