'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCashflowYear } from '@/context/CashflowYearContext';
import { useCashflowView } from '@/hooks/useCashflowView';
import { useCashflowMutations } from '@/hooks/useCashflowMutations';
import { ImportPlanilhaModal } from '@/components/cashflow/ImportPlanilhaModal';
import { MobileSaveToast } from '@/components/ui/sheet/MobileSaveToast';
import { QUICK_LAUNCH_ACTIONS } from '@/layout/mobile/quickLaunch';
import { readMesParam, writeMesParam } from '@/lib/cashflow/monthParam';
import { emitOpenLancamento, onCashflowFlash } from '@/lib/cashflow/cashflowEvents';
import {
  allGroupIds,
  buildMonthBlocks,
  defaultMonth,
  groupPathToItem,
  monthStatus,
  monthSummaries,
  type MonthBlock,
  type MonthDerived,
  type MonthItem,
} from '@/lib/cashflow/monthViewModel';
import { savingsIndex } from '@/services/cashflow/derivedIndices';
import MonthStepper, { MONTH_NAMES, useMonthSwipe } from './MonthStepper';
import CashflowEditSheets, { type CashflowEditTarget } from './CashflowEditSheets';
import CashflowYearGridSheet from './CashflowYearGridSheet';
import MonthSummaryCard from './MonthSummaryCard';
import { MonthGroupSection, type MonthSectionContext } from './MonthGroupSection';
import { MonthDerivedGroup } from './MonthDerivedRow';
import DerivedInfoSheet from './DerivedInfoSheet';
import MonthToolbarSheet from './MonthToolbarSheet';
import {
  BlankPlanilha,
  MonthEmptyNotice,
  MonthViewError,
  MonthViewSkeleton,
} from './MonthViewStates';

/**
 * Visão do mês do Fluxo de caixa no celular (PWA fase 2, fatia A): UM mês por vez, com a barra do
 * mês fixa (setas, deslizar, "Escolher mês"), o resumo do mês e a planilha em lista agrupada — na
 * ordem da grade, com linhas calculadas no lugar. Só abaixo de lg (o desktop segue no DataTableTwo).
 *
 * - Mês em `?mes=` (compartilhado com o Orçamento), inicial = mês de hoje (decisão 10).
 * - Recolher/expandir usa o MESMO estado (e localStorage) do desktop.
 * - Tocar numa linha abre o sheet da célula (fatia B); o "Ano" abre a grade (fatia D).
 * - Linhas sem valor ficam escondidas por grupo (decisão 1).
 */

const ANNUAL_STORAGE_KEY = 'cashflow:mobile:anual';
const FLASH_MS = 1600;

