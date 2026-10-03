'use client';

/**
 * Casca comum dos blocos da fatia C (Fundamentos, Valuation, Históricos, Pares): card com título,
 * subtítulo, esqueleto enquanto carrega (sem pulsar com prefers-reduced-motion) e erro com
 * "Tentar de novo". Cada bloco busca o próprio dado (preguiçoso, dentro da SecaoPreguicosa).
 *
 * Bloco C (fatia B): no slot `acao` do cabeçalho entra o menu ⋯ do bloco (MenuBlocoPagina) e no
 * rodapé o selo de frescor do bloco (RodapeFrescorBloco). O bloco vem de `bloco` ou do prefixo do
 * `id` ('fundamentos-', 'valuation-', 'historicos-', 'pares-'). Fora da página, com a flag de
 * relato desligada e params v1, os dois não renderizam (card idêntico).
 */
import type { ReactNode } from 'react';
import { MenuBlocoPagina } from '@/components/analiseAtivos/comum/PorQueConferencia';
import { RodapeFrescorBloco } from '@/components/analiseAtivos/ativo/topo/SeloFrescor';
import { ehBlocoReporte, type BlocoReporte } from '@/services/analiseAtivos/curadoria/contrato';
import type { DadoBlocoReporte } from '@/types/analiseAtivosCuradoria';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';

export const CARD_ANALISE =
  'min-w-0 rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 dark:border-gray-800 dark:bg-white/[0.03]';

/** Fundo opaco de célula fixa (sticky) sobre o card, claro/escuro. */
export const FUNDO_STICKY = 'bg-white dark:bg-[#1F1F22]';

/** Negativo (#D92D20 claro / #F97066 escuro). */
export const TEXTO_NEGATIVO = 'text-[#D92D20] dark:text-[#F97066]';

interface Props {
  id: string;
  titulo: string;
  sub?: ReactNode;
  carregando?: boolean;
  erro?: boolean;
  onTentarNovamente?: () => void;
  /** altura do esqueleto (px) */
  alturaEsqueleto?: number;
  children?: ReactNode;
  acao?: ReactNode;
  /** bloco do menu ⋯ e do frescor (padrão: prefixo do id) */
  bloco?: BlocoReporte;
  /** dados do bloco para o "Qual dado?" do relato */
  dadosReporte?: DadoBlocoReporte[];
}

/** 'valuation-WEGE3' → 'valuation' (só blocos com menu). */
export function blocoDoId(id: string): BlocoReporte | null {
  const prefixo = id.slice(0, id.indexOf('-') > 0 ? id.indexOf('-') : id.length);
  return ehBlocoReporte(prefixo) ? prefixo : null;
}

export default function CartaoAnalise({
  id,
  titulo,
  sub,
  carregando,
  erro,
  onTentarNovamente,
  alturaEsqueleto = 200,
  children,
  acao,
  bloco,
  dadosReporte,
}: Props) {
  const t = TEXTOS_TELA.analise;
  const blocoMenu = bloco ?? blocoDoId(id);
  return (
    <section
      aria-labelledby={id}
      aria-busy={carregando || undefined}
      className={`${CARD_ANALISE} flex flex-col gap-3`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id={id} className="text-base font-semibold text-gray-800 dark:text-white/90">
          {titulo}
        </h2>
        {sub ? <span className="text-xs text-gray-500 dark:text-gray-400">{sub}</span> : null}
        {acao}
        {blocoMenu ? (
          <MenuBlocoPagina bloco={blocoMenu} dados={dadosReporte} className="ml-auto self-center" />
        ) : null}
      </div>
      {carregando ? (
        <div
          role="status"
          aria-label={`${t.carregando}: ${titulo}`}
          style={{ height: alturaEsqueleto }}
          className="flex flex-col gap-2"
        >
          {[60, 90, 75, 85].map((w) => (
            <div
              key={w}
              style={{ width: `${w}%` }}
              className="h-3 rounded bg-gray-100 animate-pulse motion-reduce:animate-none dark:bg-gray-800"
            />
          ))}
        </div>
      ) : erro ? (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p className="text-sm text-gray-600 dark:text-gray-300">{t.erro}</p>
          {onTentarNovamente ? (
            <button
              type="button"
              onClick={onTentarNovamente}
              className="inline-flex min-h-11 items-center rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 lg:min-h-9 dark:border-gray-700 dark:text-gray-200"
            >
              {t.tentarNovamente}
            </button>
          ) : null}
        </div>
      ) : (
        children
      )}
      {blocoMenu && !carregando ? <RodapeFrescorBloco bloco={blocoMenu} /> : null}
    </section>
  );
}
