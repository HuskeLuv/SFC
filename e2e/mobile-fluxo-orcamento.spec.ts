import { test, expect, type Page } from '@playwright/test';
import { expectFitsWithoutClip, waitForIdle } from './helpers/mobileFit';
import { gotoFluxo, monthLabel } from './helpers/fluxo';

/**
 * PWA fase 2, fatia D: Orçamento vs Real no celular (projeto `mobile`, SÓ LEITURA).
 *
 * Mês fixo pela URL (`?mes=7`, julho — o seed só tem o ano corrente e o anterior) e troca de mês
 * pela seta "Mês anterior" (nunca "Próximo mês", que em dezembro vira para um ano sem seed). Nada
 * aqui grava: o sheet da meta não é aberto. Os cartões dependem só das categorias do template.
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
      // sem storage: o aviso de cookies aparece, mas não muda o que é medido
    }
  });
});

async function gotoOrcamento(page: Page, width: number) {
  await page.setViewportSize({ width, height: width === 320 ? 640 : 844 });
  await gotoFluxo(page, { modo: 'orcamento', mes: 7 });
  await expect(page.locator('[data-mf-orcamento-mobile]')).toBeVisible({ timeout: 60_000 });
  await waitForIdle(page);
}

for (const width of [390, 320]) {
  test(`Orçamento @ ${width}: cabe sem corte, cartões e gráficos na largura`, async ({ page }) => {
    test.setTimeout(180_000);
    await gotoOrcamento(page, width);

    expect(await monthLabel(page)).toContain('Julho');
    // Segmentos do celular (44px) com os nomes do desktop.
    await expect(page.getByRole('radio', { name: 'Mês', exact: true })).toBeChecked();
    await expect(page.getByRole('radio', { name: 'Consolidado' })).toBeVisible();

    const cards = page.locator('[data-mf-orcamento-mobile] [data-mf-card]');
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThan(1);
    // Todo cartão de categoria tem o selo em TEXTO (não só cor).
    const selos = page.locator('[data-mf-orcamento-mobile] [data-mf-orcamento-selo]');
    expect(await selos.count()).toBeGreaterThan(0);
    for (const texto of await selos.allTextContents()) expect(texto.trim()).not.toBe('');

    await expectFitsWithoutClip(page, `orcamento-${width}`, { width });

    // Cada gráfico cabe na tela (Apex desenha tarde: rola até eles antes de medir).
    const graficos = page.locator('[data-mf-orcamento-mobile] svg.apexcharts-svg');
    const total = await graficos.count();
    for (let i = 0; i < total; i++) {
      await graficos.nth(i).scrollIntoViewIfNeeded();
      const box = await graficos.nth(i).boundingBox();
      expect(box, `gráfico ${i}`).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
    }

    if (!process.env.CI) {
      await page.screenshot({ path: test.info().outputPath(`orcamento-${width}.png`) });
    }
  });
}

test('Orçamento: "Mês anterior" troca o mês e grava ?mes=', async ({ page }) => {
  test.setTimeout(180_000);
  await gotoOrcamento(page, 390);
  await page.getByRole('button', { name: 'Mês anterior' }).click();
  await expect(page.locator('[data-mf-month-label]').first()).toContainText('Junho');
  expect(new URL(page.url()).searchParams.get('mes')).toBe('6');
});

test('Orçamento: Acumulado do ano troca a barra do mês pelo período', async ({ page }) => {
  test.setTimeout(180_000);
  await gotoOrcamento(page, 390);
  const acumulado = page.getByRole('radio', { name: 'Acumulado do ano' });
  test.skip(await acumulado.isDisabled(), 'ano sem meses decorridos');
  await acumulado.click();
  await expect(acumulado).toBeChecked();
  await expect(page.getByText('Acumulado do ano', { exact: true }).last()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mês anterior' })).toHaveCount(0);
  await expectFitsWithoutClip(page, 'orcamento-acumulado-390');
});