function readShowAnnual(): boolean {
  try {
    return window.localStorage.getItem(ANNUAL_STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** O "+ Lançar → Despesa ou receita" já funciona (fatia C) quando o atalho não é "Em breve". */
function lancamentoRapidoDisponivel(): boolean {
  const fluxo = QUICK_LAUNCH_ACTIONS.find((a) => a.id === 'fluxo') as
    | { phase?: number }
    | undefined;
  return !!fluxo && fluxo.phase === undefined;
}

/** Agrupa linhas calculadas seguidas num só cartão. */
function groupBlocks(blocks: MonthBlock[]) {
  const out: Array<
    | { kind: 'group'; block: Extract<MonthBlock, { kind: 'group' }> }
    | { kind: 'derived'; rows: MonthDerived[] }
  > = [];
  for (const block of blocks) {
    const last = out[out.length - 1];
    if (block.kind === 'derived') {
      if (last?.kind === 'derived') last.rows.push(block);
      else out.push({ kind: 'derived', rows: [block] });
    } else {
      out.push({ kind: 'group', block });
    }
  }
  return out;
}

const TRAILING_BTN =
  'inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-2.5 text-[13.5px] font-semibold text-gray-800 active:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0079F2] dark:border-gray-700 dark:bg-white/[0.03] dark:text-white/90 dark:active:bg-white/5';

export default function CashflowMonthView() {
  const { year, setYear } = useCashflowYear();
  const { data, loading, error, refetch, processedData, derived, collapsible } =
    useCashflowView(year);
  const { reorderItem } = useCashflowMutations(year);
  const { collapsed, toggleCollapse, setCollapsedAll } = collapsible;

  const [initialMes] = useState<number | null>(() => readMesParam());
  const [month, setMonth] = useState<number>(() => initialMes ?? defaultMonth(year));
  const [target, setTarget] = useState<CashflowEditTarget | null>(null);
  const [derivedOpen, setDerivedOpen] = useState<MonthDerived | null>(null);
  const [toolbarOpen, setToolbarOpen] = useState(false);
  const [yearOpen, setYearOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [reorderGroupId, setReorderGroupId] = useState<string | null>(null);
  const [showEmpty, setShowEmpty] = useState<Record<string, boolean>>({});
  const [showAnnual, setShowAnnual] = useState<boolean>(readShowAnnual);
  const [flash, setFlash] = useState<{ itemId: string; nonce: number } | null>(null);
  const [canLaunch] = useState(lancamentoRapidoDisponivel);

  // ?mes= acompanha o mês mostrado (history.replaceState).
  useEffect(() => {
    writeMesParam(month);
  }, [month]);

  // Trocar o ano (seletor do cabeçalho) volta ao mês inicial daquele ano. Exceções: a virada
  // Dez↔Jan pelas setas (o MonthStepper já escolhe o mês) e a primeira sincronização do ?ano= da
  // URL (o provider lê o ano depois de montar; o ?mes= da mesma URL vale).
  const yearFromStepperRef = useRef(false);
  const [initialUrlYear] = useState<number | null>(() => {
    const raw = Number(new URLSearchParams(window.location.search).get('ano'));
    return Number.isInteger(raw) && raw > 0 ? raw : null;
  });
  const urlYearSyncedRef = useRef(initialUrlYear === null || initialUrlYear === year);
  const previousYearRef = useRef(year);
  useEffect(() => {
    if (previousYearRef.current === year) return;
    previousYearRef.current = year;
    setReorderGroupId(null);
    if (yearFromStepperRef.current) {
      yearFromStepperRef.current = false;
      return;
    }
    if (!urlYearSyncedRef.current && year === initialUrlYear) {
      urlYearSyncedRef.current = true;
      if (initialMes === null) setMonth(defaultMonth(year));
      return;
    }
    urlYearSyncedRef.current = true;
    setMonth(defaultMonth(year));
  }, [year, initialUrlYear, initialMes]);

  const changeYearFromStepper = useCallback(
    (y: number) => {
      yearFromStepperRef.current = true;
      setYear(y);
    },
    [setYear],
  );

  const goPrev = useCallback(() => {
    if (month > 0) setMonth(month - 1);
    else {
      changeYearFromStepper(year - 1);
      setMonth(11);
    }
  }, [month, year, changeYearFromStepper]);
  const goNext = useCallback(() => {
    if (month < 11) setMonth(month + 1);
    else {
      changeYearFromStepper(year + 1);
      setMonth(0);
    }
  }, [month, year, changeYearFromStepper]);

  const swipeRef = useRef<HTMLDivElement>(null);
  useMonthSwipe(swipeRef, { onPrev: goPrev, onNext: goNext });

  const blocks = useMemo(
    () => buildMonthBlocks({ processedData, derived, month, year }),
    [processedData, derived, month, year],
  );
  const summaries = useMemo(() => monthSummaries(processedData, year), [processedData, year]);

  // Refs para os callbacks estáveis das linhas (memo) e do barramento.
  const stateRef = useRef({ month, year, groups: processedData.groups, collapsed });
  stateRef.current = { month, year, groups: processedData.groups, collapsed };

  const openItem = useCallback((item: MonthItem) => {
    setTarget({
      kind: 'cell',
      itemId: item.itemId,
      groupId: item.groupId,
      month: stateRef.current.month,
    });
  }, []);
  const openGroupActions = useCallback((groupId: string) => {
    setTarget({ kind: 'group', groupId, month: stateRef.current.month });
  }, []);
  const toggleShowEmpty = useCallback((groupId: string) => {
    setShowEmpty((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  }, []);
  const moveItem = useCallback(
    (groupId: string, itemId: string, neighborId: string) => {
      void reorderItem(groupId, itemId, neighborId).then((ok) => {
        if (!ok) setToast('Não foi possível mover a linha.');
      });
    },
    [reorderItem],
  );

  // Pisca a linha: muda o mês, abre o caminho, mostra as linhas sem valor do grupo e rola até ela.
  const flashItem = useCallback(
    (itemId: string, flashMonth: number) => {
      const { groups, collapsed: current } = stateRef.current;
      setMonth(flashMonth);
      const path = groupPathToItem(groups, itemId);
      if (path.some((id) => current[id])) {
        const next = { ...current };
        for (const id of path) delete next[id];
        setCollapsedAll(next);
      }
      const leaf = path[path.length - 1];
      if (leaf) setShowEmpty((prev) => (prev[leaf] ? prev : { ...prev, [leaf]: true }));
      setFlash({ itemId, nonce: Date.now() });
    },
    [setCollapsedAll],
  );

  useEffect(
    () =>
      onCashflowFlash((detail) => {
        if (detail.year !== stateRef.current.year) return;
        flashItem(detail.itemId, detail.month);
      }),
    [flashItem],
  );

  useEffect(() => {
    if (!flash) return;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = () => {
      const selector = `[data-mf-fluxo-row][data-item-id="${CSS.escape(flash.itemId)}"]`;
      const el = document.querySelector<HTMLElement>(selector);
      if (!el) {
        if (tries++ < 10) timer = setTimeout(run, 150);
        return;
      }
      const reduced = prefersReducedMotion();
      el.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
      el.setAttribute('data-mf-flash', '');
      if (!reduced && typeof el.animate === 'function') {
        el.animate(
          [
            { backgroundColor: 'rgba(0,121,242,0.16)' },
            { backgroundColor: 'rgba(0,121,242,0.16)', offset: 0.4 },
            { backgroundColor: 'transparent' },
          ],
          { duration: FLASH_MS, easing: 'ease' },
        );
      }
      timer = setTimeout(() => el.removeAttribute('data-mf-flash'), FLASH_MS);
    };
    timer = setTimeout(run, 0);
    return () => clearTimeout(timer);
  }, [flash]);

  const onSaved = useCallback(
    (message: string, opts?: { itemId?: string; month?: number }) => {
      setToast(message);
      if (opts?.itemId) flashItem(opts.itemId, opts.month ?? stateRef.current.month);
    },
    [flashItem],
  );

  const toggleAnnual = useCallback(() => {
    setShowAnnual((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(ANNUAL_STORAGE_KEY, next ? '1' : '0');
      } catch {
        // storage indisponível: vale só nesta visita
      }
      return next;
    });
  }, []);

  const collapseAll = useCallback(() => {
    setCollapsedAll(Object.fromEntries(allGroupIds(processedData.groups).map((id) => [id, true])));
  }, [processedData.groups, setCollapsedAll]);
  const expandAll = useCallback(() => setCollapsedAll({}), [setCollapsedAll]);

  // Troca de overlay: fecha o "Mais ações" e abre o próximo no quadro seguinte (o sheet que fecha
  // devolve o foco ao gatilho antes).
  const thenOpen = (open: () => void) => {
    setToolbarOpen(false);
    requestAnimationFrame(open);
  };

  const sectionCtx: MonthSectionContext = useMemo(
    () => ({
      collapsed,
      onToggleCollapse: toggleCollapse,
      showAnnual,
      showEmpty,
      onToggleShowEmpty: toggleShowEmpty,
      reorderGroupId,
      onMoveItem: moveItem,
      onOpenItem: openItem,
      onGroupActions: openGroupActions,
      onOpenDerived: setDerivedOpen,
    }),
    [
      collapsed,
      toggleCollapse,
      showAnnual,
      showEmpty,
      toggleShowEmpty,
      reorderGroupId,
      moveItem,
      openItem,
      openGroupActions,
    ],
  );

  const ready = !loading && !error && data.length > 0;
  const monthName = MONTH_NAMES[month];
  const entradas = processedData.entradasByMonth[month] || 0;
  const despesas = processedData.despesasByMonth[month] || 0;
  const saldo = processedData.totalByMonth[month] || 0;
  const saldoCc = derived.saldoContaCorrenteAnteriorByMonth[month];
  const blankYear = processedData.entradasTotal === 0 && processedData.despesasTotal === 0;
  const emptyMonth = entradas === 0 && despesas === 0;
  const launch = canLaunch ? emitOpenLancamento : undefined;
  const reorderGroupName = useMemo(() => {
    if (!reorderGroupId) return null;
    const find = (list: typeof processedData.groups): string | null => {
      for (const g of list) {
        if (g.id === reorderGroupId) return g.name;
        const sub = g.children?.length ? find(g.children) : null;
        if (sub) return sub;
      }
      return null;
    };
    return find(processedData.groups);
  }, [reorderGroupId, processedData]);

  return (
    <section
      data-mf-fluxo-mobile=""
      data-mf-fluxo-ready={ready || undefined}
      aria-label="Fluxo de caixa do mês"
      className="flex flex-col gap-3"
    >
      <div
        data-mf-month-bar=""
        className="sticky top-[var(--mf-header-h,0px)] z-20 -mx-4 border-b border-gray-100 bg-white px-2 py-1 max-[359px]:-mx-3 max-[359px]:px-0 dark:border-gray-800 dark:bg-[#1F1F22]"
      >
        <MonthStepper
          year={year}
          month={month}
          onChange={setMonth}
          onYearChange={changeYearFromStepper}
          monthStatus={monthStatus(year, month)}
          monthSummaries={summaries}
          // Abaixo de 360px o nome do mês cabe inteiro ("Setembro de 2026") com 15px.
          className="max-[359px]:[&_[data-mf-month-label]]:text-[14.5px]"
          trailing={
            <span className="flex items-center gap-1 pl-1 max-[359px]:gap-0 max-[359px]:pl-0">
              <button
                type="button"
                aria-label="Ver o ano inteiro"
                aria-haspopup="dialog"
                onClick={() => setYearOpen(true)}
                className={TRAILING_BTN}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                </svg>
                <span aria-hidden="true" className="max-[429px]:hidden">
                  Ano
                </span>
              </button>
              <button
                type="button"
                aria-label="Mais ações"
                aria-haspopup="dialog"
                onClick={() => setToolbarOpen(true)}
                className="grid h-11 w-11 place-items-center rounded-xl text-gray-700 active:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0079F2] dark:text-gray-200 dark:active:bg-white/5"
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <circle cx="5" cy="12" r="2" />
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="19" cy="12" r="2" />
                </svg>
              </button>
            </span>
          }
        />
      </div>

      <div ref={swipeRef} className="flex min-w-0 flex-col gap-3">
        {loading ? (
          <MonthViewSkeleton />
        ) : error ? (
          <MonthViewError onRetry={() => void refetch()} />
        ) : (
          <>
            {blankYear ? (
              <BlankPlanilha year={year} onLaunch={launch} onImport={() => setImportOpen(true)} />
            ) : emptyMonth ? (
              <MonthEmptyNotice monthName={monthName} onLaunch={launch} />
            ) : null}
            <MonthSummaryCard
              monthName={monthName}
              saldo={saldo}
              entradas={entradas}
              despesas={despesas}
              poupanca={savingsIndex(saldo, entradas)}
              saldoCcAnterior={saldoCc ?? null}
            />
            {groupBlocks(blocks).map((entry) =>
              entry.kind === 'group' ? (
                <MonthGroupSection key={entry.block.groupId} group={entry.block} ctx={sectionCtx} />
              ) : (
                <MonthDerivedGroup
                  key={entry.rows.map((r) => r.key).join('-')}
                  rows={entry.rows}
                  onOpen={setDerivedOpen}
                />
              ),
            )}
            <p className="px-2 pt-1 pb-2 text-center text-xs text-gray-500 dark:text-gray-400">
              Toque numa linha para editar · deslize para trocar de mês
            </p>
          </>
        )}
      </div>

      {reorderGroupId ? (
        <div
          role="status"
          className="fixed inset-x-4 bottom-[calc(var(--mf-bottom-nav-h,0px)+0.75rem)] z-30 flex items-center gap-2 rounded-[14px] border border-mf-tranquilidade bg-white py-2 pr-2 pl-3.5 shadow-[0_8px_24px_rgba(49,70,102,0.14)] dark:bg-[#1F1F22]"
        >
          <p className="min-w-0 flex-1 text-[13.5px] font-medium text-gray-800 dark:text-white/90">
            Reordenando <b>{reorderGroupName ?? 'o grupo'}</b>. Use as setas.
          </p>
          <button
            type="button"
            onClick={() => setReorderGroupId(null)}
            className="inline-flex min-h-11 shrink-0 items-center rounded-xl bg-mf-patrimonio px-4 text-sm font-semibold text-white active:bg-mf-seguranca focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0079F2]"
          >
            Concluir
          </button>
        </div>
      ) : null}

      <CashflowEditSheets
        year={year}
        groups={data}
        itemTotals={processedData.itemTotals}
        target={target}
        onTargetChange={setTarget}
        onSaved={onSaved}
        onStartReorder={setReorderGroupId}
      />
      <CashflowYearGridSheet
        isOpen={yearOpen}
        onClose={() => setYearOpen(false)}
        year={year}
        month={month}
        onPickMonth={(m) => {
          setMonth(m);
          setYearOpen(false);
        }}
      />
      <DerivedInfoSheet
        row={derivedOpen}
        year={year}
        month={month}
        onClose={() => setDerivedOpen(null)}
      />
      <MonthToolbarSheet
        isOpen={toolbarOpen}
        onClose={() => setToolbarOpen(false)}
        year={year}
        onOpenYear={() => thenOpen(() => setYearOpen(true))}
        onExpandAll={() => {
          expandAll();
          setToolbarOpen(false);
        }}
        onCollapseAll={() => {
          collapseAll();
          setToolbarOpen(false);
        }}
        showAnnual={showAnnual}
        onToggleAnnual={toggleAnnual}
        onImport={() => thenOpen(() => setImportOpen(true))}
      />
      <ImportPlanilhaModal isOpen={importOpen} onClose={() => setImportOpen(false)} year={year} />
      <MobileSaveToast message={toast} onDismiss={() => setToast(null)} />
    </section>
  );
}

export { CashflowMonthView };
