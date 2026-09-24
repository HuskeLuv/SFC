import { test, expect, type Page } from '@playwright/test';
import { waitForContent } from './helpers/waitForContent';

/**
 * Guarda de desktop da PWA fase 0 (projeto `chromium`, sem isMobile): a casca mobile e os
 * primitivos novos não podem mudar NADA a partir de lg (1024px).
 *
 * Passa antes e depois da fatia B: `[data-mf-tabbar]`/`[data-mf-mobile-header]` podem não existir
 * (count 0) ou existir ocultos.
 *
 * Screenshots: baselines em e2e/desktop-layout.spec.ts-snapshots/. Geradas a partir de main
 * ANTES do merge das fatias (`--update-snapshots`) e commitadas; só dados de mercado podem diferir,
 * e por isso ficam mascarados.
 */

const ROUTES = ['/carteira', '/fluxodecaixa', '/dividas'] as const;
const VIEWPORTS = [
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
] as const;

/**
 * Transbordo horizontal que JÁ existe no desktop antes da PWA (medido em set/2026, igual nas 3
 * larguras). O guarda só impede piorar; consertar é fora do escopo da fase 0.
 */
const KNOWN_DESKTOP_OVERFLOW_PX: Record<string, number> = {
  '/fluxodecaixa': 6,
};

/** Valores que mudam com mercado/tempo — mascarados no screenshot. */
const MARKET_MASK = [
  'table',
  'canvas',
  'svg.apexcharts-svg',
  '.apexcharts-canvas',
  '.tabular-nums',
  '[class*="font-mono"]',
  // Indicador do Next em dev ("N · 2 Issues") — varia entre execuções e não existe em produção.
  'nextjs-portal',
];

/**
 * x da coluna de conteúdo: o irmão (flex-1) do bloco que contém a sidebar no AdminLayoutClient.
 */
const contentColumnX = (page: Page) =>
  page.evaluate(() => {
    let node: Element | null = document.querySelector('aside');
    while (node && !node.nextElementSibling?.classList.contains('flex-1'))
      node = node.parentElement;
    const column = node?.nextElementSibling;
    return column ? column.getBoundingClientRect().x : null;
  });

async function gotoDesktop(page: Page, route: string, readySelector?: string) {
  // Mouse fora da sidebar: o hover expande a sidebar recolhida e muda a margem.
  await page.mouse.move(900, 500);
  await waitForContent(page, route, { readySelector });
}

test.describe('Desktop inalterado (≥ lg)', () => {
  test.describe.configure({ timeout: 120_000 });

  for (const vp of VIEWPORTS) {
    for (const route of ROUTES) {
      test(`${route} @ ${vp.width}x${vp.height}`, async ({ page }) => {
        await page.setViewportSize(vp);
        await gotoDesktop(page, route);

        const aside = page.locator('aside').first();
        await expect(aside).toBeVisible();

        // Casca mobile ausente ou oculta.
        for (const sel of ['[data-mf-tabbar]', '[data-mf-mobile-header]', '[data-mf-fab]']) {
          const loc = page.locator(sel);
          const count = await loc.count();
          for (let i = 0; i < count; i++) await expect(loc.nth(i)).toBeHidden();
        }
        // getByRole ignora elementos ocultos: 0 = inexistente ou invisível.
        await expect(page.getByRole('button', { name: 'Abrir menu' })).toHaveCount(0);

        // Coluna de conteúdo começa onde a sidebar termina (200px expandida).
        const asideBox = (await aside.boundingBox())!;
        expect(asideBox.x).toBe(0);
        expect(asideBox.width).toBe(200);
        const contentX = await contentColumnX(page);
        expect(contentX, 'coluna de conteúdo não encontrada').not.toBeNull();
        expect(Math.abs(contentX! - asideBox.width)).toBeLessThanOrEqual(1);

        // Sem transbordo horizontal do documento (além do que já existia antes da PWA).
        const m = await page.evaluate(() => ({
          sw: document.documentElement.scrollWidth,
          cw: document.documentElement.clientWidth,
        }));
        const slack = KNOWN_DESKTOP_OVERFLOW_PX[route] ?? 0;
        expect(
          m.sw - m.cw,
          `${route}: scrollWidth ${m.sw} × clientWidth ${m.cw}`,
        ).toBeLessThanOrEqual(slack);
      });
    }
  }

  test('Modal (Agenda) continua centralizado no desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    // No desktop a visão inicial é o mês (a lista é só abaixo de 768px).
    await gotoDesktop(page, '/calendario', '.fc-view-harness');
    await page.getByRole('button', { name: /Novo evento/ }).click();

    // aria-modal: o banner de cookies também é role=dialog (sem aria-modal).
    const dialog = page.locator('[role="dialog"][aria-modal="true"]');
    await expect(dialog).toBeVisible();
    // Deixa a animação (se houver) assentar.
    await page.waitForTimeout(400);
    const box = (await dialog.boundingBox())!;
    const vh = page.viewportSize()!.height;
    const top = box.y;
    const bottomGap = vh - (box.y + box.height);
    // Centralizado: folga de cima ≈ folga de baixo (se couber). Sheet colado embaixo daria ~0.
    if (box.height < vh) {
      expect(Math.abs(top - bottomGap)).toBeLessThan(40);
    }
    // Continua com os cantos arredondados de baixo (rounded-3xl), não o sheet.
    const radius = await dialog.evaluate((el) => getComputedStyle(el).borderBottomLeftRadius);
    expect(parseFloat(radius)).toBeGreaterThan(0);
  });

  for (const route of ROUTES) {
    test(`screenshot ${route} @ 1280x800`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await gotoDesktop(page, route);
      await expect(page).toHaveScreenshot(`${route.slice(1)}-1280.png`, {
        mask: MARKET_MASK.map((sel) => page.locator(sel)),
        animations: 'disabled',
        caret: 'hide',
        maxDiffPixelRatio: 0.01,
      });
    });
  }
});
