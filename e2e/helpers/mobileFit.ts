import { expect, test, type Page } from '@playwright/test';
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
