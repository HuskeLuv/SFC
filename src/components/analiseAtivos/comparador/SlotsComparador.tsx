'use client';

/**
 * Slots do Comparador. Computador: grade de 4 (2 abaixo de 1100px de container), raio 14, remover
 * com 44×44, ticker com área de toque de 44px, cotação, tipo do FII e o selo "sem negociação
 * recente" fora do Quadro. Celular: slots empilhados de 60px. O slot "Adicionar" entra por
 * `adicionar` (só no computador; no celular o botão fica abaixo da lista).
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import SeloEstado from '@/components/analiseAtivos/comum/SeloEstado';
import { formatarEstado } from '@/components/analiseAtivos/comum/formatarAnalise';
import { FOCO } from '@/components/analiseAtivos/comparador/SlotAdicionar';
import { TEXTOS_COMPARADOR } from '@/services/analiseAtivos/textosComparador';
import { TEXTOS_TELA, formatarTexto } from '@/services/analiseAtivos/textosTela';
import type { AtivoComparador } from '@/types/analiseAtivosBlocoD';

const TS = TEXTOS_COMPARADOR.slots;

function IconeX() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[18px] w-[18px]">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function Logo({ ticker, tamanho }: { ticker: string; tamanho: 36 | 40 }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-lg bg-[#EDF2F8] text-[10px] font-semibold text-[#314666] dark:bg-white/[0.06] dark:text-[#6E9DC4] ${
        tamanho === 40 ? 'h-10 w-10' : 'h-9 w-9'
      }`}
    >
      {ticker.slice(0, 4)}
    </span>
  );
}

function LinkTicker({ ticker }: { ticker: string }) {
  return (
    <Link
      href={`/analise-ativos/${encodeURIComponent(ticker)}`}
      aria-label={formatarTexto(TS.abrirAtivo, { ticker })}
      className={`-my-3 inline-flex min-h-11 min-w-11 items-center rounded-md text-[15px] font-semibold text-[#396CAA] hover:underline dark:text-[#6E9DC4] ${FOCO}`}
    >
      {ticker}
    </Link>
  );
}

function BotaoRemover({ ticker, onRemover }: { ticker: string; onRemover: (t: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onRemover(ticker)}
      aria-label={formatarTexto(TS.remover, { ticker })}
      data-remover={ticker}
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-[10px] text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-white/90 ${FOCO}`}
    >
      <IconeX />
    </button>
  );
}

export interface SlotsComparadorProps {
  slots: readonly string[];
  ativos: ReadonlyMap<string, AtivoComparador>;
  onRemover: (ticker: string) => void;
  celular: boolean;
  /** slot "Adicionar" (computador) */
  adicionar?: ReactNode;
}

function Esqueleto({ altura }: { altura: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block ${altura} rounded-[14px] bg-gray-100 motion-safe:animate-pulse dark:bg-white/[0.04]`}
    />
  );
}

export default function SlotsComparador({
  slots,
  ativos,
  onRemover,
  celular,
  adicionar,
}: SlotsComparadorProps) {
  if (celular) {
    return (
      <ul aria-label={TS.rotulo} className="flex flex-col gap-2">
        {slots.map((t) => {
          const a = ativos.get(t);
          return (
            <li
              key={t}
              data-slot={t}
              className="grid min-h-[60px] grid-cols-[36px_minmax(0,1fr)_auto_44px] items-center gap-2.5 rounded-[14px] border border-gray-200 bg-white py-1.5 pr-1 pl-2.5 dark:border-gray-800 dark:bg-white/[0.03]"
            >
              <Logo ticker={t} tamanho={36} />
              <span className="min-w-0">
                <LinkTicker ticker={t} />
                <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                  {a?.nome ?? ' '}
                </span>
              </span>
              <span className="text-right text-sm font-semibold text-gray-800 tabular-nums dark:text-white/90">
                {a ? formatarEstado(a.preco, 'moeda') : ''}
              </span>
              <BotaoRemover ticker={t} onRemover={onRemover} />
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="@container">
      <ul aria-label={TS.rotulo} className="grid grid-cols-2 gap-3 @[1100px]:grid-cols-4">
        {slots.map((t) => {
          const a = ativos.get(t);
          if (!a) {
            return (
              <li key={t} data-slot={t} aria-busy="true">
                <Esqueleto altura="h-[118px]" />
              </li>
            );
          }
          return (
            <li
              key={t}
              data-slot={t}
              className="flex min-w-0 flex-col gap-2 rounded-[14px] border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-white/[0.03]"
            >
              <div className="grid grid-cols-[40px_minmax(0,1fr)_44px] items-center gap-2.5">
                <Logo ticker={t} tamanho={40} />
                <span className="min-w-0">
                  <LinkTicker ticker={t} />
                  <span className="block truncate text-[12.5px] text-gray-500 dark:text-gray-400">
                    {a.nome}
                  </span>
                </span>
                <span className="-mt-1.5 -mr-1.5">
                  <BotaoRemover ticker={t} onRemover={onRemover} />
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-gray-700 tabular-nums dark:text-gray-300">
                <span>
                  {TS.cotacao}{' '}
                  <b className="text-[15px] text-gray-800 dark:text-white/90">
                    {formatarEstado(a.preco, 'moeda')}
                  </b>
                </span>
                {a.fiiTipo ? (
                  <span className="rounded-full border border-gray-200 px-2 text-[11.5px] leading-5 text-gray-600 dark:border-gray-700 dark:text-gray-300">
                    {TEXTOS_TELA.quadro.tipos[a.fiiTipo]}
                  </span>
                ) : null}
                {!a.noQuadro ? (
                  <SeloEstado
                    tipo="sem_negociacao_recente"
                    texto={TEXTOS_COMPARADOR.linhas.semNegociacao}
                  />
                ) : null}
              </div>
            </li>
          );
        })}
        {adicionar ? <li className="min-w-0">{adicionar}</li> : null}
      </ul>
    </div>
  );
}
