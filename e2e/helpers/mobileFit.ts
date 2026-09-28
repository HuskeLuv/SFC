import { expect, test, type Locator, type Page } from '@playwright/test';
import { readySelectorFor } from './routes';

/**
 * Helpers de layout mobile da PWA fase 1 (Carteira).
 *
 * `expectFitsWithoutClip` complementa o mobile-overflow: lá o transbordo é medido no documento, mas
 * a casca corta o excedente em `[data-mf-content]` (overflow-x: clip) — um conteúdo largo demais
 * some sem aparecer na medida. Aqui o corte é desligado durante a medição, e contêineres com
 * rolagem horizontal própria só valem quando declarados (`data-mf-scroll-x`, ex.: trilho de chips).
 */

const LOADING_SELECTOR = '.animate-pulse, .animate-spin, [aria-busy="true"]';

interface ClipCulprit {
  tag: string;
  className: string;
  scrollWidth: number;
  clientWidth: number;
}

export async function expectFitsWithoutClip(
  page: Page,
  label: string,
  { width = 390 }: { width?: number } = {},
) {
  const style = await page.addStyleTag({
    content: '[data-mf-content]{overflow-x:visible!important}',
  });
  try {
    const result = await page.evaluate(() => {
      const isVisible = (el: Element) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        return getComputedStyle(el).visibility !== 'hidden';
      };
      const culprits: ClipCulprit[] = [];
      const root = document.querySelector('[data-mf-content]');
      if (root) {
        for (const el of Array.from(root.querySelectorAll('*'))) {
          if (culprits.length >= 10) break;
          if (el.closest('[data-mf-scroll-x]')) continue;
          const ox = getComputedStyle(el).overflowX;
          if (ox !== 'auto' && ox !== 'scroll') continue;
          if (el.scrollWidth <= el.clientWidth + 1) continue;
          if (!isVisible(el)) continue;
          culprits.push({
            tag: el.tagName.toLowerCase(),
            className: String((el as HTMLElement).className ?? '').slice(0, 200),
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
          });
        }
      }
      return { sw: document.documentElement.scrollWidth, culprits };
    });

    if (result.culprits.length > 0 || result.sw > width) {
      await test.info().attach(`culpados-${label}`, {
        body: JSON.stringify(result, null, 2),
        contentType: 'application/json',
      });
    }
    expect(result.sw, `${label}: documento com ${result.sw}px (> ${width})`).toBeLessThanOrEqual(
      width,
    );
    expect(result.culprits, `${label}: rolagem horizontal fora de [data-mf-scroll-x]`).toEqual([]);
  } finally {
    await style.evaluate((el) => (el as Element).remove());
  }
}

/** Espera spinners/skeletons sumirem (sem falhar: anota e segue) e dá uma folga para assentar. */
export async function waitForIdle(page: Page, { timeout = 30_000, settleMs = 800 } = {}) {
  try {
    await page.waitForFunction(
      (sel) => {
        const root = document.querySelector('main') ?? document.body;
        return root.querySelectorAll(sel).length === 0;
      },
      LOADING_SELECTOR,
      { timeout },
    );
  } catch {
    test.info().annotations.push({
      type: 'carregamento persistente',
      description: `ainda havia ${LOADING_SELECTOR} após ${timeout}ms`,
    });
  }
  await page.waitForTimeout(settleMs);
}

/** A /carteira montada (título ou `[data-mf-carteira-ready]`) e sem spinner. */
export async function waitCarteiraReady(page: Page, { timeout = 60_000 } = {}) {
  await page
    .locator(readySelectorFor('/carteira'))
    .filter({ visible: true, hasText: /\S/ })
    .first()
    .waitFor({ state: 'visible', timeout });
  await waitForIdle(page);
}

/**
 * Abre uma aba da carteira pelo nome ATUAL (o mesmo no desktop e no celular). Abaixo de lg a aba é
 * um chip num trilho com rolagem própria: rola até ele antes de tocar.
 */
