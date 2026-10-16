import { test, expect, type Page } from '@playwright/test';
import { csrfHeaders, writesAllowed } from './helpers/api';
import { TICKERS_BLOCO_D_CI as T } from './fixtures/analise-bloco-d';

/**
 * Análise de Ativos — bloco 1 (Salvos) de ponta a ponta. GRAVA (projeto `escrita`, desktop 1280)
 * e DESFAZ: no `finally`, apaga pela API as listas e as comparações que o teste criou.
 *
 * Quadro (marcador) → página do ativo (Salvar e "Salvo em") → Salvos (lista "Salvos", abas, remover)
 * → Salvos › Alertas → Comparador (Salvar comparação e Exportar PDF).
 *
 * Só com E2E_ALLOW_WRITES=1, com config.recursos.salvos (e alertas / pdfComparador para as partes
 * deles) e com o usuário SEM listas no início (a regra "0 listas → cria 'Salvos'" é o que se testa).
 */

test.describe.configure({ mode: 'serial', timeout: 240_000 });

type Recursos = { salvos?: boolean; alertas?: boolean; pdfComparador?: boolean };

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

async function lerJson<R>(page: Page, url: string): Promise<R> {
  const res = await page.request.get(url);
  expect(res.ok(), `GET ${url} → ${res.status()}`).toBeTruthy();
  return (await res.json()) as R;
}

async function apagarCriados(page: Page, listasAntes: Set<string>, comparacoesAntes: Set<string>) {
  const headers = await csrfHeaders(page);
  const { listas } = await lerJson<{ listas: { id: string }[] }>(
    page,
    '/api/analise-ativos/listas',
  );
  for (const l of listas) {
    if (!listasAntes.has(l.id))
      await page.request.delete(`/api/analise-ativos/listas/${l.id}`, { headers });
  }
  for (const classe of ['acao', 'fii']) {
    const { comparacoes } = await lerJson<{ comparacoes: { id: string }[] }>(
      page,
      `/api/analise-ativos/comparacoes?classe=${classe}`,
    );
    for (const c of comparacoes) {
      if (!comparacoesAntes.has(c.id)) {
        await page.request.delete(`/api/analise-ativos/comparacoes/${c.id}`, { headers });
      }
    }
  }
}

test.describe('Salvos grava e desfaz', () => {
  test.skip(!writesAllowed(), 'só com E2E_ALLOW_WRITES=1');

  test('Quadro → ativo → Salvos → Alertas → Comparador', async ({ page }) => {
    await page.goto('/analise-ativos', { waitUntil: 'load' });
    const config = await lerJson<{ habilitada?: boolean; recursos?: Recursos }>(
      page,
      '/api/analise-ativos/config',
    );
    test.skip(
      config.habilitada !== true || config.recursos?.salvos !== true,
      'bloco 1: ANALISE_ATIVOS_SALVOS_HABILITADO desligado no servidor',
    );
    const { listas: listasIniciais } = await lerJson<{ listas: { id: string }[] }>(
      page,
      '/api/analise-ativos/listas',
    );
    test.skip(listasIniciais.length > 0, 'o usuário já tem listas (o teste parte de 0 listas)');
    const comparacoesAntes = new Set<string>();
    for (const classe of ['acao', 'fii']) {
      const { comparacoes } = await lerJson<{ comparacoes: { id: string }[] }>(
        page,
        `/api/analise-ativos/comparacoes?classe=${classe}`,
      );
      comparacoes.forEach((c) => comparacoesAntes.add(c.id));
    }

    try {
      // 1. Quadro: o marcador da linha cria a lista "Salvos" (0 listas)
      const marcador = page.locator(`[data-marcador-salvar="${T.acao}"]`).locator('visible=true');
      await expect(marcador).toBeVisible({ timeout: 90_000 });
      await expect(marcador).not.toHaveAttribute('data-salvo', '');
      await marcador.click();
      await expect(marcador).toHaveAttribute('data-salvo', '');
      await expect(page.getByText(`${T.acao} salvo em Salvos`).first()).toBeVisible();

      // 2. Página do ativo: Salvar (1 lista → alterna nela) e a linha "Salvo em"
      await page.goto(`/analise-ativos/${T.banco}`, { waitUntil: 'load' });
      const botao = page.locator('[data-botao-salvar]').locator('visible=true').first();
      await expect(botao).toBeVisible({ timeout: 90_000 });
      await botao.click();
      await expect(botao).toHaveAttribute('data-salvo', '');
      await expect(page.locator('[data-linha-salvo-em]').first()).toContainText('Salvos');

      // o Salvar é otimista: espera a gravação chegar ao servidor
      await expect
        .poll(async () => {
          const r = await lerJson<{
            listas: { nome: string; contagem: { acao: number; fii: number } }[];
          }>(page, '/api/analise-ativos/listas');
          return r.listas.map((l) => `${l.nome}:${l.contagem.acao}`);
        })
        .toEqual(['Salvos:2']);

      // 3. Salvos: os dois ativos na aba Ações; remover o 2º
      await page.goto('/analise-ativos/salvos', { waitUntil: 'load' });
      await expect(page.locator('[data-salvos-classe="acao"]')).toBeVisible({ timeout: 90_000 });
      const removerBanco = page.locator(`[data-remover="${T.banco}"]`).locator('visible=true');
      await expect(page.locator(`[data-remover="${T.acao}"]`).locator('visible=true')).toHaveCount(
        1,
      );
      await expect(removerBanco).toHaveCount(1);
      await removerBanco.click();
      await expect(removerBanco).toHaveCount(0);
      await expect
        .poll(async () => {
          const r = await lerJson<{ porTicker: Record<string, string[]> }>(
            page,
            '/api/analise-ativos/salvos',
          );
          return Object.keys(r.porTicker).sort();
        })
        .toEqual([T.acao]);

      // 4. Salvos › Alertas (só com o recurso)
      if (config.recursos?.alertas === true) {
        await page.goto('/analise-ativos/salvos?aba=alertas', { waitUntil: 'load' });
        await expect(page.locator('[data-salvos-pagina="alertas"]')).toBeVisible({
          timeout: 60_000,
        });
      }

      // 5. Comparador: Salvar comparação e Exportar PDF
      await page.goto(`/analise-ativos/comparador?t=${T.acao},${T.banco}`, { waitUntil: 'load' });
      await expect(page.locator('[data-comparador="acao"]')).toBeVisible({ timeout: 90_000 });
      await page
        .getByRole('button', { name: 'Salvar comparação' })
        .locator('visible=true')
        .first()
        .click();
      const modal = page.getByRole('dialog');
      await modal.getByRole('button', { name: 'Salvar comparação' }).click();
      await expect(
        page
          .getByRole('button', { name: /Comparação salva/ })
          .locator('visible=true')
          .first(),
      ).toBeVisible();
      await expect
        .poll(async () => {
          const r = await lerJson<{ comparacoes: { tickers: string[] }[] }>(
            page,
            '/api/analise-ativos/comparacoes?classe=acao',
          );
          return r.comparacoes.some((c) => c.tickers.join(',') === `${T.acao},${T.banco}`);
        })
        .toBe(true);

      if (config.recursos?.pdfComparador === true) {
        await page
          .getByRole('button', { name: 'Exportar PDF' })
          .locator('visible=true')
          .first()
          .click();
        const download = page.waitForEvent('download', { timeout: 60_000 });
        await page.getByRole('dialog').getByRole('button', { name: 'Baixar PDF' }).click();
        expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
      }
    } finally {
      await apagarCriados(page, new Set(), comparacoesAntes);
    }
  });
});
