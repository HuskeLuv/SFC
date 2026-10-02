'use client';

/**
 * Chips de filtro do Quadro + Setor (ações) / Segmento (FIIs).
 * - Computador: chips de 36px que quebram linha; o Setor abre um popover com a lista (um por vez).
 * - Celular: trilho próprio com rolagem lateral só dentro dele (min-h-11, sem encolher); o Setor
 *   abre um BottomSheet; o "voltar" do sistema fecha o sheet (useMobileHistoryLayer).
 * Chip ligado: fundo seguranca, texto branco, aria-pressed.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import BottomSheet from '@/components/ui/sheet/BottomSheet';
import { useMobileHistoryLayer } from '@/hooks/useMobileHistoryLayer';
import { TABLE_MOBILE_STYLES } from '@/components/ui/table/tableStyles';
import { FILTROS_RAPIDOS, type FiltroRapido } from '@/constants/analiseAtivosVisual';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import type { ClasseQuadro } from '@/types/analiseAtivosApi';

const T = TEXTOS_TELA.quadro;

export interface FiltrosQuadroProps {
  classe: ClasseQuadro;
  chips: FiltroRapido[];
  onAlternar: (chip: FiltroRapido) => void;
  setor: string | null;
  setores: string[];
  onSetor: (setor: string | null) => void;
  temFiltro: boolean;
  onLimpar: () => void;
  variante: 'computador' | 'celular';
}

const FOCO =
  'outline-none focus-visible:ring-[3px] focus-visible:ring-[#0079F2] dark:focus-visible:ring-[#6E9DC4]';

function classeChip(ativo: boolean, celular: boolean): string {
  const base = celular
    ? 'inline-flex min-h-11 shrink-0 snap-start items-center whitespace-nowrap rounded-full border px-3.5 text-sm'
    : 'inline-flex h-9 items-center whitespace-nowrap rounded-full border px-3 text-sm';
  return `${base} ${FOCO} ${
    ativo
      ? 'border-[#314666] bg-[#314666] text-white dark:border-[#6E9DC4]'
      : 'border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.04]'
  }`;
}

export default function FiltrosQuadro({
  classe,
  chips,
  onAlternar,
  setor,
  setores,
  onSetor,
  temFiltro,
  onLimpar,
  variante,
}: FiltrosQuadroProps) {
  const celular = variante === 'celular';
  const [aberto, setAberto] = useState(false);
  const rotuloSetor = classe === 'acao' ? T.filtros.setor : T.filtros.segmento;
  const popoverId = useId();
  const caixaRef = useRef<HTMLSpanElement>(null);
  const fechar = useCallback(() => setAberto(false), []);
  const { fecharEntao } = useMobileHistoryLayer(aberto, fechar, celular);

  useEffect(() => {
    if (!aberto || celular) return;
    const fora = (e: MouseEvent) => {
      if (caixaRef.current && !caixaRef.current.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAberto(false);
    };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [aberto, celular]);

  // celular: o filtro (router.replace) só depois de desfazer a entrada do sheet no histórico
  const escolher = (s: string | null) => fecharEntao(() => onSetor(s));

  const lista = (
    <div role="radiogroup" aria-label={rotuloSetor} className="flex flex-col gap-0.5">
      {[null, ...setores].map((s) => {
        const marcado = (s ?? null) === setor;
        return (
          <button
            key={s ?? '__todos'}
            type="button"
            role="radio"
            aria-checked={marcado}
            onClick={() => escolher(s)}
            className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 text-left text-sm ${FOCO} ${
              celular ? 'min-h-[52px]' : 'min-h-9'
            } ${
              marcado
                ? 'bg-[#EDF2F8] font-medium text-[#396CAA] dark:bg-[#6E9DC4]/15 dark:text-[#6E9DC4]'
                : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/[0.04]'
            }`}
          >
            {s ?? T.setorTodos}
            {marcado ? <span aria-hidden="true">✓</span> : null}
          </button>
        );
      })}
    </div>
  );

  const chipsEl = FILTROS_RAPIDOS[classe].map((c) => {
    const ativo = chips.includes(c);
    return (
      <button
        key={c}
        type="button"
        aria-pressed={ativo}
        data-filtro={c}
        onClick={() => onAlternar(c)}
        className={classeChip(ativo, celular)}
      >
        {T.filtros[c]}
        {ativo && !celular ? (
          <span aria-hidden="true" className="ml-1.5 text-xs opacity-80">
            ✕
          </span>
        ) : null}
      </button>
    );
  });

  const botaoSetor = (
    <button
      type="button"
      aria-expanded={aberto}
      aria-controls={aberto && !celular ? popoverId : undefined}
      aria-haspopup="dialog"
      data-filtro="setor"
      onClick={() => setAberto((x) => !x)}
      className={classeChip(!!setor, celular)}
    >
      {setor ?? rotuloSetor}{' '}
      <span aria-hidden="true" className="ml-1">
        ▾
      </span>
    </button>
  );

  if (celular) {
    return (
      <>
        <div
          role="group"
          aria-label={T.filtrosRotulo}
          data-mf-scroll-x=""
          data-quadro-chips=""
          className={`${TABLE_MOBILE_STYLES.chipRail} min-h-[52px] flex-none items-center`}
        >
          {chipsEl}
          {botaoSetor}
          {temFiltro ? (
            <button
              type="button"
              onClick={onLimpar}
              className={`inline-flex min-h-11 shrink-0 items-center px-2 text-sm font-medium text-[#396CAA] dark:text-[#6E9DC4] ${FOCO}`}
            >
              {T.limparFiltros}
            </button>
          ) : null}
        </div>
        <BottomSheet isOpen={aberto} onClose={fechar} title={rotuloSetor}>
          <div className="pb-2">{lista}</div>
        </BottomSheet>
      </>
    );
  }

  return (
    <div
      role="group"
      aria-label={T.filtrosRotulo}
      data-quadro-chips=""
      className="flex flex-wrap items-center gap-2"
    >
      {chipsEl}
      <span ref={caixaRef} className="relative">
        {botaoSetor}
        {aberto ? (
          <div
            id={popoverId}
            role="dialog"
            aria-label={rotuloSetor}
            className="absolute top-11 left-0 z-40 max-h-80 w-72 overflow-y-auto rounded-xl border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-900"
          >
            {lista}
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setAberto(false)}
                className={`inline-flex h-9 items-center rounded-lg px-3 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/[0.04] ${FOCO}`}
              >
                {T.fechar}
              </button>
            </div>
          </div>
        ) : null}
      </span>
      {temFiltro ? (
        <button
          type="button"
          onClick={onLimpar}
          className={`inline-flex h-9 items-center px-1 text-sm font-medium text-[#396CAA] hover:underline dark:text-[#6E9DC4] ${FOCO}`}
        >
          {T.limparFiltros}
        </button>
      ) : null}
    </div>
  );
}
