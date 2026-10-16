import { test, expect, type Page } from '@playwright/test';
import { apiDelete, writesAllowed } from './helpers/api';

/**
 * Análise de Ativos — usuário (fatia D) que GRAVA: projeto `escrita`, desktop 1280.
 *
 * - "Na sua carteira" = Carteira: a posição do demo (MXRF11 no seed) em % da carteira TOTAL
 *   (v2.5: valorAtualizado da aba FII's ÷ totais.dinheiro do resumo da Carteira), 1 casa.
 * - Tese em WEGE3: escreve, salva sozinha, recarrega, apaga pela tela. O `finally` apaga pela API.
 * - Planejar pelo modal "Planejar na carteira" (v2.5, planning_asset_targets): salvar acende o chip
 *   "Planejado" e o card mostra o alvo; "Remover do plano" apaga e o chip some. Nenhuma chamada às
 *   rotas do Objetivo da Carteira (/objetivo, /planejados). O `finally` apaga o alvo pela API.
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

const pct1 = (v: number) =>
  `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

test.describe('Na sua carteira (leitura)', () => {
  test('MXRF11: posição em % da carteira total, igual à conta da Carteira', async ({ page }) => {
    test.skip(!(await areaLigada(page)), 'área desligada ou demo fora do beta');
    test.setTimeout(180_000);
    // Lê a conta da Carteira e a tela juntas, até baterem: o teste de escrita anterior desfaz
    // compras e o resumo (cache de 60 s) pode chegar entre a leitura da API e a da tela.
    let linha: { ticker: string; valorAtualizado: number; objetivo: number } | undefined;
    await expect(async () => {
      const aba = await page.request.get('/api/carteira/fii');
      expect(aba.ok()).toBe(true);
      const dados = (await aba.json()) as {
        secoes: Array<{
          ativos: Array<{ ticker: string; valorAtualizado: number; objetivo: number }>;
        }>;
      };
      linha = dados.secoes.flatMap((s) => s.ativos).find((a) => a.ticker === 'MXRF11');
      if (!linha) return;
      const resumo = (await (await page.request.get('/api/carteira/resumo')).json()) as {
        totais?: { dinheiro?: number };
      };
      const total = resumo.totais?.dinheiro ?? 0;
      expect(total, 'resumo sem totais.dinheiro').toBeGreaterThan(0);

      await abrirAtivo(page, 'MXRF11');
      const bloco = blocoCarteira(page);
      await expect(bloco).toHaveAttribute('data-na-carteira', 'posicao', { timeout: 30_000 });
      await expect(bloco.locator('[data-barra-peso]')).toContainText(
        `posição atual ${pct1((linha.valorAtualizado / total) * 100)}`,
        { timeout: 10_000 },
      );
    }).toPass({ timeout: 120_000 });
    test.skip(!linha, "demo sem MXRF11 na aba FII's");
    const bloco = blocoCarteira(page);
    // decisão 1: Objetivo da aba na Carteira só como linha informativa
    if (linha!.objetivo > 0) {
      await expect(bloco.locator('[data-objetivo-aba]')).toContainText('Objetivo na aba');
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

  test('Planejar na carteira: salva o alvo (chip Planejado), remove (chip some); desfaz no fim', async ({
    page,
  }) => {
    test.skip(!(await areaLigada(page)), 'área desligada ou demo fora do beta');
    test.setTimeout(180_000);
    const TICKER = 'ITUB4';
    const antes = (await (await page.request.get('/api/analise-ativos/carteira')).json()) as {
      alvos?: Record<string, unknown>;
    };
    test.skip(!!antes.alvos?.[TICKER], `demo já tem alvo planejado para ${TICKER}`);
    const rotasCarteira: string[] = [];
    page.on('request', (r) => {
      if (r.method() !== 'GET' && /\/api\/carteira\/.*(objetivo|planejados)/.test(r.url())) {
        rotasCarteira.push(`${r.method()} ${r.url()}`);
      }
    });
    const chip = () =>
      page.locator('[data-bloco="cabecalho"]').getByText('Planejado', { exact: true });
    try {
      await abrirAtivo(page, TICKER);
      const bloco = blocoCarteira(page);
      await expect(bloco).toHaveAttribute('data-na-carteira', /nada|planejado|posicao/, {
        timeout: 30_000,
      });
      await expect(chip()).toHaveCount(0);
      await page.locator('[data-botao-planejar]').click();
      const modal = page.getByRole('dialog');
      await expect(modal).toContainText(`Planejar na carteira · ${TICKER}`);
      const campo = modal.getByLabel('Peso-alvo na carteira (%)');
      await expect(campo).toHaveValue('');
      await expect(campo).toHaveAttribute('placeholder', 'ex.: 5');
      await campo.fill('5');
      await expect(modal.locator('[data-resumo-plano]')).toContainText(
        'Valor equivalente ao alvo',
        { timeout: 30_000 },
      );
      await expect(modal.locator('select')).toHaveCount(0);
      const put = page.waitForResponse(
        (r) =>
          r.url().endsWith(`/api/analise-ativos/alvos/${TICKER}`) && r.request().method() === 'PUT',
      );
      await modal.getByRole('button', { name: 'Salvar no Planejamento' }).click();
      expect((await put).status()).toBe(200);
      await expect(modal).toHaveCount(0, { timeout: 30_000 });

      await expect(chip()).toBeVisible({ timeout: 30_000 });
      await expect(bloco).toContainText('alvo planejado por você: 5,0%', { timeout: 30_000 });
      await expect(bloco).not.toContainText(/faltam|compre/i);
      await expect(page.locator('[data-botao-planejar]')).toHaveText(/Ajustar plano/);

      // Remover do plano
      await page.locator('[data-botao-planejar]').click();
      await expect(modal).toContainText(`Ajustar plano · ${TICKER}`);
      await expect(modal.getByLabel('Peso-alvo na carteira (%)')).toHaveValue('5');
      const del = page.waitForResponse(
        (r) =>
          r.url().endsWith(`/api/analise-ativos/alvos/${TICKER}`) &&
          r.request().method() === 'DELETE',
      );
      await modal.getByRole('button', { name: 'Remover do plano' }).click();
      expect((await del).status()).toBe(200);
      await expect(chip()).toHaveCount(0, { timeout: 30_000 });
      await expect(bloco).toContainText('sem alvo planejado', { timeout: 30_000 });
      expect(rotasCarteira, 'o Planejar não mexe no Objetivo da Carteira').toEqual([]);
    } finally {
      await apiDelete(page, `/api/analise-ativos/alvos/${TICKER}`).catch(() => undefined);
    }
  });
});
