import { test, expect, type Page } from '@playwright/test';
import { apiDelete, apiPost, writesAllowed } from './helpers/api';
import { expectMinTarget, prepareMobilePage } from './helpers/mobileFit';
import { expectNoHorizontalOverflow } from './helpers/horizontalOverflow';

/**
 * Banco emissor na edição do ativo (ClickUp 86e2xqh69, fatia B) — projeto `escrita`.
 *
 * Só com E2E_ALLOW_WRITES=1. Cada teste cria um CDB (corretora BTG do seed) pela API de
 * operação — sem emissor no body, o servidor grava a corretora — e APAGA a posição no fim.
 * Desktop 1280 e celular 390 (isMobile), claro e escuro:
 * - ?editar=emissor abre o picker com foco no campo;
 * - escolher um banco salva e sobrevive ao reload; "Usar a corretora" volta ao padrão;
 * - busca sem resultado mostra a mensagem; botões novos com 44px ou mais.
 * Um CRI não mostra o campo e a corretora continua "Instituição financeira".
 */

const EMISSOR_BUSCA = 'Inter';
const EMISSOR_NOME = /Banco Inter/;

/** Instituição do catálogo pela busca; prefere o código COMPE (o import do Bacen traz homônimos). */
async function instituicaoPorNome(
  page: Page,
  busca: string,
  codigo: string,
): Promise<{ id: string; nome: string }> {
  const res = await page.request.get(`/api/institutions?search=${encodeURIComponent(busca)}`);
  expect(res.ok(), `GET /api/institutions?search=${busca}`).toBeTruthy();
  const body = (await res.json()) as {
    institutions?: { id: string; nome: string; codigo: string }[];
  };
  const lista = body.institutions ?? [];
  const inst = lista.find((i) => i.codigo === codigo) ?? lista[0];
  if (!inst) throw new Error(`instituição "${busca}" ausente do catálogo`);
  return inst;
}

/** Cria a RF pela API (como o wizard) e devolve o id do Portfolio. */
async function criarRendaFixa(page: Page, descricao: string, rendaFixaTipo: string) {
  const corretora = await instituicaoPorNome(page, 'BTG', '208');
  await apiPost(page, '/api/carteira/operacao', {
    tipoAtivo: 'renda-fixa-posfixada',
    instituicaoId: corretora.id,
    rendaFixaTipo,
    rendaFixaIndexer: 'CDI',
    taxaJurosAnual: 110,
    dataInicio: '2026-09-01',
    dataVencimento: '2030-01-15',
    valorAplicado: 1000,
    descricao,
  });
  const res = await page.request.get('/api/carteira/renda-fixa');
  expect(res.ok(), 'GET /api/carteira/renda-fixa').toBeTruthy();
  const body = (await res.json()) as { secoes?: { ativos?: { id: string; nome: string }[] }[] };
  const ativo = (body.secoes ?? [])
    .flatMap((s) => s.ativos ?? [])
    .find((a) => a.nome === descricao);
  if (!ativo) throw new Error(`"${descricao}" não apareceu na Renda Fixa`);
  criados.push(ativo.id);
  return { portfolioId: ativo.id, corretora };
}

/** Posições criadas pelo teste: apagadas no afterEach (roda mesmo quando o teste estoura). */
const criados: string[] = [];

test.afterEach(async ({ page }) => {
  for (const id of criados.splice(0)) {
    await apiDelete(page, `/api/ativos/${id}/portfolio`).catch(() => {});
  }
});

const casos = [
  { nome: 'desktop claro', largura: 1280, mobile: false, tema: 'light' },
  { nome: 'desktop escuro', largura: 1280, mobile: false, tema: 'dark' },
  { nome: 'celular claro', largura: 390, mobile: true, tema: 'light' },
  { nome: 'celular escuro', largura: 390, mobile: true, tema: 'dark' },
] as const;

