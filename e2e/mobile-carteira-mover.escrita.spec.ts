import { test, expect, type Locator, type Page, type Response } from '@playwright/test';
import { apiPost, writesAllowed } from './helpers/api';
import { moverCaixaRfLigado } from './helpers/moverRf';
import {
  expectFitsWithoutClip,
  expectMinTarget,
  openCarteiraTab,
  prepareMobilePage,
  waitCarteiraReady,
} from './helpers/mobileFit';

/**
 * Mover investimentos no CELULAR (out/2026, Fatia E) — projeto `escrita`, 390×844 isMobile.
 *
 * Sem arrastar: o cartão aberto ganha "Mover" (44px), que abre o sheet "Mover para" da Fatia D.
 * Leitura (sempre): Renda Fixa sem "Mover"; o botão tem 44px e a aba cabe a 390px.
 * Escrita (só com E2E_ALLOW_WRITES=1): move o FII do demo (MXRF11 no seed) para outra seção pelo
 * sheet, confere e DESFAZ pelo Histórico de alterações.
 */

const TICKER = process.env.E2E_MOVER_TICKER ?? 'MXRF11';

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
});

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await prepareMobilePage(page);
});

async function gotoAba(page: Page, aba: string) {
  await page.goto('/carteira', { waitUntil: 'domcontentloaded' });
  await waitCarteiraReady(page);
  await openCarteiraTab(page, aba);
  await page
    .waitForFunction(() => !document.body.innerText.includes('Carregando dados'), null, {
      timeout: 60_000,
    })
    .catch(() => {});
}

const cartaoDo = (page: Page, ticker: string): Locator =>
  page.locator('li[data-mf-card]').filter({ hasText: ticker }).first();

async function abrirCartao(card: Locator) {
  const toggle = card.locator('[data-mf-card-toggle]');
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}

/** Rótulo da seção (faixa) do cartão: o bloco de seção imediatamente acima. */
async function secaoDoCartao(card: Locator): Promise<string> {
  // A faixa ([data-mf-section]) é irmã do bloco que contém a lista de cartões da seção.
  return card.evaluate((li) => {
    let el: Element | null = li;
    while (el && !el.previousElementSibling?.matches('[data-mf-section]')) el = el.parentElement;
    const faixa = el?.previousElementSibling;
    return faixa?.querySelector('span.truncate')?.textContent?.trim() ?? '';
  });
}

const isMoverPost = (r: Response) =>
  r.url().endsWith('/api/carteira/mover') && r.request().method() === 'POST';

test('leitura: "Mover" de 44px no cartão aberto; Renda Fixa sem "Mover"', async ({ page }) => {
  test.setTimeout(180_000);
  await gotoAba(page, "FII's");
  const card = cartaoDo(page, TICKER);
  test.skip((await card.count()) === 0, `${TICKER} não está em FII's no demo`);
  await abrirCartao(card);
  const mover = card.getByRole('button', { name: `Mover ${TICKER}` });
  await expect(mover).toBeVisible();
  await expectMinTarget(mover, 44);
  await expectFitsWithoutClip(page, "FII's com o cartão aberto");

  // Fase 2: com MOVER_CAIXA_RF_HABILITADO ligada a Renda Fixa também tem "Mover"
  // (e2e/mobile-carteira-mover-rf.escrita.spec.ts).
  if (moverCaixaRfLigado()) return;
  await openCarteiraTab(page, 'Renda Fixa');
  await expect(page.locator('[data-mover-card]')).toHaveCount(0);
  const rf = page.locator('li[data-mf-card]').first();
  if ((await rf.count()) > 0) {
    await abrirCartao(rf);
    await expect(page.locator('[data-mover-card]')).toHaveCount(0);
  }
});

test.describe('grava e desfaz', () => {
  test.skip(!writesAllowed(), 'só com E2E_ALLOW_WRITES=1');

  test(`${TICKER}: Mover pelo sheet para outra seção e Desfazer`, async ({ page }) => {
    test.setTimeout(240_000);
    const historico: string[] = [];
    page.on('response', async (r) => {
      if (!isMoverPost(r) || !r.ok()) return;
      const body = (await r.json().catch(() => null)) as { historicoId?: string | null } | null;
      if (body?.historicoId) historico.push(body.historicoId);
    });

    await gotoAba(page, "FII's");
    const card = cartaoDo(page, TICKER);
    test.skip((await card.count()) === 0, `${TICKER} não está em FII's no demo`);
    const origem = await secaoDoCartao(card);
    const destino = /^TVM/.test(origem) ? 'Tijolo' : 'TVM';

    try {
      await abrirCartao(card);
      await card.getByRole('button', { name: `Mover ${TICKER}` }).click();
      const sheet = page.getByRole('dialog').last();
      await expect(sheet).toBeVisible();
      await expectFitsWithoutClip(page, 'sheet Mover para');
      await sheet
        .getByRole('radio', { name: new RegExp(`^${destino}`) })
        .first()
        .click();
      const confirmar = sheet.getByRole('button', { name: /^Mover para/ });
      await expectMinTarget(confirmar, 44);
      const post = page.waitForResponse(isMoverPost);
      await confirmar.click();
      expect((await post).status()).toBe(200);
      await expect(sheet).toBeHidden();

      await gotoAba(page, "FII's");
      expect(await secaoDoCartao(cartaoDo(page, TICKER)), 'persistiu').toMatch(
        new RegExp(`^${destino}`),
      );
    } finally {
      for (const id of [...historico].reverse()) {
        await apiPost(page, `/api/historico-alteracoes/${id}/undo`, {}).catch((e: unknown) => {
          test.info().annotations.push({ type: 'undo falhou', description: String(e) });
        });
      }
    }

    await gotoAba(page, "FII's");
    expect(await secaoDoCartao(cartaoDo(page, TICKER)), 'voltou').toBe(origem);
  });
});
