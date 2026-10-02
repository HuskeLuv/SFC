import { test, expect, request as apiRequest } from '@playwright/test';

/**
 * Análise de Ativos — acesso e menu (fatia D), SÓ LEITURA. Projeto `chromium` (desktop) + um
 * bloco com viewport de celular para o painel Mais.
 *
 * Pré-requisito: ANALISE_ATIVOS_HABILITADA=true no servidor (o CI liga) e o usuário demo no beta
 * (seed). Com a flag desligada, o arquivo pula.
 */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const style = document.createElement('style');
    style.textContent =
      '.tsqd-parent-container, .tsqd-open-btn-container { display: none !important; }';
    document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style));
    try {
      localStorage.setItem(
        'lgpd-cookie-consent',
        JSON.stringify({ version: '1', acceptedAt: new Date().toISOString() }),
      );
    } catch {
      // sem storage: o aviso de cookies aparece, sem afetar as afirmações
    }
  });
});

async function areaLigada(page: import('@playwright/test').Page): Promise<boolean> {
  const res = await page.request.get('/api/analise-ativos/config');
  if (!res.ok()) return false;
  const corpo = (await res.json()) as { habilitada?: boolean };
  return corpo.habilitada === true;
}

test.describe('desktop', () => {
  test('sidebar: "Análise de Ativos" logo abaixo de Carteira, com selo NOVO', async ({ page }) => {
    test.skip(!(await areaLigada(page)), 'área desligada ou demo fora do beta');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/carteira', { waitUntil: 'domcontentloaded' });
    const sidebar = page.locator('aside').first();
    const item = sidebar.getByRole('link', { name: /Análise de Ativos/ });
    await expect(item).toBeVisible({ timeout: 30_000 });
    await expect(item).toHaveAttribute('href', '/analise-ativos');
    await expect(item).toContainText('NOVO');

    const nomes = await sidebar.locator('a.menu-item').allInnerTexts();
    const i = nomes.findIndex((n) => n.includes('Análise de Ativos'));
    expect(nomes[i - 1]).toContain('Carteira');
  });

  test('overlay da carteira: DB-only, sem valores, com a aba efetiva', async ({ page }) => {
    test.skip(!(await areaLigada(page)), 'área desligada ou demo fora do beta');
    const res = await page.request.get('/api/analise-ativos/carteira');
    expect(res.status()).toBe(200);
    expect(res.headers()['cache-control']).toContain('no-store');
    const corpo = (await res.json()) as {
      posicoes: Record<string, { portfolioId: string; quantidade: number; categoria: string }>;
      planejados: Record<string, unknown>;
    };
    expect(corpo).toHaveProperty('posicoes');
    expect(corpo).toHaveProperty('planejados');
    for (const p of Object.values(corpo.posicoes)) {
      expect(Object.keys(p).sort()).toEqual(['categoria', 'portfolioId', 'quantidade']);
    }
    // seed: o demo tem MXRF11 na aba FII's
    if (corpo.posicoes.MXRF11) expect(corpo.posicoes.MXRF11.categoria).toBe('fiis');
  });

  test('tese: GET do próprio usuário responde privada', async ({ page }) => {
    test.skip(!(await areaLigada(page)), 'área desligada ou demo fora do beta');
    const res = await page.request.get('/api/analise-ativos/teses/WEGE3');
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ visibilidade: 'privada' });
    expect((await page.request.get('/api/analise-ativos/teses/ZZZZ9')).status()).toBe(404);
  });

  test('sem cookie: API da área não responde dados (401/redirect)', async ({ baseURL }) => {
    const anonimo = await apiRequest.newContext({ baseURL, storageState: undefined });
    for (const url of ['/api/analise-ativos/carteira', '/api/analise-ativos/teses/WEGE3']) {
      const res = await anonimo.get(url, { maxRedirects: 0 });
      expect([401, 302, 307]).toContain(res.status());
    }
    await anonimo.dispose();
  });
});

test.describe('celular', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('painel Mais: item com selo NOVO no grupo Finanças; barra inferior igual', async ({
    page,
  }) => {
    test.skip(!(await areaLigada(page)), 'área desligada ou demo fora do beta');
    await page.goto('/planejamento-financeiro', { waitUntil: 'domcontentloaded' });
    const tabbar = page.locator('[data-mf-tabbar]');
    await expect(tabbar).toBeVisible({ timeout: 30_000 });
    await expect(tabbar.getByText('Análise de Ativos')).toHaveCount(0);
    const dialog = page.getByRole('dialog', { name: 'Mais' });
    // o clique antes da hidratação não abre o painel: tenta de novo até abrir
    await expect(async () => {
      await tabbar.getByRole('button', { name: 'Mais' }).click();
      await expect(dialog).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    const item = dialog.getByRole('link', { name: /Análise de Ativos/ });
    await expect(item).toBeVisible();
    await expect(item).toContainText('NOVO');
    const box = await item.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  });
});
