import { test, expect, type Page } from '@playwright/test';
import { apiDelete, apiPost, writesAllowed } from './helpers/api';

/**
 * Análise de Ativos v2.4 — fatia C1: cabeçalho do ativo e modais da Carteira que GRAVAM (projeto
 * `escrita`, desktop 1280). Sobre as rotas REAIS da Carteira, com o usuário demo:
 *  1. compra NOVA de ação pelo modal "Registrar operação" — seção obrigatória (estratégia);
 *  2. RECOMPRA — o modal não pede a seção (usa a da posição);
 *  3. VENDA — sem 400 de instituição (a rota usa a da última aquisição); posição reduzida;
 *  4. Planejar um FII pelo modal "Planejar na carteira" (chip "Planejado") e a 1ª compra dele —
 *     a seção do plano é preservada (Portfolio.tipoFii = a do plano, conferido no overlay).
 * No fim DESFAZ tudo pelo Desfazer do Histórico (do mais novo para o mais antigo) e confere que a
 * carteira voltou ao que era; se sobrar algo, apaga pelas rotas de exclusão.
 *
 * Só com E2E_ALLOW_WRITES=1 (CI: banco efêmero) e com a área ligada para o demo.
 */

test.describe.configure({ mode: 'serial' });
// Ação travada falha em 1 min (sem isso ela espera o teste inteiro e o `finally` não limpa).
test.use({ actionTimeout: 60_000, navigationTimeout: 120_000 });

interface Overlay {
  posicoes: Record<
    string,
    { portfolioId: string; quantidade: number; estrategia?: string | null; tipoFii?: string | null }
  >;
  planejados: Record<string, { watchlistId: string; secao?: string | null }>;
}

const CANDIDATOS_ACAO = ['WEGE3', 'PETR4', 'VALE3', 'TAEE11', 'ITUB4', 'BBAS3', 'AURE3'];
const CANDIDATOS_FII = ['KNCR11', 'XPLG11', 'HGLG11', 'MXRF11'];

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

async function overlay(page: Page): Promise<Overlay> {
  return (await (await page.request.get('/api/analise-ativos/carteira')).json()) as Overlay;
}

/** 1º candidato com Asset no catálogo e sem posição nem plano do demo. */
async function escolherLivre(page: Page, candidatos: string[]): Promise<string | null> {
  const o = await overlay(page);
  for (const t of candidatos) {
    if (o.posicoes[t] || o.planejados[t]) continue;
    const r = await page.request.get(`/api/analise-ativos/ativos/${t}`);
    if (!r.ok()) continue;
    const topo = (await r.json()) as { assetId: string | null; cotacao: { preco: number | null } };
    if (topo.assetId && topo.cotacao.preco) return t;
  }
  return null;
}

async function abrirAtivo(page: Page, ticker: string) {
  await page.goto(`/analise-ativos/${ticker}`, { waitUntil: 'load' });
  await expect(page.locator(`[data-pagina-ativo="${ticker}"]`)).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-acoes-carteira]')).toBeVisible({ timeout: 30_000 });
}

const dialogo = (page: Page) => page.getByRole('dialog');

async function escolherInstituicao(page: Page) {
  const campo = dialogo(page).locator('#instituicao');
  await campo.fill('XP');
  const opcao = dialogo(page).getByRole('button', { name: /XP/ }).first();
  await opcao.waitFor({ timeout: 30_000 });
  await opcao.click();
}

async function registrar(page: Page, rota: '/api/carteira/operacao' | '/api/carteira/resgate') {
  const resp = page.waitForResponse(
    (r) => r.url().endsWith(rota) && r.request().method() === 'POST',
    { timeout: 60_000 },
  );
  await dialogo(page).getByRole('button', { name: 'Registrar', exact: true }).click();
  const r = await resp;
  expect(r.status()).toBeLessThan(300);
  await expect(dialogo(page)).toHaveCount(0, { timeout: 30_000 });
}

/** Desfaz, do mais novo para o mais antigo, o que o Histórico registrou desde `desde`. */
async function desfazerDesde(page: Page, desde: string, anotar: (m: string) => void) {
  const res = await page.request.get(
    `/api/historico-alteracoes?from=${encodeURIComponent(desde)}&limit=50`,
  );
  if (!res.ok()) return anotar(`historico ${res.status()}`);
  const { data } = (await res.json()) as { data: Array<{ id: string; canUndo: boolean }> };
  for (const e of data) {
    await apiPost(page, `/api/historico-alteracoes/${e.id}/undo`, {}).catch((err: unknown) =>
      anotar(String(err)),
    );
  }
}

