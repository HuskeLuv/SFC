import { test, expect, type Page } from '@playwright/test';
import { apiDelete, apiPost, writesAllowed } from './helpers/api';

/**
 * Análise de Ativos — Stocks e REITs (feature EUA, fatia D) que GRAVA: projeto `escrita`,
 * desktop 1280, com o usuário demo e as rotas REAIS da Carteira.
 *  1. Planejar AAPL (sem posição) → linha planejada na aba Stocks com o Objetivo;
 *  2. Registrar AAPL 2× → UMA linha na aba Stocks (a recompra manda o Asset manual da posição);
 *  3. Registrar BRK.B → a posição entra na chave da Análise (BRK.B), não 'BRKB';
 *  4. Registrar O → aba REIT's;
 *  5. selo "Na carteira" e "Na sua carteira" com o MESMO valor da aba Stocks.
 * No fim DESFAZ tudo pelo Desfazer do Histórico (do mais novo para o mais antigo) e confere que
 * a carteira voltou ao que era; o que sobrar sai pelas rotas de exclusão.
 *
 * Só com E2E_ALLOW_WRITES=1, a área ligada para o demo e ANALISE_ATIVOS_EUA_HABILITADO (recursos.eua);
 * precisa do cadastro da SEC com AAPL, BRK-B e O (sem a página do ativo EUA, pula). Sem preço EUA
 * (decisão de 17/10), o preço é digitado; a cotação do dólar vem da Carteira ou é digitada.
 */

test.describe.configure({ mode: 'serial' });
test.use({ actionTimeout: 60_000, navigationTimeout: 120_000 });

interface ItemOverlay {
  portfolioId?: string;
  watchlistId?: string;
  quantidade?: number;
  objetivoPct?: number | null;
  categoria: string;
  assetId?: string;
}
interface Overlay {
  posicoes: Record<string, ItemOverlay>;
  planejados: Record<string, ItemOverlay>;
}
interface LinhaAba {
  ticker: string;
  quantidade: number;
  valorAtualizado: number;
  objetivo: number;
  planejado?: boolean;
}

const TICKERS = ['AAPL', 'BRK.B', 'O'] as const;

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

async function euaLigado(page: Page): Promise<boolean> {
  const res = await page.request.get('/api/analise-ativos/config');
  if (!res.ok()) return false;
  const c = (await res.json()) as { habilitada?: boolean; recursos?: { eua?: boolean } };
  return c.habilitada === true && c.recursos?.eua === true;
}

async function overlay(page: Page): Promise<Overlay> {
  return (await (await page.request.get('/api/analise-ativos/carteira')).json()) as Overlay;
}

async function linhasDaAba(page: Page, aba: 'stocks' | 'reit'): Promise<LinhaAba[]> {
  // o limitador do middleware (60/min por IP e rota) pode devolver 429: espera e tenta de novo
  for (let tentativa = 0; tentativa < 6; tentativa += 1) {
    const res = await page.request.get(`/api/carteira/${aba}`);
    if (res.ok()) {
      const dados = (await res.json()) as { secoes: Array<{ ativos: LinhaAba[] }> };
      return dados.secoes.flatMap((s) => s.ativos);
    }
    await page.waitForTimeout(5_000);
  }
  throw new Error(`GET /api/carteira/${aba} sem resposta`);
}

/** Linha da aba pelo ticker sem pontuação (a aba REIT's traz o symbol manual 'O-<ts>-<rnd>'). */
const daAba = (linhas: LinhaAba[], ticker: string) =>
  linhas.filter(
    (l) =>
      l.ticker
        .split('-')[0]
        .replace(/[^A-Z0-9]/gi, '')
        .toUpperCase() === ticker.replace(/[^A-Z0-9]/gi, '').toUpperCase(),
  );

async function abrirAtivo(page: Page, ticker: string): Promise<boolean> {
  await page.goto(`/analise-ativos/${ticker}`, { waitUntil: 'load' });
  const pagina = page.locator(`[data-pagina-ativo="${ticker}"]`);
  try {
    await expect(pagina).toBeVisible({ timeout: 60_000 });
  } catch {
    return false;
  }
  await expect(page.locator('[data-acoes-carteira]')).toBeVisible({ timeout: 30_000 });
  return true;
}

const dialogo = (page: Page) => page.getByRole('dialog');

async function escolherInstituicao(page: Page, recompra = false) {
  const campo = dialogo(page).locator('#instituicao');
  // recompra: a instituição da última aquisição chega com a posição (GET /api/ativos/[id])
  if (recompra)
    await expect(campo)
      .not.toHaveValue('', { timeout: 20_000 })
      .catch(() => {});
  if (await campo.inputValue()) return;
  await campo.fill('XP');
  const opcao = dialogo(page).getByRole('button', { name: /XP/ }).first();
  await opcao.waitFor({ timeout: 30_000 });
  await opcao.click();
}

