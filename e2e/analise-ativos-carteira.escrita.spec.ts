import { test, expect, type Page } from '@playwright/test';
import { apiDelete, writesAllowed } from './helpers/api';

/**
 * Análise de Ativos — usuário (fatia D) que GRAVA: projeto `escrita`, desktop 1280.
 *
 * - "Na sua carteira" = Carteira: o % da aba e o objetivo do ativo do demo (MXRF11 no seed) no
 *   bloco são os mesmos da aba FII's (GET /api/carteira/fii, o endpoint da tabela).
 * - Tese em WEGE3: escreve, salva sozinha, recarrega, apaga pela tela. O `finally` apaga pela API.
 * - Planejar ITUB4 pelo wizard: bloco vira "Planejado"; o `finally` remove o planejado.
 *
 * Só com E2E_ALLOW_WRITES=1 (CI: banco efêmero) e com a área ligada para o demo.
 */

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
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
      // sem storage
    }
  });
});

async function areaLigada(page: Page): Promise<boolean> {
  const res = await page.request.get('/api/analise-ativos/config');
  return res.ok() && ((await res.json()) as { habilitada?: boolean }).habilitada === true;
}

const blocoCarteira = (page: Page) => page.locator('section[data-na-carteira]');
const blocoTese = (page: Page) => page.locator('section[data-tese]');

async function abrirAtivo(page: Page, ticker: string) {
  await page.goto(`/analise-ativos/${ticker}`, { waitUntil: 'load' });
  await expect(page.locator(`[data-pagina-ativo="${ticker}"]`)).toBeVisible({ timeout: 60_000 });
}

const pctBr = (v: number) =>
  `${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

test.describe('Na sua carteira (leitura)', () => {
  test("MXRF11: % da aba e objetivo iguais aos da aba FII's da Carteira", async ({ page }) => {
    test.skip(!(await areaLigada(page)), 'área desligada ou demo fora do beta');
    const aba = await page.request.get('/api/carteira/fii');
    expect(aba.ok()).toBe(true);
    const dados = (await aba.json()) as {
      secoes: Array<{
        ativos: Array<{ ticker: string; percentualCarteira: number; objetivo: number }>;
      }>;
    };
    const linha = dados.secoes.flatMap((s) => s.ativos).find((a) => a.ticker === 'MXRF11');
    test.skip(!linha, "demo sem MXRF11 na aba FII's");

    await abrirAtivo(page, 'MXRF11');
    const bloco = blocoCarteira(page);
    await expect(bloco).toHaveAttribute('data-na-carteira', 'posicao', { timeout: 30_000 });
    const barraPeso = bloco.locator('[data-barra-peso^="Peso dentro de"]');
    await expect(barraPeso).toContainText(pctBr(linha!.percentualCarteira), { timeout: 30_000 });
    if (linha!.objetivo > 0) {
      await expect(bloco).toContainText(`% da aba FII's`);
    }
  });
});

test.describe('grava e desfaz', () => {
  test.skip(!writesAllowed(), 'só com E2E_ALLOW_WRITES=1');

  test('tese em WEGE3: salva sozinha, recarrega e apaga', async ({ page }) => {
    test.skip(!(await areaLigada(page)), 'área desligada ou demo fora do beta');
    test.setTimeout(120_000);
    const texto = `E2E tese ${Date.now()}: acompanho margem e caixa.`;
    try {
      await abrirAtivo(page, 'WEGE3');
      const bloco = blocoTese(page);
      await bloco.scrollIntoViewIfNeeded();
      await expect(bloco).toHaveAttribute('data-tese', /vazia|salva/, { timeout: 30_000 });
      if ((await bloco.getAttribute('data-tese')) === 'salva') {
        await bloco.getByRole('button', { name: 'Editar' }).click();
      } else {
        await bloco.getByRole('button', { name: 'Escrever minha tese' }).click();
      }
      const campo = bloco.getByLabel('Sua tese sobre WEGE3');
      await campo.fill(texto);
      const put = page.waitForResponse(
        (r) =>
          r.url().endsWith('/api/analise-ativos/teses/WEGE3') && r.request().method() === 'PUT',
      );
      await expect(bloco.getByText('Alterações ainda não salvas')).toBeVisible();
      expect((await put).status()).toBe(200);
      await expect(bloco.getByText(/^Salvo automaticamente às/)).toBeVisible();

      await page.reload({ waitUntil: 'load' });
      const depois = blocoTese(page);
      await depois.scrollIntoViewIfNeeded();
      await expect(depois).toHaveAttribute('data-tese', 'salva', { timeout: 30_000 });
      await expect(depois).toContainText(texto);

      await depois.getByRole('button', { name: 'Apagar tese' }).click();
      const del = page.waitForResponse(
        (r) =>
          r.url().endsWith('/api/analise-ativos/teses/WEGE3') && r.request().method() === 'DELETE',
      );
      await depois.getByRole('button', { name: 'Apagar tese' }).click();
      expect((await del).status()).toBe(200);
      await expect(depois).toHaveAttribute('data-tese', 'vazia');
    } finally {
      await apiDelete(page, '/api/analise-ativos/teses/WEGE3').catch(() => undefined);
    }
  });

  test('Planejar ITUB4 pelo wizard: bloco vira "Planejado"; remove no fim', async ({ page }) => {
    test.skip(!(await areaLigada(page)), 'área desligada ou demo fora do beta');
    test.setTimeout(180_000);
    const antes = (await (await page.request.get('/api/analise-ativos/carteira')).json()) as {
      posicoes: Record<string, unknown>;
      planejados: Record<string, { watchlistId: string }>;
    };
    test.skip(
      !!antes.posicoes.ITUB4 || !!antes.planejados.ITUB4,
      'demo já tem ou já planejou ITUB4',
    );
    try {
      await abrirAtivo(page, 'ITUB4');
      const bloco = blocoCarteira(page);
      await expect(bloco).toHaveAttribute('data-na-carteira', 'nada', { timeout: 30_000 });
      await page
        .locator('[data-acoes-carteira="nada"]')
        .getByRole('button', { name: 'Planejar na Carteira' })
        .click();

      const etapa = page.locator('[data-mf-step="info"]');
      await expect(etapa).toBeVisible({ timeout: 30_000 });
      await etapa.locator('select').first().selectOption('value');
      await etapa.getByLabel('Objetivo (% da aba)').fill('5');
      await page.getByRole('button', { name: 'Avançar' }).click();
      const post = page.waitForResponse(
        (r) => r.url().endsWith('/api/carteira/planejados') && r.request().method() === 'POST',
      );
      await page.getByRole('button', { name: 'Planejar', exact: true }).click();
      expect((await post).status()).toBeLessThan(300);

      await expect(bloco).toHaveAttribute('data-na-carteira', 'planejado', { timeout: 30_000 });
      await expect(bloco).toContainText('Planejado em Ações, com objetivo de 5% da aba');
    } finally {
      const depois = (await (await page.request.get('/api/analise-ativos/carteira')).json()) as {
        planejados: Record<string, { watchlistId: string }>;
      };
      const id = depois.planejados.ITUB4?.watchlistId;
      if (id) await apiDelete(page, `/api/carteira/planejados/${id}`).catch(() => undefined);
    }
  });
});