for (const caso of casos) {
  test.describe(`banco emissor na edição do ativo — ${caso.nome}`, () => {
    test.skip(!writesAllowed(), 'só com E2E_ALLOW_WRITES=1');
    test.use({
      viewport: { width: caso.largura, height: caso.mobile ? 844 : 900 },
      isMobile: caso.mobile,
      hasTouch: caso.mobile,
    });

    test.beforeEach(async ({ page }) => {
      await prepareMobilePage(page);
      await page.addInitScript((tema) => {
        try {
          localStorage.setItem('theme', tema);
        } catch {
          // sem storage: tema claro
        }
      }, caso.tema);
    });

    test('deep link abre o picker; escolher, recarregar e "Usar a corretora"', async ({ page }) => {
      test.setTimeout(120_000);
      const descricao = `CDB E2E emissor ${caso.largura}-${caso.tema} ${Date.now()}`;
      const { portfolioId, corretora } = await criarRendaFixa(page, descricao, 'CDB_PRE');
      await page.goto(`/ativos/${portfolioId}/editar?editar=emissor`, {
        waitUntil: 'domcontentloaded',
      });
      const campo = page.locator('#emissor');
      await expect(campo, 'picker aberto pelo deep link').toBeVisible({ timeout: 60_000 });
      await expect(campo, 'foco no campo').toBeFocused();
      await expect(page.getByText('Corretora', { exact: true })).toBeVisible();

      // Busca sem resultado.
      await campo.fill('zzqx sem banco');
      await expect(page.getByText(/Nenhum banco encontrado/)).toBeVisible();

      // Botões do modo edição com 44px.
      await expectMinTarget(page.getByRole('button', { name: 'Usar a corretora' }));
      await expectMinTarget(page.getByRole('button', { name: 'Cancelar' }).first());

      // Escolher outro banco salva na hora.
      await campo.fill(EMISSOR_BUSCA);
      const opcao = page.getByRole('button', { name: EMISSOR_NOME }).first();
      await expect(opcao).toBeVisible();
      const patch = page.waitForResponse(
        (r) => r.url().endsWith(`/api/ativos/${portfolioId}`) && r.request().method() === 'PATCH',
      );
      await opcao.click();
      expect((await patch).status()).toBe(200);
      await expect(
        page.getByRole('status').filter({ hasText: 'Emissor atualizado' }),
      ).toBeVisible();
      const editar = page.getByRole('button', { name: /Editar emissor: Banco Inter/ });
      await expect(editar).toBeFocused();
      await expectNoHorizontalOverflow(page, `/ativos/${portfolioId}/editar`);

      if (!process.env.CI) {
        await page.screenshot({
          path: `test-results/ativo-editar-emissor-${caso.largura}-${caso.tema}.png`,
          fullPage: true,
        });
      }

      // Persistiu (sem o ?editar=emissor, que reabriria o picker).
      await page.goto(`/ativos/${portfolioId}/editar`, { waitUntil: 'domcontentloaded' });
      await expect(editar).toBeVisible({ timeout: 60_000 });
      await expectMinTarget(editar);

      // "Usar a corretora" volta ao padrão: Não informado + Informar emissor.
      await editar.click();
      await expect(page.locator('#emissor')).toBeFocused();
      await page.getByRole('button', { name: 'Usar a corretora' }).click();
      const informar = page.getByRole('button', { name: 'Informar emissor' });
      await expect(informar).toBeVisible();
      await expect(page.getByText('Não informado')).toBeVisible();
      await expect(
        page.getByText(`A Cobertura FGC está usando a corretora (${corretora.nome})`, {
          exact: false,
        }),
      ).toBeVisible();
      await expectMinTarget(informar);
    });
  });
}

test.describe('banco emissor — produto fora do FGC', () => {
  test.skip(!writesAllowed(), 'só com E2E_ALLOW_WRITES=1');

  test('CRI não mostra o campo e mantém "Instituição financeira"', async ({ page }) => {
    test.setTimeout(120_000);
    await prepareMobilePage(page);
    const descricao = `CRI E2E emissor ${Date.now()}`;
    const { portfolioId } = await criarRendaFixa(page, descricao, 'CRI_PRE');
    await page.goto(`/ativos/${portfolioId}/editar?editar=emissor`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByText('Instituição financeira', { exact: true })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.locator('[data-campo="emissor"]')).toHaveCount(0);
    await expect(page.locator('#emissor')).toHaveCount(0);
  });
});