/** Abre o Registrar, preenche e grava; devolve o corpo enviado ao POST da operação. */
async function registrarCompra(
  page: Page,
  ticker: string,
  quantidade: number,
  precoUsd: string,
  recompra = false,
): Promise<Record<string, unknown>> {
  await page.locator('[data-botao-registrar]').click();
  await expect(dialogo(page)).toContainText(`Registrar operação · ${ticker}`);
  // sem a cotação EUA licenciada, o preço vem em branco
  const preco = dialogo(page).getByLabel(/Preço por ação/);
  await expect(preco).toHaveValue('');
  await dialogo(page)
    .getByLabel(/Quantidade/)
    .fill(String(quantidade));
  await preco.fill(precoUsd);
  const cambio = dialogo(page).locator('[data-campo-cambio]');
  // a cotação do dólar vem da aba da Carteira; sem ela (ambiente sem indicador), digita
  await page.waitForTimeout(1000);
  if (!(await cambio.inputValue())) await cambio.fill('5,40');
  await escolherInstituicao(page, recompra);
  const req = page.waitForRequest(
    (r) => r.url().endsWith('/api/carteira/operacao') && r.method() === 'POST',
  );
  const resp = page.waitForResponse(
    (r) => r.url().endsWith('/api/carteira/operacao') && r.request().method() === 'POST',
    { timeout: 60_000 },
  );
  await dialogo(page).getByRole('button', { name: 'Registrar', exact: true }).click();
  const corpo = (await req).postDataJSON() as Record<string, unknown>;
  expect((await resp).status()).toBeLessThan(300);
  await expect(dialogo(page)).toHaveCount(0, { timeout: 30_000 });
  return corpo;
}

/** Desfaz, do mais novo para o mais antigo, o que o Histórico registrou desde `desde`. */
async function desfazerDesde(page: Page, desde: string, anotar: (m: string) => void) {
  const res = await page.request.get(
    `/api/historico-alteracoes?from=${encodeURIComponent(desde)}&limit=50`,
  );
  if (!res.ok()) return anotar(`historico ${res.status()}`);
  const { data } = (await res.json()) as { data: Array<{ id: string; canUndo: boolean }> };
  for (const e of data) {
    if (!e.canUndo) continue;
    await apiPost(page, `/api/historico-alteracoes/${e.id}/undo`, {}).catch((err: unknown) =>
      anotar(String(err)),
    );
  }
}

