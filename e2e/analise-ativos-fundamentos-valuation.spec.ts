import { test, expect, type Page } from '@playwright/test';

/**
 * Análise de Ativos — Fase 1, fatia C: Fundamentos · Essencial, Valuation · Múltiplos, múltiplos
 * históricos e pares. Projeto `chromium` (desktop). Só leitura.
 *
 * Roda contra o banco do seed no CI (fixtures da Fase 0 da amostra: WEGE3, HGLG11, AURE3 e pares)
 * com ANALISE_ATIVOS_HABILITADA=true e o usuário demo no beta. As APIs são conferidas direto; a
 * página depende também do topo (/api/analise-ativos/ativos/[ticker], fatia B).
 */

const TEXTO_BARRA_OCULTA = 'histórico com menos de 5 anos · barra oculta';

async function abrirAtivo(page: Page, ticker: string) {
  await page.goto(`/analise-ativos/${ticker}`, { waitUntil: 'load' });
  // blocos preguiçosos: só buscam quando chegam perto da tela
  const fundamentos = page.getByRole('heading', { name: 'Fundamentos · Essencial' });
  await expect(page.locator('[data-pagina-ativo]')).toBeVisible({ timeout: 60_000 });
  await page.mouse.wheel(0, 1600);
  await expect(fundamentos).toBeVisible({ timeout: 60_000 });
  await fundamentos.scrollIntoViewIfNeeded();
}

test.describe('APIs de fundamentos e valuation', () => {
  test('WEGE3: anos fechados, cache privado e nenhuma referência a índice de mercado', async ({
    page,
  }) => {
    const anoAtual = new Date().getFullYear();
    const f = await page.request.get('/api/analise-ativos/ativos/WEGE3/fundamentos');
    expect(f.status()).toBe(200);
    // o `next dev` reescreve o Cache-Control das rotas dinâmicas; no build de produção (CI) vale
    // o da rota (private, max-age=300)
    expect(f.headers()['cache-control']).toMatch(
      process.env.CI ? /^private, max-age=300$/ : /^private/,
    );
    expect(f.headers()['server-timing']).toMatch(/fundamentos;desc="(banco|cache)"/);
    const fund = await f.json();
    const anos = fund.linhas.filter((l: { ano: number | null }) => l.ano !== null);
    expect(anos.length).toBeGreaterThanOrEqual(5);
    expect(anos.every((l: { ano: number }) => l.ano < anoAtual)).toBe(true);

    const v = await page.request.get('/api/analise-ativos/ativos/WEGE3/valuation');
    expect(v.status()).toBe(200);
    const corpo = await v.text();
    expect(corpo).not.toMatch(/ibovespa|ifix/i);
    const val = JSON.parse(corpo);
    expect(val.grupos.map((g: { codigo: string }) => g.codigo)).toContain('preco');
    expect(val.pares.itens[0].ticker).toBe('WEGE3');
  });

  test('formato inválido = 400; fora da área = 404', async ({ page }) => {
    expect((await page.request.get('/api/analise-ativos/ativos/WEGE/valuation')).status()).toBe(
      400,
    );
    expect((await page.request.get('/api/analise-ativos/ativos/ZZZZ3/fundamentos')).status()).toBe(
      404,
    );
  });
});

test.describe('Página do ativo — análise', () => {
  test.setTimeout(120_000);

  test('WEGE3: Fundamentos com 5+ anos, chips do Valuation e pares navegando', async ({ page }) => {
    await abrirAtivo(page, 'WEGE3');
    const fund = page.locator('section[aria-labelledby="fundamentos-WEGE3"]');
    const linhas = fund.locator('tbody th[scope="row"]');
    await expect(linhas.first()).toBeVisible({ timeout: 30_000 });
    expect(await linhas.count()).toBeGreaterThanOrEqual(5);

    const val = page.locator('section[aria-labelledby="valuation-WEGE3"]');
    await val.scrollIntoViewIfNeeded();
    const chips = val.getByRole('group', { name: 'Grupo de indicadores' }).getByRole('button');
    await expect(chips.first()).toHaveAttribute('aria-pressed', 'true', { timeout: 30_000 });
    await chips.nth(1).click();
    await expect(chips.nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect(val.locator('[data-multiplo]').first()).toBeVisible();

    const pares = page.locator('section[aria-labelledby="pares-WEGE3"]');
    await pares.scrollIntoViewIfNeeded();
    const primeiro = pares.locator('tbody tr').first();
    await expect(primeiro).toHaveAttribute('data-proprio', 'true', { timeout: 30_000 });
    const link = pares.locator('tbody tr').nth(1).getByRole('link');
    if ((await link.count()) > 0) {
      const alvo = (await link.textContent())?.trim() ?? '';
      await link.click();
      await expect(page).toHaveURL(new RegExp(`/analise-ativos/${alvo}$`));
    } else {
      test.info().annotations.push({ type: 'nota', description: 'WEGE3 sem pares no seed' });
    }
  });

  test('HGLG11: colunas de FII com fonte CVM', async ({ page }) => {
    await abrirAtivo(page, 'HGLG11');
    const fund = page.locator('section[aria-labelledby="fundamentos-HGLG11"]');
    await expect(fund.getByRole('columnheader', { name: /Rend\.\/cota/ })).toBeVisible({
      timeout: 30_000,
    });
    await expect(fund.getByRole('columnheader', { name: /Vacância \(CVM\)/ })).toBeVisible();
    await expect(fund.getByText('fonte CVM').first()).toBeVisible();
  });

  test('AURE3: barras de 10 anos ocultas com histórico curto', async ({ page }) => {
    await abrirAtivo(page, 'AURE3');
    const val = page.locator('section[aria-labelledby="valuation-AURE3"]');
    await val.scrollIntoViewIfNeeded();
    await expect(val.getByText(TEXTO_BARRA_OCULTA).first()).toBeVisible({ timeout: 30_000 });
  });

  test('screenshots locais (não roda no CI)', async ({ page }) => {
    test.skip(!!process.env.CI, 'screenshots só locais');
    await abrirAtivo(page, 'WEGE3');
    await page.waitForTimeout(3000);
    await page
      .locator('section[aria-labelledby="valuation-WEGE3"]')
      .screenshot({ path: 'test-results/analise-C-valuation-WEGE3.png' });
  });
});