test.describe('Registrar operação e Planejar pela página do ativo', () => {
  test.skip(!writesAllowed(), 'só com E2E_ALLOW_WRITES=1');

  test('compra nova, recompra, venda e compra de FII planejado — desfaz tudo', async ({ page }) => {
    test.skip(!(await areaLigada(page)), 'área desligada ou demo fora do beta');
    test.setTimeout(600_000);
    const acao = await escolherLivre(page, CANDIDATOS_ACAO);
    const fii = await escolherLivre(page, CANDIDATOS_FII);
    test.skip(!acao || !fii, 'sem ação/FII livre no catálogo para o demo');
    const anotar = (m: string) => test.info().annotations.push({ type: 'limpeza', description: m });
    // Margem de 1 s contra relógio do servidor × navegador.
    const inicio = new Date(Date.now() - 1000).toISOString();

    try {
      // 1. Compra NOVA de ação: seção obrigatória.
      await abrirAtivo(page, acao!);
      await expect(page.locator('[data-acoes-carteira="nada"]')).toBeVisible({ timeout: 30_000 });
      await page.locator('[data-botao-registrar]').click();
      await expect(dialogo(page)).toContainText(`Registrar operação · ${acao}`);
      await dialogo(page)
        .getByLabel(/Quantidade/)
        .fill('10');
      await escolherInstituicao(page);
      await dialogo(page).getByRole('button', { name: 'Registrar', exact: true }).click();
      await expect(
        dialogo(page).getByText('Escolha a seção da Carteira em que o ativo vai entrar.'),
      ).toBeVisible();
      await dialogo(page).getByLabel('Seção na Carteira').selectOption('growth');
      await registrar(page, '/api/carteira/operacao');
      await expect
        .poll(async () => (await overlay(page)).posicoes[acao!]?.quantidade, { timeout: 30_000 })
        .toBe(10);
      expect((await overlay(page)).posicoes[acao!].estrategia).toBe('growth');
      await expect(page.locator('[data-acoes-carteira="posicao"]')).toBeVisible({
        timeout: 30_000,
      });

      // 2. RECOMPRA: não pede a seção.
      await page.locator('[data-botao-registrar]').click();
      await expect(dialogo(page).getByText('Estratégia: Growth (da sua posição)')).toBeVisible({
        timeout: 30_000,
      });
      await expect(dialogo(page).getByLabel(/Seção na Carteira/)).toHaveCount(0);
      await dialogo(page)
        .getByLabel(/Quantidade/)
        .fill('5');
      const inst = dialogo(page).locator('#instituicao');
      if (!(await inst.inputValue())) await escolherInstituicao(page);
      await registrar(page, '/api/carteira/operacao');
      await expect
        .poll(async () => (await overlay(page)).posicoes[acao!]?.quantidade, { timeout: 30_000 })
        .toBe(15);

      // 3. VENDA: sem instituição no corpo, sem 400; posição reduzida.
      await page.locator('[data-botao-registrar]').click();
      await dialogo(page).getByRole('button', { name: 'Venda' }).click();
      await expect(dialogo(page).getByText(/da última aquisição/)).toBeVisible({ timeout: 30_000 });
      await dialogo(page)
        .getByLabel(/Quantidade/)
        .fill('4');
      const corpoVenda = page.waitForRequest(
        (r) => r.url().endsWith('/api/carteira/resgate') && r.method() === 'POST',
      );
      await registrar(page, '/api/carteira/resgate');
      expect((await corpoVenda).postDataJSON()).not.toHaveProperty('instituicaoId');
      await expect
        .poll(async () => (await overlay(page)).posicoes[acao!]?.quantidade, { timeout: 30_000 })
        .toBe(11);

      // 4. Planejar o FII pelo modal (chip "Planejado") e a 1ª compra preserva a seção do plano.
      await abrirAtivo(page, fii!);
      await page.locator('[data-botao-planejar]').click();
      await dialogo(page)
        .getByLabel(/Peso-alvo dentro de/)
        .fill('5');
      const plano = page.waitForResponse(
        (r) => r.url().endsWith('/api/carteira/planejados') && r.request().method() === 'POST',
      );
      await dialogo(page).getByRole('button', { name: 'Salvar no Planejamento' }).click();
      expect((await plano).status()).toBeLessThan(300);
      await expect(page.locator('[data-bloco="cabecalho"]').getByText('Planejado')).toBeVisible({
        timeout: 30_000,
      });
      const secaoPlano = (await overlay(page)).planejados[fii!]?.secao ?? null;
      expect(secaoPlano).toBeTruthy();

      await page.locator('[data-botao-registrar]').click();
      const secao = dialogo(page).getByLabel('Seção na Carteira (do seu plano)');
      await expect(secao).toHaveValue(secaoPlano!, { timeout: 30_000 });
      await dialogo(page)
        .getByLabel(/Quantidade/)
        .fill('2');
      await escolherInstituicao(page);
      await registrar(page, '/api/carteira/operacao');
      await expect
        .poll(async () => (await overlay(page)).posicoes[fii!]?.tipoFii, { timeout: 30_000 })
        .toBe(secaoPlano);
    } finally {
      await desfazerDesde(page, inicio, anotar);
      // Conferência: a carteira voltou ao que era; o que sobrar sai pelas rotas de exclusão.
      const depois = await overlay(page);
      for (const t of [acao, fii]) {
        if (!t) continue;
        const p = depois.posicoes[t];
        if (p) {
          anotar(`sobrou posição ${t}`);
          await apiDelete(page, `/api/ativos/${p.portfolioId}/portfolio`).catch((e: unknown) =>
            anotar(String(e)),
          );
        }
        const w = depois.planejados[t];
        if (w) {
          anotar(`sobrou plano ${t}`);
          await apiDelete(page, `/api/carteira/planejados/${w.watchlistId}`).catch((e: unknown) =>
            anotar(String(e)),
          );
        }
      }
      const final = await overlay(page);
      expect(final.posicoes[acao ?? ''], 'posição da ação desfeita').toBeUndefined();
      expect(final.posicoes[fii ?? ''], 'posição do FII desfeita').toBeUndefined();
      expect(final.planejados[fii ?? ''], 'plano do FII desfeito').toBeUndefined();
    }
  });
});
