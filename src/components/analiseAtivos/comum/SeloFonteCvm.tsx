/**
 * Selo de fonte CVM (fatia 0b): 'fonte CVM · pode diferir do relatório do gestor' (vacância,
 * imóveis/CRIs, cotistas de FII). `compacto` mostra só 'fonte CVM', com o texto completo no title
 * e para leitor de tela.
 */
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import type { SeloFonteCvmProps } from '@/types/analiseAtivosApi';

export type { SeloFonteCvmProps };

export default function SeloFonteCvm({ compacto, className }: SeloFonteCvmProps) {
  const completo = TEXTOS_TELA.selos.fonteCvm;
  return (
    <span
      data-selo="fonte_cvm"
      title={compacto ? completo : undefined}
      className={`inline-flex items-center gap-1 text-[11.5px] leading-tight text-gray-500 dark:text-gray-400 ${className ?? ''}`}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5 shrink-0">
        <ellipse cx="8" cy="4" rx="5" ry="2" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <path
          d="M3 4v8c0 1.1 2.2 2 5 2s5-.9 5-2V4M3 8c0 1.1 2.2 2 5 2s5-.9 5-2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
        />
      </svg>
      {compacto ? (
        <>
          <span aria-hidden="true">{TEXTOS_TELA.selos.fonteCvmCurto}</span>
          <span className="sr-only">{completo}</span>
        </>
      ) : (
        completo
      )}
    </span>
  );
}
