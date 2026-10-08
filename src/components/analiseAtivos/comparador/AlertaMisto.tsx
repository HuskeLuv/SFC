'use client';

/**
 * Aviso neutro do Comparador (fundo #EDF2F8, borda #396CAA, ícone + texto; escuro: patrimonio
 * diluído com borda tranquilidade). Usado no misto tijolo + papel, nos tickers ignorados do link e
 * nas linhas informativas (1 ativo, limite de 4).
 */
import type { ReactNode } from 'react';
import { TEXTOS_COMPARADOR } from '@/services/analiseAtivos/textosComparador';

export function IconeInfo({ className = 'h-[18px] w-[18px]' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`shrink-0 ${className}`}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 11v6M12 7.5v.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export interface AvisoComparadorProps {
  children: ReactNode;
  /** 'note' (aviso fixo) ou 'status' (aparece após uma ação) */
  role?: 'note' | 'status';
  className?: string;
}

export function AvisoComparador({ children, role = 'note', className = '' }: AvisoComparadorProps) {
  return (
    <div
      role={role}
      className={`flex items-start gap-2 rounded-[10px] border border-[#396CAA] bg-[#EDF2F8] px-3 py-2.5 text-[13.5px] text-gray-800 dark:border-[#6E9DC4] dark:bg-[#396CAA]/15 dark:text-gray-200 ${className}`}
    >
      <IconeInfo className="mt-px h-[18px] w-[18px] text-[#314666] dark:text-[#6E9DC4]" />
      <span>{children}</span>
    </div>
  );
}

/** Linha informativa discreta (sem caixa): "Adicione mais um ativo…", "Limite de 4 ativos…". */
export function LinhaInformativa({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-[13px] text-gray-700 dark:text-gray-300">
      <IconeInfo className="mt-0.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
      <span>{children}</span>
    </p>
  );
}

export default function AlertaMisto() {
  return <AvisoComparador>{TEXTOS_COMPARADOR.misto}</AvisoComparador>;
}
