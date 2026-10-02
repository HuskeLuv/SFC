import { test, expect, type Page } from '@playwright/test';
import { openCarteiraTab, waitCarteiraReady } from './helpers/mobileFit';
import { moverCaixaRfLigado } from './helpers/moverRf';

/**
 * Mover — FASE 2 (Reservas + Renda Fixa), só LEITURA (projeto `chromium`, 1280px).
 *
 * Depende da chave MOVER_CAIXA_RF_HABILITADO do SERVIDOR. O teste lê a mesma variável no seu
 * próprio ambiente (`moverCaixaRfLigado`): rode o dev server e o Playwright com o mesmo valor.
 * - Desligada (padrão, e o CI): Renda Fixa e Reservas sem alça, sem menu, sem selo e sem a coluna
 *   extra — idêntico à main.
 * - Ligada: cada linha das 3 abas tem alça e menu (o demo do seed não tem RF nem reserva: a aba
 *   vazia anota e segue), e a bandeja de um FII continua só com as abas de bolsa e fundos.
 */

const TRIO = ['Renda Fixa', 'Reserva Emergência', 'Reserva Oportunidade'] as const;

async function gotoCarteira(page: Page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.mouse.move(900, 500);
  await page.goto('/carteira', { waitUntil: 'domcontentloaded' });
  await waitCarteiraReady(page);
}

async function waitTabLoaded(page: Page) {
  await page
    .waitForFunction(() => !document.body.innerText.includes('Carregando dados'), null, {
      timeout: 60_000,
    })
    .catch(() => {
      test.info().annotations.push({ type: 'aba', description: 'carregamento persistente' });
    });
}

test.describe('chave DESLIGADA', () => {
  test.skip(moverCaixaRfLigado(), 'chave MOVER_CAIXA_RF_HABILITADO ligada neste ambiente');

  test('Renda Fixa e Reservas sem alça, menu, selo nem coluna extra', async ({ page }) => {
    test.setTimeout(180_000);
    await gotoCarteira(page);
    for (const aba of TRIO) {
      await openCarteiraTab(page, aba);
      await waitTabLoaded(page);
      await expect(page.locator('[data-mover-alca]'), `${aba}: sem alça`).toHaveCount(0);
      await expect(page.locator('[data-mover-menu]'), `${aba}: sem menu`).toHaveCount(0);
      await expect(page.locator('[data-mover-linha]'), `${aba}: sem linha movível`).toHaveCount(0);
      await expect(page.locator('[data-mf-saldo-conta]'), `${aba}: sem selo`).toHaveCount(0);
      await expect(page.locator('[data-carteira-dnd]'), `${aba}: sem provider`).toHaveCount(0);
    }
  });
});

test.describe('chave LIGADA', () => {
  test.skip(!moverCaixaRfLigado(), 'só com MOVER_CAIXA_RF_HABILITADO=true (servidor e teste)');

  test('cada linha das 3 abas com alça e menu ⋯; faixas da RF não são alvo', async ({ page }) => {
    test.setTimeout(180_000);
    await gotoCarteira(page);
    for (const aba of TRIO) {
      await openCarteiraTab(page, aba);
      await waitTabLoaded(page);
      const linhas = page.locator('tr[data-mover-linha]');
      const n = await linhas.count();
      if (n === 0) {
        test.info().annotations.push({ type: 'aba sem ativo', description: aba });
        continue;
      }
      await expect(page.locator('[data-mover-alca]'), `${aba}: uma alça por linha`).toHaveCount(n);
      await expect(page.locator('[data-mover-menu]'), `${aba}: um menu por linha`).toHaveCount(n);
      await expect(page.locator('[data-mover-secao]'), `${aba}: sem alvo de seção`).toHaveCount(0);
      await expect(page.locator('[data-mover-bandeja]')).toHaveCount(0);
    }
  });

  test("FII's: a bandeja não ganha as abas de Reservas e Renda Fixa", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoCarteira(page);
    await openCarteiraTab(page, "FII's");
    await waitTabLoaded(page);
    const alca = page.locator('[data-mover-alca]').first();
    test.skip((await alca.count()) === 0, "FII's sem ativo no demo");
    await alca.scrollIntoViewIfNeeded();
    const box = (await alca.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 20, box.y + 20, { steps: 4 });
    await page.mouse.move(640, 600, { steps: 8 });
    await expect(page.locator('[data-aba-drop]').first()).toBeVisible();
    for (const cat of ['reservaEmergencia', 'reservaOportunidade', 'rendaFixaFundos']) {
      await expect(page.locator(`[data-aba-drop="${cat}"]`), `sem chip ${cat}`).toHaveCount(0);
    }
    await page.keyboard.press('Escape');
    await page.mouse.up();
  });
});
