import type { Page } from '@playwright/test';

/**
 * Retrato ESTRUTURAL da página no desktop (PWA fase 1): abas e tabelas visíveis com as classes,
 * sem números nem contagem de linhas (que dependem de dado). Roda também no CI, onde o screenshot
 * não vale (o banco é outro) — é o que pega um desvio de desktop DENTRO das tabelas.
 *
 * Normalização das classes (cada className vira tokens ordenados e sem repetição):
 * - saem as cores que dependem do dado (positivo/negativo, faixas do Quanto Falta…):
 *   `(dark:)?(text|bg)-(red|green|amber|emerald|[#…])`;
 * - saem as utilitárias que só valem abaixo de lg (`max-lg:`, `max-[…]:`, `max-sm/md:`) — não
 *   mudam nada no desktop e são justamente o que as fatias mobile acrescentam.
 */

export interface TabStructure {
  name: string;
  className: string;
}

export interface TableStructure {
  ths: string[];
  colCount: number;
  theadClass: string;
  thClasses: string[];
  trClasses: string[];
  tdClasses: string[];
}

export interface DesktopStructure {
  tabs: TabStructure[];
  tables: TableStructure[];
  /**
   * Cartões, botões de edição mobile, faixas de seção, rodapé de wizard, visão do mês e grade do
   * ano do Fluxo VISÍVEIS (tem que ser 0).
   */
  mobileArtifactsVisible: number;
}

export const DATA_COLOR_CLASS = /^(dark:)?(text|bg)-(red|green|amber|emerald|\[#)/;
export const MOBILE_ONLY_CLASS = /(^|:)max-(lg|md|sm|xl|\[)/;

export const MOBILE_ARTIFACTS_SELECTOR =
  '[data-mf-card], [data-mf-edit], [data-mf-section], [data-mf-wizard-footer], ' +
  '[data-mf-fluxo-mobile], [data-mf-year-grid]';

/** Mesma normalização do navegador, exportada para teste/depuração em Node. */
export function normalizeClassName(className: string): string {
  const tokens = className
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !DATA_COLOR_CLASS.test(t) && !MOBILE_ONLY_CLASS.test(t));
  return [...new Set(tokens)].sort().join(' ');
}

export function collectStructure(page: Page): Promise<DesktopStructure> {
  return page.evaluate(
    ({ dataColor, mobileOnly, artifacts }) => {
      const dataColorRe = new RegExp(dataColor);
      const mobileOnlyRe = new RegExp(mobileOnly);
      const norm = (className: unknown) => {
        const tokens = String(className ?? '')
          .split(/\s+/)
          .filter(Boolean)
          .filter((t) => !dataColorRe.test(t) && !mobileOnlyRe.test(t));
        return [...new Set(tokens)].sort().join(' ');
      };
      const uniqSorted = (list: string[]) => [...new Set(list)].sort();
      const text = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();
      const isVisible = (el: Element) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        const cs = getComputedStyle(el);
        return cs.visibility !== 'hidden' && cs.display !== 'none';
      };
      // Casca, sidebar do app e ferramentas de dev não entram.
      const OUTSIDE =
        'aside, [data-mf-tabbar], [data-mf-mobile-header], nextjs-portal, .tsqd-parent-container';
      const inScope = (el: Element) => !el.closest(OUTSIDE);

      const tabs = Array.from(document.querySelectorAll('nav button'))
        .filter((el) => inScope(el) && isVisible(el))
        .map((el) => ({ name: text(el), className: norm(el.getAttribute('class')) }));

      const tables = Array.from(document.querySelectorAll('table'))
        .filter((el) => inScope(el) && isVisible(el))
        .map((table) => {
          const thead = table.querySelector('thead');
          const headRows = thead ? Array.from(thead.querySelectorAll('tr')) : [];
          const colCount = headRows.reduce(
            (max, tr) =>
              Math.max(
                max,
                Array.from(tr.children).reduce(
                  (sum, cell) => sum + ((cell as HTMLTableCellElement).colSpan || 1),
                  0,
                ),
              ),
            0,
          );
          const bodyRows = Array.from(
            table.querySelectorAll(':scope > tbody > tr, :scope > tfoot > tr'),
          );
          return {
            ths: Array.from(table.querySelectorAll('th')).map(text),
            colCount,
            theadClass: norm(thead?.getAttribute('class')),
            thClasses: uniqSorted(
              Array.from(table.querySelectorAll('th')).map((th) => norm(th.getAttribute('class'))),
            ),
            trClasses: uniqSorted(bodyRows.map((tr) => norm(tr.getAttribute('class')))),
            tdClasses: uniqSorted(
              Array.from(table.querySelectorAll('td')).map((td) => norm(td.getAttribute('class'))),
            ),
          };
        });

      const mobileArtifactsVisible = Array.from(document.querySelectorAll(artifacts)).filter(
        isVisible,
      ).length;

      return { tabs, tables, mobileArtifactsVisible };
    },
    {
      dataColor: DATA_COLOR_CLASS.source,
      mobileOnly: MOBILE_ONLY_CLASS.source,
      artifacts: MOBILE_ARTIFACTS_SELECTOR,
    },
  );
}
