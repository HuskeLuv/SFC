'use client';

import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import BottomSheet from '@/components/ui/sheet/BottomSheet';
import { formatBRL } from '@/utils/format';

/**
 * Barra do mês do Fluxo de caixa no celular (PWA fase 2, protótipo cenário b): setas de 44px,
 * nome do mês (toque abre "Escolher mês" com o saldo de cada mês) e a linha de estado
 * ("● Mês atual" / "Mês fechado" / "Previsto"). A virada Dez↔Jan troca o ano via `onYearChange`;
 * sem ele, a seta fica desabilitada nas pontas.
 *
 * Usada pela visão do mês (fatia A) e pelo Orçamento mobile (fatia D). O lançamento rápido usa um
 * trilho de chips próprio.
 */

/** Formatos do nome do mês, do mais longo ao mais curto (ver `tier` no MonthStepper). */
const LABEL_TIERS = [0, 1, 2] as const;
function monthLabelTier(month: number, year: number, tier: number): string {
  const name = MONTH_NAMES[month];
  if (tier === 0) return `${name} de ${year}`;
  if (tier === 1) return `${name} ${year}`;
  return `${name.slice(0, 3)} ${year}`;
}

export type MonthStatus = 'atual' | 'fechado' | 'previsto';

export const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
] as const;

export interface MonthStepperProps {
  year: number;
  /** 0 = Jan … 11 = Dez. */
  month: number;
  onChange(m: number): void;
  onYearChange?(y: number): void;
  /** Estado do mês mostrado; sem ele, é calculado pela data de hoje. */
  monthStatus?: MonthStatus;
  /** Saldo de cada mês (12 posições) para o sheet "Escolher mês". */
  monthSummaries?: Array<{ saldo: number | null }>;
  /** Conteúdo da 4ª coluna (ex.: botão "Ano"). */
  trailing?: ReactNode;
  className?: string;
}

/** Estado do mês em relação a hoje: passado = fechado, hoje = atual, futuro = previsto. */
export function monthStatusFor(year: number, month: number, now: Date = new Date()): MonthStatus {
  const y = now.getFullYear();
  const m = now.getMonth();
  if (year < y || (year === y && month < m)) return 'fechado';
  if (year === y && month === m) return 'atual';
  return 'previsto';
}

const STATUS_TEXT: Record<MonthStatus, string> = {
  atual: '● Mês atual',
  fechado: 'Mês fechado',
  previsto: 'Previsto',
};

const SWIPE_MIN_DX = 56;
const SWIPE_RATIO = 1.5;

/**
 * Trocar de mês arrastando na horizontal: |dx| > 56px e |dx| > 1,5·|dy| (rolagem vertical segue
 * livre — o elemento ganha `touch-action: pan-y`). Arrastar para a esquerda = próximo mês.
 */
export function useMonthSwipe(
  ref: RefObject<HTMLElement | null>,
  { onPrev, onNext }: { onPrev(): void; onNext(): void },
) {
  const handlers = useRef({ onPrev, onNext });
  useEffect(() => {
    handlers.current = { onPrev, onNext };
  }, [onPrev, onNext]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const previousTouchAction = el.style.touchAction;
    el.style.touchAction = 'pan-y';
    let start: { x: number; y: number; id: number } | null = null;

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    };
    const onUp = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      start = null;
      if (Math.abs(dx) <= SWIPE_MIN_DX || Math.abs(dx) <= SWIPE_RATIO * Math.abs(dy)) return;
      if (dx < 0) handlers.current.onNext();
      else handlers.current.onPrev();
    };
    const onCancel = () => {
      start = null;
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancel);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel);
      el.style.touchAction = previousTouchAction;
    };
  }, [ref]);
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

