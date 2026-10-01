import { test, expect, type Locator, type Page, type Response } from '@playwright/test';
import { apiPost, writesAllowed } from './helpers/api';
import { openCarteiraTab, waitCarteiraReady } from './helpers/mobileFit';

/**
 * Mover investimentos (out/2026, Fatia E) que GRAVA — projeto `escrita`, desktop 1280.
 *
 * Só com `E2E_ALLOW_WRITES=1`. Move o FII do demo (MXRF11 no seed) de seção arrastando pela alça,
 * confere depois do reload, leva até a aba Fundos pela bandeja "Outra aba" (popover de seção →
 * Fiagro), confere, tenta uma aba recusada e DESFAZ tudo no fim pelo Histórico de alterações
 * (POST /api/historico-alteracoes/:id/undo, do mais novo para o mais antigo), voltando o ativo à
 * seção e à aba de origem com o objetivo de antes. Afirma só sobre o ativo que moveu.
 */

const TICKER = process.env.E2E_MOVER_TICKER ?? 'MXRF11';

test.describe.configure({ mode: 'serial' });

async function gotoAba(page: Page, aba: string) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.mouse.move(900, 500);
  await page.goto('/carteira', { waitUntil: 'domcontentloaded' });
  await waitCarteiraReady(page);
  await openCarteiraTab(page, aba);
  await page
    .waitForFunction(() => !document.body.innerText.includes('Carregando dados'), null, {
      timeout: 60_000,
    })
    .catch(() => {});
}

const linhaDo = (page: Page, ticker: string) =>
  page.locator('tr[data-mover-linha]').filter({
    has: page.getByRole('button', { name: `Arrastar ${ticker}`, exact: true }),
  });

/** Seção (subgrupo) onde a linha está: o `<tbody data-mover-secao>` em volta. */
async function secaoDa(linha: Locator): Promise<string | null> {
  return linha.evaluate(
    (tr) => tr.closest('tbody[data-mover-secao]')?.getAttribute('data-mover-secao') ?? null,
  );
}

/** Arrasta pela alça até o ponto (mouse real: 4px ativam o arrasto). */
async function arrastarAte(page: Page, alca: Locator, destino: { x: number; y: number }) {
  await alca.scrollIntoViewIfNeeded();
  const box = await alca.boundingBox();
  if (!box) throw new Error('alça sem caixa');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 20, box.y + 20, { steps: 4 });
  await page.mouse.move(destino.x, destino.y, { steps: 12 });
  await page.waitForTimeout(400);
}

const isMoverPost = (r: Response) =>
  r.url().endsWith('/api/carteira/mover') && r.request().method() === 'POST';

test.describe('mover grava e desfaz', () => {
  test.skip(!writesAllowed(), 'só com E2E_ALLOW_WRITES=1');

  test(`${TICKER}: seção por arrasto, aba pela bandeja, aba recusada e Desfazer`, async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const historico: string[] = [];
    page.on('response', async (r) => {
      if (!isMoverPost(r) || !r.ok()) return;
      const body = (await r.json().catch(() => null)) as { historicoId?: string | null } | null;
      if (body?.historicoId) historico.push(body.historicoId);
    });

    await gotoAba(page, "FII's");
    const linha = linhaDo(page, TICKER);
    test.skip((await linha.count()) === 0, `${TICKER} não está em FII's no demo`);
    const origem = await secaoDa(linha);
    expect(origem).not.toBeNull();
    const destinoSecao = origem === 'tvm' ? 'tijolo' : 'tvm';

    try {
      // 1) Seção: arrasta até a faixa da seção de destino.
      await page
        .locator('[data-carteira-dnd] table')
        .first()
        .evaluate((el) => {
          el.scrollIntoView({ block: 'start' });
          window.scrollBy(0, -20);
        });
      const faixa = page.locator(`tbody[data-mover-secao="${destinoSecao}"] tr`).first();
      const fb = await faixa.boundingBox();
      if (!fb) throw new Error('faixa da seção sem caixa');
      const post1 = page.waitForResponse(isMoverPost);
      await arrastarAte(page, linha.getByRole('button', { name: `Arrastar ${TICKER}` }), {
        x: fb.x + 300,
        y: fb.y + fb.height / 2,
      });
      await expect(page.locator(`tbody[data-mover-secao="${destinoSecao}"]`)).toHaveAttribute(
        'data-drop-on',
        'true',
      );
      await page.mouse.up();
      expect((await post1).status()).toBe(200);

      await gotoAba(page, "FII's");
      expect(await secaoDa(linhaDo(page, TICKER)), 'persistiu na seção nova').toBe(destinoSecao);

      // 2) Aba recusada (Stocks: em reais × dólar) — não grava, avisa.
      const posts: Response[] = [];
      const conta = (r: Response) => {
        if (isMoverPost(r)) posts.push(r);
      };
      page.on('response', conta);
      await page.locator('[data-carteira-dnd] table').first().scrollIntoViewIfNeeded();
      const alca = linhaDo(page, TICKER).getByRole('button', { name: `Arrastar ${TICKER}` });
      await arrastarAte(page, alca, { x: 640, y: 700 });
      const stocks = page.locator('[data-aba-drop="stocks"]');
      await expect(stocks).toBeVisible();
      await expect(stocks).toHaveAttribute('data-recusado', 'true');
      const sb = (await stocks.boundingBox())!;
      await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2, { steps: 6 });
      await page.waitForTimeout(300);
      await page.mouse.up();
      await expect(
        page.getByRole('status').filter({ hasText: `Stocks não aceita ${TICKER}` }),
      ).toBeVisible();
      await page.waitForTimeout(500);
      page.off('response', conta);
      expect(posts, 'aba recusada não grava').toHaveLength(0);

      // 3) Outra aba: bandeja → Fundos → popover → Fiagro.
      await arrastarAte(page, alca, { x: 640, y: 700 });
      const fundos = page.locator('[data-aba-drop="fimFia"]');
      await expect(fundos).toBeVisible();
      const ub = (await fundos.boundingBox())!;
      await page.mouse.move(ub.x + ub.width / 2, ub.y + ub.height / 2, { steps: 6 });
      await page.waitForTimeout(300);
      await page.mouse.up();
      const pop = page.getByRole('dialog').filter({ hasText: 'Fundos' }).last();
      await expect(pop).toBeVisible();
      await pop.getByRole('radio', { name: /Fiagro/ }).check();
      const post2 = page.waitForResponse(isMoverPost);
      await pop.getByRole('button', { name: /^Mover/ }).click();
      expect((await post2).status()).toBe(200);

      await gotoAba(page, 'Fundos');
      const naAbaNova = linhaDo(page, TICKER);
      await expect(naAbaNova).toHaveCount(1);
      expect(await secaoDa(naAbaNova)).toBe('fiagro');
      await gotoAba(page, "FII's");
      await expect(linhaDo(page, TICKER)).toHaveCount(0);
    } finally {
      // Desfaz do mais novo para o mais antigo: o ativo volta à seção/aba de origem.
      for (const id of [...historico].reverse()) {
        await apiPost(page, `/api/historico-alteracoes/${id}/undo`, {}).catch((e: unknown) => {
          test.info().annotations.push({ type: 'undo falhou', description: String(e) });
        });
      }
    }

    await gotoAba(page, "FII's");
    expect(await secaoDa(linhaDo(page, TICKER)), 'voltou à seção de origem').toBe(origem);
  });
});
