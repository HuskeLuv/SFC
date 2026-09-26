import { test, expect, type Page } from '@playwright/test';
import { fluxoMobileReadyOrSkip, gotoFluxo, monthLabel } from './helpers/fluxo';

/**
 * PWA fase 2, fatia D: "Ano inteiro" do Fluxo no celular (projeto `mobile`, SÓ LEITURA).
 *
 * Aberto pela visão do mês (fatia A: "Mais ações" → "Ano inteiro"). Enquanto a visão do mês não
 * existir no branch, `fluxoMobileReadyOrSkip` pula o teste (worktree da fatia D); no integrador e
 * no CI ele roda de verdade.
 *
 * Decisão do Wellington (26/09/2026): coluna de itens fixa de 128px, Total do ano como ÚLTIMA
 * coluna e NÃO fixa, mês atual marcado sem texto sobre #0079F2, tocar no mês volta à visão do mês.
 */

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
});

test.beforeEach(async ({ page }) => {
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
      // sem storage: o aviso de cookies fica embaixo do overlay em tela cheia
    }
  });
});

const DIALOG = 'Fluxo de caixa — ano inteiro';

async function abrirAnoInteiro(page: Page) {
  await page.getByRole('button', { name: 'Mais ações' }).first().click();
  await page
    .getByRole('button', { name: /^Ano inteiro/ })
    .first()
    .click();
  const dialog = page.getByRole('dialog', { name: DIALOG });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('tbody tr').first()).toBeVisible({ timeout: 60_000 });
  return dialog;
}

test('Ano inteiro @ 390: só a coluna de itens fixa, rolagem só na grade', async ({ page }) => {
  test.setTimeout(180_000);
  await gotoFluxo(page, { mes: 7 });
  await fluxoMobileReadyOrSkip(test, page);
  const dialog = await abrirAnoInteiro(page);

  const m = await page.evaluate(() => {
    const root = document.querySelector('[data-mf-year-grid]')!;
    const th0 = root.querySelector("thead th[data-cf-fixed='0']")!;
    const annual = root.querySelector('thead th[data-cf-annual]');
    const scroller = root.querySelector('[data-mf-year-grid-scroll]') as HTMLElement;
    const escondidas = Array.from(
      root.querySelectorAll("[data-cf-fixed='1'], [data-cf-fixed='2'], [data-cf-fixed='3']"),
    ).filter((el) => getComputedStyle(el).display !== 'none').length;
    return {
      fixo: th0.getBoundingClientRect().width,
      annualPosition: annual ? getComputedStyle(annual).position : null,
      scrollW: scroller.scrollWidth,
      clientW: scroller.clientWidth,
      docW: document.documentElement.scrollWidth,
      escondidas,
    };
  });
  expect(m.fixo).toBeLessThanOrEqual(0.35 * 390);
  expect(m.escondidas, 'colunas O seu porquê/Nível/% Receita').toBe(0);
  // Total do ano: presente como última coluna, sem fixar.
  expect(m.annualPosition).toBe('static');
  expect(m.scrollW).toBeGreaterThan(m.clientW);
  expect(m.docW).toBeLessThanOrEqual(390);

  // Só leitura: sem Editar grupo nem alça de arrastar.
  await expect(dialog.getByRole('button', { name: 'Editar grupo' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: /^Arrastar / })).toHaveCount(0);

  // Mês atual (o seed tem o ano corrente): cabeçalho continua #314666, marca não textual.
  const atual = dialog.locator('thead th[data-cf-current]');
  if ((await atual.count()) > 0) {
    await expect(atual).toHaveCSS('background-color', 'rgb(49, 70, 102)');
    await expect(atual.getByRole('button')).toHaveAttribute('aria-current', 'date');
  }

  if (!process.env.CI) {
    await page.screenshot({ path: test.info().outputPath('ano-390.png') });
  }
});

test('Ano inteiro: tocar no mês volta à visão do mês', async ({ page }) => {
  test.setTimeout(180_000);
  await gotoFluxo(page, { mes: 7 });
  await fluxoMobileReadyOrSkip(test, page);
  const dialog = await abrirAnoInteiro(page);
  const marco = dialog.getByRole('button', { name: 'Ver Março no detalhe' });
  await marco.scrollIntoViewIfNeeded();
  await marco.click();
  await expect(dialog).toBeHidden();
  expect(await monthLabel(page)).toContain('Março');
});

test('Ano inteiro: Esc fecha', async ({ page }) => {
  test.setTimeout(180_000);
  await gotoFluxo(page, { mes: 7 });
  await fluxoMobileReadyOrSkip(test, page);
  const dialog = await abrirAnoInteiro(page);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  expect(await monthLabel(page)).toContain('Julho');
});

test('Ano inteiro em paisagem (844×390): pelo menos 6 meses à vista', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 844, height: 390 });
  await gotoFluxo(page, { mes: 7 });
  await fluxoMobileReadyOrSkip(test, page);
  await abrirAnoInteiro(page);
  const visiveis = await page.evaluate(() => {
    const vw = 844;
    return Array.from(
      document.querySelectorAll('[data-mf-year-grid] thead th[data-cf-month]'),
    ).filter((th) => {
      const r = th.getBoundingClientRect();
      return r.left >= 127 && r.right <= vw + 1;
    }).length;
  });
  expect(visiveis).toBeGreaterThanOrEqual(6);
});
