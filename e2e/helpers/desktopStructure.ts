import type { Page } from '@playwright/test';

/**
 * Retrato ESTRUTURAL da página no desktop (PWA fase 1): abas e tabelas visíveis com as classes,
 * sem números nem contagem de linhas (que dependem de dado). Roda também no CI, onde o screenshot
 * não vale (o banco é outro) — é o que pega um desvio de desktop DENTRO das tabelas.
 *
 * Normalização das classes (cada className vira tokens ordenados e sem repetição):
 * - saem as cores que dependem do dado (positivo/negativo, faixas do Quanto Falta…):
 *   `(dark:)?(text|bg)-(red|green|amber|emerald|[#…])`;
 * - saem as utilitárias que só valem abaixo de lg (`max-lg:`, `max-[…]:`, `max-sm/md:`, e a
 *   variante `mscreen:` da fase 3 — tela e < 64rem) — não mudam nada no desktop e são justamente o
 *   que as fatias mobile acrescentam.
 *
 * PWA fase 3: `collectStructure(page, { extras: true, exclude })` acrescenta `controls` (títulos,
 * botões, campos, links, diálogos e abas visíveis em `[data-mf-content]`, como
 * `tag|role|aria-level|classe`, sem texto, sem repetição e ordenados). Sem opções o retorno é
 * IDÊNTICO ao das fases 1 e 2 (as snapshots delas não mudam).
 *
 * CONTRATO: toda raiz de ramo só-celular leva `data-mf-mobile` (conta em `mobileArtifactsVisible`).
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
  /** Só com `{ extras: true }` (fase 3). */
  controls?: string[];
}

export interface CollectStructureOptions {
  /**
   * Acrescenta `controls` e passa a considerar o `<aside>` de dentro do conteúdo (Agenda,
   * simulador): o escopo vira `[data-mf-content]` em vez de "fora da sidebar".
   */
  extras?: boolean;
  /**
   * Seletor CSS: o que estiver dentro dele não entra em `controls` nem nas linhas das tabelas
   * (listas que dependem de dado, como as entradas do Histórico).
   */
  exclude?: string;
}

export const DATA_COLOR_CLASS = /^(dark:)?(text|bg)-(red|green|amber|emerald|\[#)/;
export const MOBILE_ONLY_CLASS = /(^|:)(max-(lg|md|sm|xl|\[)|mscreen)/;

export const MOBILE_ARTIFACTS_SELECTOR =
  '[data-mf-card], [data-mf-edit], [data-mf-section], [data-mf-wizard-footer], ' +
  '[data-mf-fluxo-mobile], [data-mf-year-grid], [data-mf-mobile], [data-mf-action-sheet], ' +
  '[data-mf-collapsible]';

/** Mesma normalização do navegador, exportada para teste/depuração em Node. */
export function normalizeClassName(className: string): string {
  const tokens = className
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !DATA_COLOR_CLASS.test(t) && !MOBILE_ONLY_CLASS.test(t));
  return [...new Set(tokens)].sort().join(' ');
}

/** O que `controls` coleta (fase 3). */
export const CONTROLS_SELECTOR =
  'h1, h2, h3, [role="heading"], button, select, input:not([type="hidden"]), textarea, ' +
  'a[href], [role="dialog"], [role="tablist"], [role="tab"]';

export function collectStructure(
  page: Page,
  opts: CollectStructureOptions = {},
): Promise<DesktopStructure> {
  return page.evaluate(
    ({ dataColor, mobileOnly, artifacts, extras, exclude, controlsSelector }) => {
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
      // Casca, sidebar do app e ferramentas de dev não entram. Com `extras`, o escopo passa a ser
      // o [data-mf-content] (que não contém a sidebar) e o <aside> das páginas entra.
      const SHELL =
        '[data-mf-tabbar], [data-mf-mobile-header], nextjs-portal, .tsqd-parent-container';
      const OUTSIDE = `aside, ${SHELL}`;
      const excluded = (el: Element) => !!exclude && !!el.closest(exclude);
      const inScope = extras
        ? (el: Element) => !!el.closest('[data-mf-content]') && !el.closest(SHELL) && !excluded(el)
        : (el: Element) => !el.closest(OUTSIDE);
      const keep = (el: Element) => !excluded(el);

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
          ).filter(keep);
          return {
            ths: Array.from(table.querySelectorAll('th')).filter(keep).map(text),
            colCount,
            theadClass: norm(thead?.getAttribute('class')),
            thClasses: uniqSorted(
              Array.from(table.querySelectorAll('th'))
                .filter(keep)
                .map((th) => norm(th.getAttribute('class'))),
            ),
            trClasses: uniqSorted(bodyRows.map((tr) => norm(tr.getAttribute('class')))),
            tdClasses: uniqSorted(
              Array.from(table.querySelectorAll('td'))
                .filter(keep)
                .map((td) => norm(td.getAttribute('class'))),
            ),
          };
        });

      const mobileArtifactsVisible = Array.from(document.querySelectorAll(artifacts)).filter(
        isVisible,
      ).length;

      if (!extras) return { tabs, tables, mobileArtifactsVisible };

      const controls = uniqSorted(
        Array.from(document.querySelectorAll(controlsSelector))
          .filter((el) => inScope(el) && isVisible(el))
          .map(
            (el) =>
              `${el.tagName.toLowerCase()}|${el.getAttribute('role') ?? ''}|${
                el.getAttribute('aria-level') ?? ''
              }|${norm(el.getAttribute('class'))}`,
          ),
      );
      return { tabs, tables, mobileArtifactsVisible, controls };
    },
    {
      dataColor: DATA_COLOR_CLASS.source,
      mobileOnly: MOBILE_ONLY_CLASS.source,
      artifacts: MOBILE_ARTIFACTS_SELECTOR,
      extras: !!opts.extras,
      exclude: opts.exclude ?? null,
      controlsSelector: CONTROLS_SELECTOR,
    },
  );
}