export async function openCarteiraTab(page: Page, label: string) {
  const tab = page.getByRole('button', { name: label, exact: true }).first();
  const vw = page.viewportSize()?.width ?? 1280;
  if (vw < 1024) await tab.scrollIntoViewIfNeeded();
  await tab.click();
  await waitForIdle(page);
}

// ── PWA fase 3 ─────────────────────────────────────────────────────────────────────────────────

/**
 * Esconde o React Query Devtools (só dev; cobre a aba Mais) e aceita o aviso de cookies antes de
 * qualquer navegação — o mesmo addInitScript do mobile-carteira-cards.
 */
export async function prepareMobilePage(page: Page) {
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
      // sem storage: o aviso de cookies aparece, mas não atrapalha a medida
    }
  });
}

export interface GotoMobileOptions {
  width?: number;
  height?: number;
  /** Sobrescreve o READY_SELECTOR da rota. */
  readySelector?: string;
  timeout?: number;
}

/** Viewport de celular + navegação + espera do conteúdo real (sem skeleton/spinner). */
export async function gotoMobile(
  page: Page,
  route: string,
  { width = 390, height = 844, readySelector, timeout = 60_000 }: GotoMobileOptions = {},
) {
  await page.setViewportSize({ width, height });
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await page
    .locator(readySelector ?? readySelectorFor(route))
    .filter({ visible: true, hasText: /\S/ })
    .first()
    .waitFor({ state: 'visible', timeout });
  await waitForIdle(page);
}

/**
 * Alvo de toque ≥ `min` px (padrão 44) nas duas dimensões. Se a caixa for menor, aceita um
 * `::before` que estenda a área (regra dos chips da fase 1: 36px visíveis + ::before de 44px).
 */
export async function expectMinTarget(locator: Locator, min = 44) {
  const box = await locator.boundingBox();
  expect(box, 'alvo sem caixa (invisível?)').not.toBeNull();
  const before = await locator.evaluate((el) => {
    const cs = getComputedStyle(el, '::before');
    const content = cs.content;
    if (!content || content === 'none' || content === 'normal') return null;
    return { height: parseFloat(cs.height) || 0, width: parseFloat(cs.width) || 0 };
  });
  const height = Math.max(box!.height, before?.height ?? 0);
  const width = Math.max(box!.width, before?.width ?? 0);
  expect(
    height,
    `alvo com ${box!.height}px de altura (::before ${before?.height ?? '-'})`,
  ).toBeGreaterThanOrEqual(min - 0.5);
  expect(
    width,
    `alvo com ${box!.width}px de largura (::before ${before?.width ?? '-'})`,
  ).toBeGreaterThanOrEqual(min - 0.5);
}

/** Todo gráfico Apex visível cabe na largura da tela. */
export async function expectChartsFit(page: Page) {
  const vw = page.viewportSize()!.width;
  const widths = await page.evaluate(() =>
    Array.from(document.querySelectorAll('svg.apexcharts-svg'))
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) => Math.round(r.right)),
  );
  for (const right of widths) {
    expect(right, `gráfico termina em ${right}px numa tela de ${vw}px`).toBeLessThanOrEqual(vw);
  }
}

/** A caixa inteira dentro da janela visível (rodapés fixos, botões de sheet). */
export async function expectInViewport(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box, 'elemento sem caixa (invisível?)').not.toBeNull();
  const { innerHeight, innerWidth } = await locator.page().evaluate(() => ({
    innerHeight: window.innerHeight,
    innerWidth: window.innerWidth,
  }));
  expect(box!.y, 'começa acima da janela').toBeGreaterThanOrEqual(-0.5);
  expect(box!.x, 'começa à esquerda da janela').toBeGreaterThanOrEqual(-0.5);
  expect(box!.y + box!.height, `termina abaixo da janela (${innerHeight}px)`).toBeLessThanOrEqual(
    innerHeight + 0.5,
  );
  expect(box!.x + box!.width, `termina à direita da janela (${innerWidth}px)`).toBeLessThanOrEqual(
    innerWidth + 0.5,
  );
}
