import type { Page } from '@playwright/test';
import { waitForContent } from './waitForContent';

/**
 * Guarda REAL da impressão (PWA fase 3) para /relatorios e /saude-financeira.
 *
 * Ao imprimir no computador, a folha A4 tem ~794px: `max-lg:` (width < 64rem) CASA na impressão e
 * mudaria o PDF do desktop. Por isso essas páginas usam só `mscreen:` (tela e < 64rem). A janela
 * do desktop continua larga ao imprimir, então o JS (useIsBelowLg) segue dizendo "desktop": o
 * `printDesktopLike` reproduz isso forçando o matchMedia de "abaixo de lg" a `false` com a viewport
 * na largura da folha.
 */

/** Largura e altura de uma folha A4 em px CSS (96 dpi). */
export const A4 = { width: 794, height: 1123 } as const;

/** matchMedia com o corte de lg ('1023.98px' ou '64rem') sempre `false` (JS de desktop). */
async function forceDesktopMatchMedia(page: Page) {
  await page.addInitScript(() => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = (query: string) => {
      const mql = original(query);
      if (!/1023\.98px|64rem/.test(query)) return mql;
      return new Proxy(mql, {
        get(target, prop) {
          if (prop === 'matches') return false;
          const value = Reflect.get(target, prop, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    };
  });
}

/** Rede parada + folga: seções que carregam sozinhas (sem skeleton) já estão na página. */
async function settleNetwork(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => {});
  await page.waitForTimeout(1_500);
}

/** Página como o computador a imprime: folha A4, media print e JS de desktop. */
export async function printDesktopLike(page: Page, route: string, readySelector?: string) {
  await forceDesktopMatchMedia(page);
  await page.setViewportSize(A4);
  await waitForContent(page, route, { readySelector, settleMs: 500 });
  await settleNetwork(page);
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(500);
}

/** Página como o celular a imprime: 390px com matchMedia real (JS de celular) e media print. */
export async function printPhoneLike(page: Page, route: string, readySelector?: string) {
  await page.setViewportSize({ width: 390, height: 844 });
  await waitForContent(page, route, { readySelector, settleMs: 500 });
  await settleNetwork(page);
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(500);
}

export interface PrintSignatureOptions {
  /** Largura de referência para o balde de largura (padrão: a folha A4). */
  width?: number;
  /** Máximo de elementos (padrão 400). */
  limit?: number;
}

/**
 * Assinatura do layout computado: para cada elemento visível de [data-mf-content], em ordem de
 * documento, `tag|display|nº de trilhas do grid|position|largura em décimos da folha`. Os gráficos
 * entram só pelo contêiner (o miolo do Apex/SVG depende de dado e da altura).
 */
export function printSignature(
  page: Page,
  { width = A4.width, limit = 400 }: PrintSignatureOptions = {},
): Promise<string[]> {
  return page.evaluate(
    ({ width, limit }) => {
      const root = document.querySelector('[data-mf-content]');
      if (!root) return [];
      const out: string[] = [];
      for (const el of Array.from(root.querySelectorAll('*'))) {
        if (out.length >= limit) break;
        if (el.closest('.apexcharts-canvas') && !el.classList.contains('apexcharts-canvas')) {
          continue;
        }
        if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        const tracks =
          cs.display.includes('grid') && cs.gridTemplateColumns !== 'none'
            ? cs.gridTemplateColumns.split(/\s+(?![^(]*\))/).filter(Boolean).length
            : 0;
        out.push(
          `${el.tagName.toLowerCase()}|${cs.display}|${tracks}|${cs.position}|${Math.round(
            (r.width / width) * 10,
          )}`,
        );
      }
      return out;
    },
    { width, limit },
  );
}

/** Nº de páginas do PDF A4 (conta `/Type /Page` no buffer; sem dependência nova). */
export async function pdfPageCount(page: Page): Promise<number> {
  const pdf = await page.pdf({ format: 'A4', printBackground: true });
  return (pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length;
}

/** Quantos `[data-mf-mobile]` estão visíveis (na impressão tem que ser 0). */
export function visibleMobileOnly(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      Array.from(document.querySelectorAll('[data-mf-mobile]')).filter((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden';
      }).length,
  );
}
