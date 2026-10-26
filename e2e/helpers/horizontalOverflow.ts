import { expect, test, type Page } from '@playwright/test';

/**
 * Transbordo horizontal no projeto `mobile` (isMobile + hasTouch), extraído de
 * e2e/mobile-overflow.spec.ts para reúso.
 *
 * ATENÇÃO: com isMobile o Chromium estica a viewport de LAYOUT até caber o conteúdo — um
 * `window.innerWidth` vira 482 numa página de 482px. Por isso a comparação é SEMPRE com a largura
 * FIXA do viewport configurado (`page.viewportSize()`), nunca com innerWidth. E a casca corta o
 * excedente em `[data-mf-content]` (overflow-x: clip) abaixo de lg, então o scrollWidth dele também
 * entra na medida.
 */

export interface Measure {
  sw: number;
  cw: number;
  bw: number;
  /** scrollWidth do contêiner do conteúdo da casca, que corta o transbordo abaixo de lg. */
  ct: number;
}

export const measure = (page: Page): Promise<Measure> =>
  page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
    bw: document.body.scrollWidth,
    ct: document.querySelector('[data-mf-content]')?.scrollWidth ?? 0,
  }));

/**
 * Até 10 culpados: elementos com right > W+1 que não têm filho também passando (o mais fundo),
 * ignorando o que está dentro de um contêiner com rolagem/corte horizontal próprio.
 */
const findOffenders = (page: Page, W: number) =>
  page.evaluate((limit) => {
    const overflows = (el: Element) => el.getBoundingClientRect().right > limit + 1;
    const clippedByAncestor = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        // o corte de segurança da casca não conta: o que ele esconde ainda é transbordo
        if (p.hasAttribute('data-mf-content')) continue;
        const ox = getComputedStyle(p).overflowX;
        if (ox !== 'visible') return true;
      }
      return false;
    };
    // `fixed`: elemento fixo (ex.: banner de cookies) — costuma ser CONSEQUÊNCIA (a viewport de
    // layout esticou), não a causa.
    const out: { tag: string; className: string; width: number; right: number; fixed: boolean }[] =
      [];
    const inFixed = (el: Element) => {
      for (let p: Element | null = el; p && p !== document.body; p = p.parentElement) {
        if (getComputedStyle(p).position === 'fixed') return true;
      }
      return false;
    };
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      if (out.length >= 10) break;
      if (!overflows(el)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (Array.from(el.children).some(overflows)) continue;
      if (clippedByAncestor(el)) continue;
      out.push({
        tag: el.tagName.toLowerCase(),
        className: String((el as HTMLElement).className ?? '').slice(0, 200),
        width: Math.round(rect.width),
        right: Math.round(rect.right),
        fixed: inFixed(el),
      });
    }
    return out;
  }, W);

export const overflowsViewport = (m: Measure, page: Page) =>
  Math.max(m.sw, m.bw, m.ct) > page.viewportSize()!.width;

export async function expectNoHorizontalOverflow(page: Page, route: string) {
  const W = page.viewportSize()!.width; // 390 — largura FIXA, nunca innerWidth
  const m = await measure(page);
  const widest = Math.max(m.sw, m.bw, m.ct);

  if (widest > W || m.cw > W) {
    const offenders = await findOffenders(page, W);
    await test.info().attach(`transbordo ${route}`, {
      body: JSON.stringify({ viewport: W, ...m, offenders }, null, 2),
      contentType: 'application/json',
    });
  }

  expect(widest, `${route}: conteúdo com ${widest}px numa tela de ${W}px`).toBeLessThanOrEqual(W);
  expect(m.cw, `${route}: clientWidth ${m.cw}px > ${W}px`).toBeLessThanOrEqual(W);
}
