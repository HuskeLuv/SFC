import { test, expect, type Page } from '@playwright/test';
import { openCarteiraTab, waitCarteiraReady } from './helpers/mobileFit';

/**
 * Mover investimentos (out/2026, Fatia E) — só LEITURA (projeto `chromium`, 1280px).
 *
 * Nas abas movíveis, as linhas têm a alça ⠿ e o menu ⋯; nas abas fora da fase (Renda Fixa,
 * Reservas, Moedas/Cripto, Previdência, Opções, Imóveis) não há alça nem menu. A bandeja "Outra
 * aba" só existe durante o arrasto. No CI (banco do seed) o demo tem ITSA4 (Ações) e MXRF11
 * (FII's); aba sem ativo anota e segue.
 */

const MOVIVEIS = ['Ações', "FII's", "ETF's", 'Stocks', "REIT's", 'Fundos'] as const;
const FIXAS = [
  'Renda Fixa',
  'Reserva Emergência',
  'Reserva Oportunidade',
  'Moedas, Criptomoedas & outros',
  'Previdência e Seguros',
  'Opções',
] as const;

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

test('abas movíveis: cada linha com alça e menu; a bandeja só aparece no arrasto', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await gotoCarteira(page);
  let linhasVistas = 0;
  for (const aba of MOVIVEIS) {
    await openCarteiraTab(page, aba);
    await waitTabLoaded(page);
    const linhas = page.locator('tr[data-mover-linha]');
    const n = await linhas.count();
    if (n === 0) {
      test.info().annotations.push({ type: 'aba sem ativo', description: aba });
      continue;
    }
    linhasVistas += n;
    await expect(page.locator('[data-mover-alca]'), `${aba}: uma alça por linha`).toHaveCount(n);
    await expect(page.locator('[data-mover-menu]'), `${aba}: um menu por linha`).toHaveCount(n);
    const alca = page.locator('[data-mover-alca]').first();
    await expect(alca).toHaveAttribute('aria-label', /^Arrastar /);
    await expect(page.locator('[data-mover-bandeja]')).toHaveCount(0);
  }
  expect(linhasVistas, 'o demo tem ao menos ITSA4 e MXRF11').toBeGreaterThan(0);
});

test('menu ⋯ da linha: Abrir ativo e Mover para…', async ({ page }) => {
  test.setTimeout(120_000);
  await gotoCarteira(page);
  await openCarteiraTab(page, 'Ações');
  await waitTabLoaded(page);
  const menu = page.locator('[data-mover-menu]').first();
  test.skip((await menu.count()) === 0, 'Ações sem ativo no demo');
  await menu.click();
  const lista = page.getByRole('menu');
  await expect(lista.getByRole('menuitem', { name: 'Abrir ativo' })).toHaveAttribute(
    'href',
    /^\/ativos\//,
  );
  await expect(lista.getByRole('menuitem', { name: /Mover para/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(menu).toBeFocused();
});

test('abas fora da fase: sem alça, sem menu e sem coluna extra', async ({ page }) => {
  test.setTimeout(240_000);
  await gotoCarteira(page);
  for (const aba of FIXAS) {
    await openCarteiraTab(page, aba);
    await waitTabLoaded(page);
    await expect(page.locator('[data-mover-alca]'), `${aba}: sem alça`).toHaveCount(0);
    await expect(page.locator('[data-mover-menu]'), `${aba}: sem menu`).toHaveCount(0);
    await expect(page.locator('[data-mover-secao]'), `${aba}: sem alvo de seção`).toHaveCount(0);
  }
});
