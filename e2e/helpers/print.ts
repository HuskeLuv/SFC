import type { Page } from '@playwright/test';
import { waitForContent } from './waitForContent';

/**
 * Guarda REAL da impressão (PWA fase 3) para /relatorios e /saude-financeira.
 *
 * Ao imprimir no computador, a folha A4 tem ~794px: `max-lg:` (width < 64rem) CASA na impressão e
 * mudaria o PDF do desktop. Por isso essas páginas usam só `mscreen:` (tela e < 64rem).
 *
 * No JS, o Chromium também faz `(max-width: 1023.98px)` casar entre `beforeprint` e `afterprint`
 * (a janela continua com 1280px). O useIsBelowLg congela o valor de tela durante a impressão para
 * a árvore de desktop não trocar; `printTreeSwapsFromWideWindow` guarda isso SEM stub, com o
 * `page.pdf` real. `printDesktopLike` (assinatura do layout) força o matchMedia de "abaixo de lg" a
 * `false` porque redimensiona a viewport para a folha antes de emular a impressão.
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
 * documento, `tag|display|nº de trilhas do grid|position|largura em décimos da folha` (`-` em
 * th/td, cuja largura depende do dado). Os gráficos
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
        const tag = el.tagName.toLowerCase();
        // Célula de tabela se ajusta ao conteúdo (datas, valores do seed mudam com o
        // mês do CI): só a estrutura conta, a largura fica de fora.
        const bucket = tag === 'td' || tag === 'th' ? '-' : Math.round((r.width / width) * 10);
        out.push(`${tag}|${cs.display}|${tracks}|${cs.position}|${bucket}`);
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

export interface PrintTreeSwap {
  /** A query de "abaixo de lg" passou a casar durante o page.pdf (sanidade da sonda). */
  queryMatchedWhilePrinting: boolean;
  /** Nós `[data-mf-mobile]` / `[data-mf-collapsible]` montados durante a impressão. */
  mobileNodesAdded: number;
  /** Gráficos Apex (`.apexcharts-canvas`) desmontados durante a impressão. */
  chartsRemoved: number;
}

/**
 * Imprime (`page.pdf`, A4) a partir da janela atual SEM mexer no matchMedia e conta o que o React
 * trocou no DOM durante a impressão. Numa janela de desktop tem de dar 0 e 0: se a árvore de
 * celular montar no meio da impressão, os gráficos remontam e saem vazios no PDF.
 */
export async function printTreeSwapsFromWideWindow(page: Page): Promise<PrintTreeSwap> {
  await page.evaluate(() => {
    const w = window as unknown as {
      __mfPrintProbe?: { matched: boolean; added: number; removed: number; stop: () => void };
    };
    const probe = { matched: false, added: 0, removed: 0, stop: () => {} };
    const mql = window.matchMedia('(max-width: 1023.98px)');
    const onChange = () => {
      if (mql.matches) probe.matched = true;
    };
    mql.addEventListener('change', onChange);
    const isMobileNode = (n: Node) =>
      n instanceof Element &&
      (n.matches('[data-mf-mobile],[data-mf-collapsible]') ||
        !!n.querySelector('[data-mf-mobile],[data-mf-collapsible]'));
    const isChart = (n: Node) =>
      n instanceof Element &&
      (n.classList.contains('apexcharts-canvas') || !!n.querySelector('.apexcharts-canvas'));
    const observer = new MutationObserver((records) => {
      for (const r of records) {
        r.addedNodes.forEach((n) => {
          if (isMobileNode(n)) probe.added += 1;
        });
        r.removedNodes.forEach((n) => {
          if (isChart(n)) probe.removed += 1;
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    probe.stop = () => {
      observer.disconnect();
      mql.removeEventListener('change', onChange);
    };
    w.__mfPrintProbe = probe;
  });
  await page.pdf({ format: 'A4', printBackground: true });
  // Deixa o React assentar o que a impressão tenha agendado antes de ler a sonda.
  await page.waitForTimeout(300);
  return page.evaluate(() => {
    const w = window as unknown as {
      __mfPrintProbe: { matched: boolean; added: number; removed: number; stop: () => void };
    };
    const p = w.__mfPrintProbe;
    p.stop();
    return {
      queryMatchedWhilePrinting: p.matched,
      mobileNodesAdded: p.added,
      chartsRemoved: p.removed,
    };
  });
}
