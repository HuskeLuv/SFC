'use client';

/**
 * Selo "dados incompletos" (fatia 0b; decisão 4): chip com borda TRACEJADA que abre "O que falta"
 * com os motivos legíveis — popover no computador, BottomSheet no celular (< lg). Sem motivos, é só
 * o chip (sem botão). Área de toque de 44px no chip (pseudo-elemento) sem engordar a linha.
 */
import { useEffect, useId, useRef, useState } from 'react';
import BottomSheet from '@/components/ui/sheet/BottomSheet';
import { IconeCriterio } from '@/components/analiseAtivos/comum/BadgeCriterio';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import { TEXTOS_TELA, formatarTexto } from '@/services/analiseAtivos/textosTela';
import type { MotivoTela, SeloIncompletoProps } from '@/types/analiseAtivosApi';

export type { SeloIncompletoProps };

const CHIP =
  'inline-flex items-center gap-1 rounded-full border border-dashed border-gray-500 px-2 py-px text-[11.5px] leading-[18px] font-medium whitespace-nowrap text-gray-700 dark:border-gray-400 dark:text-gray-300';

function ListaMotivos({ motivos }: { motivos: MotivoTela[] }) {
  return (
    <>
      <ul className="flex flex-col gap-2">
        {motivos.map((m) => (
          <li
            key={m.codigo}
            className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300"
          >
            <span className="mt-0.5 inline-flex text-gray-500 dark:text-gray-400">
              <IconeCriterio icone="circulo_tracejado_interrogacao" />
            </span>
            <span>{m.texto}</span>
          </li>
        ))}
      </ul>
      <span className="mt-3 block text-xs text-gray-500 dark:text-gray-400">
        {TEXTOS_TELA.indice.incompletoRodape}
      </span>
    </>
  );
}

export default function SeloIncompleto({ motivos, ticker, className }: SeloIncompletoProps) {
  const [aberto, setAberto] = useState(false);
  const celular = useIsBelowLg();
  const raizRef = useRef<HTMLSpanElement>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const idPainel = useId();
  const t = TEXTOS_TELA.comum.seloIncompleto;
  const titulo = ticker
    ? formatarTexto(t.tituloComTicker, { ticker })
    : TEXTOS_TELA.indice.incompletoTitulo;
  const rotulo = TEXTOS_TELA.selos.dadosIncompletos;

  // Popover do computador: Esc e clique fora fecham (o BottomSheet cuida disso no celular).
  useEffect(() => {
    if (!aberto || celular) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAberto(false);
        botaoRef.current?.focus();
      }
    };
    const onFora = (e: MouseEvent) => {
      if (raizRef.current && !raizRef.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onFora);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onFora);
    };
  }, [aberto, celular]);

  if (motivos.length === 0) {
    return (
      <span data-selo="incompleto" className={`${CHIP} ${className ?? ''}`}>
        {rotulo}
      </span>
    );
  }

  return (
    <span ref={raizRef} className={`relative inline-flex ${className ?? ''}`}>
      <button
        ref={botaoRef}
        type="button"
        data-selo="incompleto"
        aria-expanded={aberto}
        aria-controls={aberto && !celular ? idPainel : undefined}
        aria-label={`${rotulo}. ${t.abrir}`}
        title={motivos.map((m) => m.texto).join(' · ')}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setAberto((v) => !v);
        }}
        className={`${CHIP} relative cursor-pointer after:absolute after:inset-x-0 after:-inset-y-3 hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-[#0079F2] focus-visible:outline-none dark:hover:bg-white/5`}
      >
        {rotulo}
        <svg viewBox="0 0 12 12" aria-hidden="true" className="h-2.5 w-2.5">
          <path
            d="M3 4.5l3 3 3-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
      {celular ? (
        <BottomSheet isOpen={aberto} onClose={() => setAberto(false)} title={titulo}>
          <div className="pt-1 pb-4">
            <ListaMotivos motivos={motivos} />
          </div>
        </BottomSheet>
      ) : aberto ? (
        <span
          id={idPainel}
          role="dialog"
          aria-label={titulo}
          onClick={(e) => e.stopPropagation()}
          className="absolute top-full left-0 z-40 mt-2 block w-72 rounded-xl border border-gray-200 bg-white p-4 text-left whitespace-normal shadow-lg dark:border-gray-800 dark:bg-gray-900"
        >
          <span className="mb-2 block text-sm font-semibold text-gray-800 dark:text-white/90">
            {titulo}
          </span>
          <ListaMotivos motivos={motivos} />
        </span>
      ) : null}
    </span>
  );
}
