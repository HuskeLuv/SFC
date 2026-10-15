'use client';

/**
 * Filtro Setor (ações) / Segmento (FIIs) da barra "Filtros de fundamentos" (v2.4). Os chips
 * antigos (Lucro 5+ anos, DY ≥, P/VP ≤, Tijolo/Papel, Só dados completos) saíram: a barra agora é a
 * BarraFiltrosCriterios, que usa este componente para o Setor.
 * - Computador: chip que abre um popover com a lista (um por vez); Esc ou clique fora fecham.
 * - Celular: o chip abre um BottomSheet; o "voltar" do sistema fecha o sheet
 *   (useMobileHistoryLayer) e o filtro só é aplicado depois de desfazer a entrada do histórico.
 * Alvo de 44 px (min-h-11) com a pílula visível de 36 px dentro (`classeChipVisual`).
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import BottomSheet from '@/components/ui/sheet/BottomSheet';
import { useMobileHistoryLayer } from '@/hooks/useMobileHistoryLayer';
import { CHIP_CRITERIO } from '@/constants/analiseAtivosVisual';
import { TEXTOS_QUADRO } from '@/services/analiseAtivos/textosQuadro';
import type { ClasseQuadro } from '@/types/analiseAtivosApi';

const T = TEXTOS_QUADRO.barra;

/** Botão do chip: alvo de 44 px (min-h-11) sem encolher; a pílula visível vai num <span>. */
export const BOTAO_CHIP = 'group relative inline-flex min-h-11 shrink-0 items-center outline-none';

/** Pílula visível de 36 px do chip (ligado / desligado / sem dado). */
export function classeChipVisual(estado: 'ligado' | 'desligado' | 'semDado'): string {
  return `inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px] group-focus-visible:ring-[3px] group-focus-visible:ring-[#0079F2] dark:group-focus-visible:ring-[#6E9DC4] ${CHIP_CRITERIO[estado]}`;
}

export interface FiltroSetorProps {
  classe: ClasseQuadro;
  setor: string | null;
  setores: string[];
  onSetor: (setor: string | null) => void;
  celular: boolean;
}

export default function FiltroSetor({
  classe,
  setor,
  setores,
  onSetor,
  celular,
}: FiltroSetorProps) {
  const [aberto, setAberto] = useState(false);
  const rotulo = classe === 'acao' ? T.setor : T.segmento;
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
    <div role="radiogroup" aria-label={rotulo} className="flex flex-col gap-0.5">
      {[null, ...setores].map((s) => {
        const marcado = (s ?? null) === setor;
        return (
          <button
            key={s ?? '__todos'}
            type="button"
            role="radio"
            aria-checked={marcado}
            onClick={() => escolher(s)}
            className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 text-left text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-[#0079F2] dark:focus-visible:ring-[#6E9DC4] ${
              celular ? 'min-h-[52px]' : 'min-h-11'
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

  const botao = (
    <button
      type="button"
      aria-expanded={aberto}
      aria-controls={aberto && !celular ? popoverId : undefined}
      aria-haspopup="dialog"
      aria-pressed={!!setor}
      data-filtro="setor"
      onClick={() => setAberto((x) => !x)}
      className={BOTAO_CHIP}
    >
      <span className={classeChipVisual(setor ? 'ligado' : 'desligado')}>
        {setor ?? rotulo}
        <span aria-hidden="true">▾</span>
      </span>
    </button>
  );

  if (celular) {
    return (
      <>
        {botao}
        <BottomSheet isOpen={aberto} onClose={fechar} title={rotulo}>
          <div className="pb-2">{lista}</div>
        </BottomSheet>
      </>
    );
  }

  return (
    <span ref={caixaRef} className="relative inline-flex">
      {botao}
      {aberto ? (
        <div
          id={popoverId}
          role="dialog"
          aria-label={rotulo}
          className="absolute top-12 left-0 z-40 max-h-80 w-72 overflow-y-auto rounded-xl border border-gray-200 bg-white p-2 shadow-lg dark:border-[#2E3440] dark:bg-[#1F1F22]"
        >
          {lista}
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => setAberto(false)}
              className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm text-gray-700 outline-none hover:bg-gray-50 focus-visible:ring-[3px] focus-visible:ring-[#0079F2] dark:text-gray-200 dark:hover:bg-white/[0.04]"
            >
              {T.fechar}
            </button>
          </div>
        </div>
      ) : null}
    </span>
  );
}