const ARROW =
  'flex h-11 w-11 items-center justify-center rounded-xl text-gray-700 active:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0079F2] dark:text-gray-200 dark:active:bg-white/5';

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d={dir === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function MonthStepper({
  year,
  month,
  onChange,
  onYearChange,
  monthStatus,
  monthSummaries,
  trailing,
  className = '',
}: MonthStepperProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const nameRef = useRef<HTMLButtonElement>(null);
  const labelRef = useRef<HTMLElement>(null);
  const previous = useRef({ year, month });

  // Nome do mês que cabe na largura: "Setembro de 2026" → "Setembro 2026" → "Set 2026" (e, se nem
  // isso couber, a elipse). O formato é o mesmo nos 12 meses (o do mês mais largo), para o rótulo
  // não mudar de forma ao passar de mês. Os textos ficam medidos num bloco invisível com a MESMA
  // fonte do rótulo; o botão tem a largura da grade (não do conteúdo), então medir não muda o que é medido.
  const [tier, setTier] = useState(0);
  const sizerRef = useRef<HTMLSpanElement>(null);
  const chevronRef = useRef<SVGSVGElement>(null);
  useLayoutEffect(() => {
    const button = nameRef.current;
    const label = labelRef.current;
    const sizer = sizerRef.current;
    if (!button || !label || !sizer) return;
    const measure = () => {
      const bs = getComputedStyle(button);
      const ls = getComputedStyle(label);
      sizer.style.font = ls.font;
      const gap = parseFloat(ls.columnGap) || 0;
      const chevron = chevronRef.current?.getBoundingClientRect().width ?? 0;
      const avail =
        button.clientWidth -
        (parseFloat(bs.paddingLeft) || 0) -
        (parseFloat(bs.paddingRight) || 0) -
        chevron -
        gap;
      const widest = Array.from(sizer.children, (group) =>
        Math.max(...Array.from(group.children, (el) => el.getBoundingClientRect().width)),
      );
      const fit = widest.findIndex((w) => w <= avail);
      setTier(fit === -1 ? widest.length - 1 : fit);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(button);
    return () => observer.disconnect();
  }, [year]);

  const status = monthStatus ?? monthStatusFor(year, month);
  const canPrev = month > 0 || !!onYearChange;
  const canNext = month < 11 || !!onYearChange;

  // Slide de 24px/200ms no nome ao trocar de mês (sem animação com prefers-reduced-motion).
  useEffect(() => {
    const before = previous.current;
    previous.current = { year, month };
    const delta = (year - before.year) * 12 + (month - before.month);
    const el = labelRef.current;
    if (!delta || !el || typeof el.animate !== 'function' || prefersReducedMotion()) return;
    const from = delta > 0 ? 24 : -24;
    el.animate(
      [
        { opacity: 0.2, transform: `translateX(${from}px)` },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 200, easing: 'ease' },
    );
  }, [year, month]);

  const goPrev = () => {
    if (month > 0) onChange(month - 1);
    else if (onYearChange) {
      onYearChange(year - 1);
      onChange(11);
    }
  };
  const goNext = () => {
    if (month < 11) onChange(month + 1);
    else if (onYearChange) {
      onYearChange(year + 1);
      onChange(0);
    }
  };

  const pick = (m: number) => {
    setPickerOpen(false);
    if (m !== month) onChange(m);
    // Depois que o sheet devolve o foco ao gatilho, garante o nome do mês.
    requestAnimationFrame(() => nameRef.current?.focus());
  };

  return (
    <>
      <div
        data-mf-month-stepper=""
        className={`grid grid-cols-[44px_minmax(0,1fr)_44px_auto] items-center gap-0.5 ${className}`}
      >
        <button
          type="button"
          aria-label="Mês anterior"
          onClick={goPrev}
          disabled={!canPrev}
          className={ARROW}
        >
          <Chevron dir="left" />
        </button>
        <button
          ref={nameRef}
          type="button"
          aria-haspopup="dialog"
          onClick={() => setPickerOpen(true)}
          className="relative flex min-h-11 min-w-0 flex-col items-center justify-center rounded-xl px-1 text-gray-800 active:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0079F2] dark:text-white/90 dark:active:bg-white/5"
        >
          <b
            ref={labelRef}
            data-mf-month-label=""
            aria-live="polite"
            className="flex max-w-full min-w-0 items-center gap-1.5 text-[17px] font-semibold whitespace-nowrap"
          >
            {/* Leitor de tela lê sempre o nome inteiro; a versão curta é só visual. */}
            <span className="sr-only">{monthLabelTier(month, year, 0)}</span>
            {/* O texto num span próprio: `truncate` num flex não mostra a elipse. */}
            <span aria-hidden="true" data-mf-month-label-text="" className="min-w-0 truncate">
              {monthLabelTier(month, year, tier)}
            </span>
            <svg
              ref={chevronRef}
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              className="shrink-0"
            >
              <path
                d="M6 9l6 6 6-6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </b>
          {/* Fora do rótulo (o texto dele fica só com o mês mostrado); a fonte vem do rótulo. */}
          <span
            ref={sizerRef}
            aria-hidden="true"
            className="pointer-events-none invisible absolute top-0 left-0 h-0 w-0 overflow-hidden"
          >
            {LABEL_TIERS.map((t) => (
              <span key={t} className="block">
                {MONTH_NAMES.map((_, m) => (
                  <span key={m} className="block w-max">
                    {monthLabelTier(m, year, t)}
                  </span>
                ))}
              </span>
            ))}
          </span>
          <small
            className={`text-xs font-medium ${
              status === 'atual'
                ? 'text-mf-patrimonio dark:text-mf-tranquilidade'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            {STATUS_TEXT[status]}
          </small>
        </button>
        <button
          type="button"
          aria-label="Próximo mês"
          onClick={goNext}
          disabled={!canNext}
          className={ARROW}
        >
          <Chevron dir="right" />
        </button>
        <div className="flex items-center">{trailing}</div>
      </div>

      <BottomSheet isOpen={pickerOpen} onClose={() => setPickerOpen(false)} title="Escolher mês">
        <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
          Saldo de cada mês de {year} (entradas − despesas)
        </p>
        <div className="grid grid-cols-3 gap-2 pb-2">
          {MONTH_NAMES.map((name, i) => {
            const st = monthStatusFor(year, i);
            const saldo = monthSummaries?.[i]?.saldo ?? null;
            const selected = i === month;
            const label = [
              name,
              saldo !== null ? `saldo ${formatBRL(saldo)}` : null,
              st === 'atual' ? 'mês atual' : null,
              st === 'previsto' ? 'previsto' : null,
            ]
              .filter(Boolean)
              .join(', ');
            return (
              <button
                key={name}
                type="button"
                data-mf-month-option={i}
                aria-current={selected ? 'true' : undefined}
                aria-label={label}
                onClick={() => pick(i)}
                className={`flex min-h-11 min-w-0 flex-col items-start justify-center gap-0.5 rounded-xl border px-2.5 py-2 text-left text-gray-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0079F2] dark:text-white/90 ${
                  selected
                    ? 'border-[#0079F2] bg-[#0079F2]/10 shadow-[inset_0_0_0_1px_#0079F2] dark:bg-[#0079F2]/20'
                    : 'border-gray-200 bg-white active:bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03]'
                }`}
              >
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  {name.slice(0, 3)}
                  {st === 'atual' ? (
                    <span className="text-[10px] font-semibold tracking-wide text-mf-patrimonio uppercase dark:text-mf-tranquilidade">
                      hoje
                    </span>
                  ) : null}
                </span>
                <span
                  className={`max-w-full truncate text-xs font-medium tabular-nums ${
                    st === 'previsto'
                      ? 'text-gray-500 dark:text-gray-400'
                      : 'text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {saldo !== null ? formatBRL(saldo) : '—'}
                </span>
                {st === 'previsto' ? (
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">Previsto</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </BottomSheet>
    </>
  );
}

export { MonthStepper };
