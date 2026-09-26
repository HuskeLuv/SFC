import { test, expect, type Page } from '@playwright/test';
import { gotoFluxo, monthLabel, rowByName, waitFluxoMobileReady } from './helpers/fluxo';
import { expectFitsWithoutClip } from './helpers/mobileFit';

/**
 * PWA fase 2 · fatia A — visão do mês do Fluxo de caixa no celular (projeto `mobile`, 390px).
 *
 * SÓ LEITURA: nenhum teste grava valor. Recolher/Expandir tudo mexe só na preferência local de
 * grupos recolhidos (localStorage) e termina em "Expandir tudo" (= estado padrão).
 * Sempre com `?mes=` fixo (julho) e "Mês anterior": o seed só tem o ano corrente e o anterior.
 */
test.describe.configure({ timeout: 180_000 });

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
      // sem storage: o aviso de cookies aparece, mas não cobre o topo
    }
  });
});

async function abrir(page: Page, mes = 7) {
  await gotoFluxo(page, { mes });
  await waitFluxoMobileReady(page, { timeout: 120_000 });
}

const rows = (page: Page) => page.locator('[data-mf-fluxo-row]');

test('abre no mês de ?mes= e "Mês anterior" volta um mês gravando ?mes=', async ({ page }) => {
  await abrir(page);
  expect(await monthLabel(page)).toContain('Julho');
  await page.getByRole('button', { name: 'Mês anterior', exact: true }).click();
  await expect(page.locator('[data-mf-month-label]')).toContainText('Junho');
  await expect(page).toHaveURL(/[?&]mes=6(&|$)/);
});

test('Jan → "Mês anterior" cruza o ano e a URL (?mes=12&ano=) sobrevive ao reload', async ({
  page,
}) => {
  const anoAnterior = new Date().getFullYear() - 1;
  await abrir(page, 1);
  await page.getByRole('button', { name: 'Mês anterior', exact: true }).click();
  const label = page.locator('[data-mf-month-label]');
  await expect(label).toContainText(`Dezembro de ${anoAnterior}`);
  await expect(page).toHaveURL(new RegExp(`[?&]ano=${anoAnterior}(&|$)`));
  await expect(page).toHaveURL(/[?&]mes=12(&|$)/);
  // O reload lê a URL final (antes o router do Next regravava o ?mes= antigo).
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitFluxoMobileReady(page, { timeout: 120_000 });
  await expect(label).toContainText(`Dezembro de ${anoAnterior}`);
});

test('a linha Supermercado aparece (expandindo as linhas sem valor se preciso)', async ({
  page,
}) => {
  await abrir(page);
  const row = await rowByName(page, 'Supermercado');
  await expect(row).toBeVisible();
  // O desktop não monta junto.
  await expect(page.locator('table[aria-label="Planilha de fluxo de caixa"]')).toHaveCount(0);
});

test('a barra do mês gruda embaixo do cabeçalho ao rolar', async ({ page }) => {
  await abrir(page);
  await page.evaluate(() => window.scrollBy(0, 800));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(400);
  const bar = page.locator('[data-mf-month-bar]');
  await expect(bar).toBeInViewport();
  const { top, headerH } = await bar.evaluate((el) => {
    const probe = document.createElement('div');
    probe.style.height = 'var(--mf-header-h, 0px)';
    document.body.appendChild(probe);
    const h = probe.getBoundingClientRect().height;
    probe.remove();
    return { top: el.getBoundingClientRect().top, headerH: h };
  });
  expect(Math.abs(top - headerH)).toBeLessThanOrEqual(2);
  await expect(page.getByRole('button', { name: 'Próximo mês', exact: true })).toBeVisible();
});

test('cabe a 390px sem o corte da casca', async ({ page }) => {
  await abrir(page);
  await expectFitsWithoutClip(page, 'fluxo-390', { width: 390 });
});

test.describe('a 320px', () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test('cabe sem o corte da casca', async ({ page }) => {
    await abrir(page);
    await expectFitsWithoutClip(page, 'fluxo-320', { width: 320 });
  });
});

test('Mais ações: Recolher tudo esconde as linhas e Expandir tudo volta', async ({ page }) => {
  await abrir(page);
  await expect(rows(page).first()).toBeVisible();

  await page.getByRole('button', { name: 'Mais ações', exact: true }).click();
  const menu = page.getByRole('dialog', { name: 'Mais ações' });
  await menu.getByRole('button', { name: 'Recolher tudo' }).click();
  await expect(menu).toBeHidden();
  await expect(rows(page)).toHaveCount(0);

  await page.getByRole('button', { name: 'Mais ações', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Mais ações' })
    .getByRole('button', { name: 'Expandir tudo' })
    .click();
  await expect(rows(page).first()).toBeVisible();
});

test('linha calculada abre a explicação da conta', async ({ page }) => {
  await abrir(page);
  await page.locator('[data-mf-fluxo-derived="fluxoLivre"]').click();
  const sheet = page.getByRole('dialog', { name: 'Fluxo de Caixa livre' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('Como é calculado')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
});

test('screenshot local da visão do mês', async ({ page }) => {
  test.skip(!!process.env.CI, 'screenshots só locais');
  await abrir(page);
  await page.screenshot({ path: test.info().outputPath('fluxo-mes-390.png') });
});