test.describe('Stocks/REITs: Planejar, Registrar e Na sua carteira (EUA)', () => {
  test.skip(!writesAllowed(), 'só com E2E_ALLOW_WRITES=1');

  test('planeja AAPL, registra AAPL 2× (1 linha), BRK.B e O — desfaz tudo', async ({ page }) => {
    test.skip(!(await euaLigado(page)), 'EUA desligado ou demo fora do beta');
    test.setTimeout(600_000);
    const antes = await overlay(page);
    test.skip(
      TICKERS.some((t) => antes.posicoes[t] || antes.planejados[t]),
      'o demo já tem um dos tickers EUA',
    );
    test.skip(!(await abrirAtivo(page, 'AAPL')), 'página do ativo EUA indisponível');
    const anotar = (m: string) => test.info().annotations.push({ type: 'limpeza', description: m });
    const inicio = new Date(Date.now() - 1000).toISOString();

    try {
      // 1. Planejar AAPL sem posição → planejado na aba Stocks, com o Objetivo
      await expect(page.locator('[data-acoes-carteira="nada"]')).toBeVisible({ timeout: 30_000 });
      await page.locator('[data-botao-planejar]').click();
      const peso = dialogo(page).getByLabel('Peso-alvo dentro de Stocks (%)');
      await expect(peso).toBeVisible();
      await page.waitForTimeout(1500);
      await peso.fill('10');
      await dialogo(page).getByRole('button', { name: 'Salvar na Carteira' }).click();
      await expect(dialogo(page)).toHaveCount(0, { timeout: 30_000 });
      await expect
        .poll(async () => (await overlay(page)).planejados.AAPL?.objetivoPct, { timeout: 30_000 })
        .toBe(10);
      const planejadas = daAba(await linhasDaAba(page, 'stocks'), 'AAPL');
      expect(planejadas).toHaveLength(1);
      expect(planejadas[0]).toMatchObject({ objetivo: 10, planejado: true });

      // 2. Registrar AAPL 2× → 1 linha na aba Stocks, quantidade somada
      const c1 = await registrarCompra(page, 'AAPL', 2, '200');
      expect(c1).toMatchObject({ tipoAtivo: 'stock', moeda: 'USD', ativo: 'AAPL' });
      await expect
        .poll(async () => (await overlay(page)).posicoes.AAPL?.quantidade, { timeout: 30_000 })
        .toBe(2);
      const assetAapl = (await overlay(page)).posicoes.AAPL.assetId;
      expect(assetAapl).toBeTruthy();
      await expect(page.locator('[data-acoes-carteira="posicao"]')).toBeVisible({
        timeout: 30_000,
      });
      const c2 = await registrarCompra(page, 'AAPL', 3, '210', true);
      // a recompra manda o Asset manual da posição (sem 2º Asset)
      expect(c2.assetId).toBe(assetAapl);
      await expect
        .poll(async () => (await overlay(page)).posicoes.AAPL?.quantidade, { timeout: 30_000 })
        .toBe(5);
      const linhasAapl = daAba(await linhasDaAba(page, 'stocks'), 'AAPL');
      expect(linhasAapl, 'uma única linha de AAPL na aba Stocks').toHaveLength(1);
      expect(linhasAapl[0]).toMatchObject({ quantidade: 5, objetivo: 10 });

      // 5. selo "Na carteira"; "Na sua carteira" do stock = quantidade + link para a aba Stocks
      // (a Carteira guarda o preço médio do stock em R$ e soma a cotação em US$: sem valor aqui)
      await page.reload({ waitUntil: 'load' });
      await expect(page.getByText('Na carteira', { exact: true }).first()).toBeVisible({
        timeout: 30_000,
      });
      const bloco = page.locator('section[data-na-carteira]');
      await expect(bloco).toHaveAttribute('data-na-carteira', 'aba', { timeout: 30_000 });
      await expect(bloco).toContainText(
        'O ativo está na aba Stocks da sua Carteira. Os números ficam lá.',
      );
      await expect(bloco).not.toContainText('US$');
      await expect(bloco).not.toContainText('da carteira');

      // 3. BRK.B → chave da Análise
      expect(await abrirAtivo(page, 'BRK.B')).toBe(true);
      const c3 = await registrarCompra(page, 'BRK.B', 1, '450');
      expect(c3).toMatchObject({ tipoAtivo: 'stock', assetId: 'STOCK-MANUAL', ativo: 'BRK.B' });
      await expect
        .poll(async () => (await overlay(page)).posicoes['BRK.B']?.quantidade, { timeout: 30_000 })
        .toBe(1);
      expect(daAba(await linhasDaAba(page, 'stocks'), 'BRK.B')).toHaveLength(1);

      // 4. O → aba REIT's
      expect(await abrirAtivo(page, 'O')).toBe(true);
      const c4 = await registrarCompra(page, 'O', 10, '57,5');
      expect(c4).toMatchObject({
        tipoAtivo: 'reit',
        assetId: 'REIT-MANUAL',
        estrategiaReit: 'value',
      });
      await expect
        .poll(async () => (await overlay(page)).posicoes.O?.categoria, { timeout: 30_000 })
        .toBe('reits');
      expect(daAba(await linhasDaAba(page, 'reit'), 'O')).toHaveLength(1);
      // REIT em US$ e sem pesos que misturam US$ e R$ (% da carteira, classe, ≈ % do total)
      await page.reload({ waitUntil: 'load' });
      const blocoO = page.locator('section[data-na-carteira]');
      await expect(blocoO).toHaveAttribute('data-na-carteira', 'posicao', { timeout: 30_000 });
      await expect(blocoO).toContainText('US$');
      await expect(blocoO).not.toContainText('da carteira');
    } finally {
      await desfazerDesde(page, inicio, anotar);
      const depois = await overlay(page);
      for (const t of TICKERS) {
        const p = depois.posicoes[t];
        if (p?.portfolioId) {
          anotar(`sobrou posição ${t}`);
          await apiDelete(page, `/api/ativos/${p.portfolioId}/portfolio`).catch((e: unknown) =>
            anotar(String(e)),
          );
        }
        const w = depois.planejados[t];
        if (w?.watchlistId) {
          anotar(`sobrou plano ${t}`);
          await apiDelete(page, `/api/carteira/planejados/${w.watchlistId}`).catch((e: unknown) =>
            anotar(String(e)),
          );
        }
      }
      const final = await overlay(page);
      for (const t of TICKERS) {
        expect(final.posicoes[t], `posição ${t} desfeita`).toBeUndefined();
        expect(final.planejados[t], `plano ${t} desfeito`).toBeUndefined();
      }
    }
  });
});
