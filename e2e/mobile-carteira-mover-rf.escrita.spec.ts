import { test, expect, type Locator, type Page } from '@playwright/test';
import { apiPost, writesAllowed } from './helpers/api';
import {
  expectFitsWithoutClip,
  expectMinTarget,
  openCarteiraTab,
  prepareMobilePage,
  waitCarteiraReady,
} from './helpers/mobileFit';
import {
  apagarPosicao,
  criarCdbPos,
  isMoverPost,
  moverCaixaRfLigado,
  portfolioIdNaAba,
} from './helpers/moverRf';

/**
 * Mover — FASE 2 (Reservas + Renda Fixa) no CELULAR — projeto `escrita`, 390×844 isMobile.
 *
 * Só com E2E_ALLOW_WRITES=1 E MOVER_CAIXA_RF_HABILITADO=true no servidor e no teste (ver
 * e2e/helpers/moverRf.ts). Cria um CDB pós pela API e já o leva para a Reserva de Oportunidade
 * (POST /api/carteira/mover). No cartão da Oportunidade: selo "movido", "Mover" de 44px, sheet
 * com a Renda Fixa e a seção automática (Pós-fixada), botões ≥ 44px, sem estouro a 390px, toast
 * com Desfazer. No fim APAGA o CDB (a posição inteira, com o override).
 */

const CDB = `CDB E2E mover RF cel ${Date.now()}`;

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

const cartaoDe = (page: Page, nome: string): Locator =>
  page.locator('li[data-mf-card]').filter({ hasText: nome }).first();

async function abrirCartao(card: Locator) {
  const toggle = card.locator('[data-mf-card-toggle]');
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}

test.describe('cartão da Oportunidade → Renda Fixa', () => {
  test.skip(!writesAllowed(), 'só com E2E_ALLOW_WRITES=1');
  test.skip(!moverCaixaRfLigado(), 'só com MOVER_CAIXA_RF_HABILITADO=true (servidor e teste)');

  test('sheet ≥ 44px, seção automática, sem estouro e Desfazer', async ({ page }) => {
    test.setTimeout(300_000);
    await criarCdbPos(page, CDB);
    let portfolioId: string | null = null;
    try {
      await gotoAba(page, 'Renda Fixa');
      await expect(cartaoDe(page, CDB)).toHaveCount(1);
      await abrirCartao(cartaoDe(page, CDB));
      portfolioId = await portfolioIdNaAba(page, CDB, cartaoDe(page, CDB));
      expect(portfolioId).not.toBeNull();
      await apiPost(page, '/api/carteira/mover', {
        acao: 'mover',
        tipo: 'posicao',
        id: portfolioId,
        categoria: 'reservaOportunidade',
      });

      await gotoAba(page, 'Reserva Oportunidade');
      const card = cartaoDe(page, CDB);
      await expect(card).toHaveCount(1);
      await expect(card.locator('[data-mf-movido]')).toHaveCount(1);
      await expect(page.locator('[data-mover-alca]'), 'celular sem alça').toHaveCount(0);
      await abrirCartao(card);
      const mover = card.locator('[data-mover-card]');
      await expect(mover).toBeVisible();
      await expectMinTarget(mover, 44);
      await expectFitsWithoutClip(page, 'Reserva Oportunidade com o cartão aberto');

      await mover.click();
      const sheet = page.getByRole('dialog').last();
      await expect(sheet).toBeVisible();
      await expectFitsWithoutClip(page, 'sheet Mover para (Oportunidade)');
      const rf = sheet.getByRole('radio', { name: /^Renda Fixa/ }).first();
      await expectMinTarget(rf, 44);
      await rf.click();
      // Seção automática: a RF separa pelo indexador (CDI → Pós-fixada), sem escolha.
      await expect(sheet).toContainText(/P[óo]s-fixada/);
      await expect(sheet.getByRole('radio', { name: /Pr[ée]-fixada|H[íi]brida/ })).toHaveCount(0);
      const confirmar = sheet.getByRole('button', { name: /^Mover para/ });
      await expectMinTarget(confirmar, 44);
      const post = page.waitForResponse(isMoverPost);
      await confirmar.click();
      expect((await post).status()).toBe(200);
      await expect(sheet).toBeHidden();

      // No celular o aviso de sucesso é o MobileSaveToast (data-mf-save-toast), não o do desktop.
      const desfazer = page.locator('[data-mf-save-toast]').getByRole('button', {
        name: 'Desfazer',
      });
      await expect(desfazer).toBeVisible();
      await expectMinTarget(desfazer, 44);
      const undo = page.waitForResponse(
        (r) => r.url().includes('/undo') && r.request().method() === 'POST',
      );
      await desfazer.click();
      expect((await undo).ok()).toBe(true);

      await gotoAba(page, 'Reserva Oportunidade');
      await expect(cartaoDe(page, CDB), 'Desfazer devolveu à Oportunidade').toHaveCount(1);
    } finally {
      if (portfolioId) {
        await apagarPosicao(page, portfolioId).catch((e: unknown) => {
          test.info().annotations.push({ type: 'limpeza falhou', description: String(e) });
        });
      }
    }
  });
});
