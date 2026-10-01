'use client';

import React from 'react';
import Link from 'next/link';
import { twMerge } from 'tailwind-merge';
import type { MoverOpcoesResponse } from '@/lib/carteiraMover';
import { CARTEIRA_ABA_PARAM } from '@/components/carteira/carteiraTabsConfig';
import { TABLE_MOBILE_STYLES } from '@/components/ui/table/tableStyles';
import { MovidoBadge, textoMovido } from './MovidoBadge';
import { rotuloAtual } from './DestinoAbaList';

/**
 * Classificação do ativo na página /ativos/[id] (A1-A6): "Na Carteira: FII's › FOF", clicável
 * para a aba; se o ativo mudou de aba, "movido por você em 01/10/2026 · Voltar para …"; se a aba
 * não é movível, só a frase (sem botão — decisão 7).
 */

export const hrefDaAba = (abaId: string) => `/carteira?${CARTEIRA_ABA_PARAM}=${abaId}`;

const CHIP =
  'inline-flex items-center gap-1.5 rounded-full bg-mf-tranquilidade/[0.18] px-2.5 py-0.5 font-medium text-mf-seguranca no-underline outline-none hover:bg-mf-tranquilidade/30 focus-visible:ring-[3px] focus-visible:ring-mf-outside dark:bg-mf-tranquilidade/[0.14] dark:text-mf-escolha dark:focus-visible:ring-mf-tranquilidade';

const LINK_BOTAO =
  'rounded font-semibold text-mf-patrimonio underline underline-offset-[3px] outline-none focus-visible:ring-[3px] focus-visible:ring-mf-outside disabled:opacity-60 dark:text-mf-tranquilidade dark:focus-visible:ring-mf-tranquilidade';

const rotuloOriginal = (original: NonNullable<MoverOpcoesResponse['original']>) => original.label;

interface NaCarteiraProps {
  opcoes: MoverOpcoesResponse;
  onRestaurar: () => void;
  restaurando?: boolean;
  className?: string;
}

/** Computador: linha abaixo do título. */
export function NaCarteiraLinha({ opcoes, onRestaurar, restaurando, className }: NaCarteiraProps) {
  const { movido, original } = opcoes;
  return (
    <div
      data-mf-na-carteira=""
      className={twMerge(
        'mt-2.5 flex flex-wrap items-center gap-2 text-[13.5px] text-gray-500 dark:text-gray-400',
        className,
      )}
    >
      <span>Na Carteira:</span>
      <Link href={hrefDaAba(opcoes.atual.abaId)} className={CHIP}>
        {rotuloAtual(opcoes)}
      </Link>
      {!opcoes.movivel && opcoes.motivo && <span>· {opcoes.motivo}.</span>}
      {opcoes.movivel && movido && (
        <>
          <span>· {textoMovido({ movidoEm: movido.em, viaConsultor: movido.viaConsultant })}</span>
          {original && (
            <>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={onRestaurar}
                disabled={restaurando}
                className={LINK_BOTAO}
              >
                {restaurando ? 'Voltando…' : `Voltar para ${rotuloOriginal(original)}`}
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}

/** Celular: linha própria depois do cartão de posição, com o botão Mover (44px). */
export function NaCarteiraCartao({
  opcoes,
  onRestaurar,
  restaurando,
  onMover,
  className,
}: NaCarteiraProps & { onMover: () => void }) {
  const { movido, original } = opcoes;
  return (
    <section
      aria-label="Na Carteira"
      data-mf-na-carteira=""
      className={twMerge(TABLE_MOBILE_STYLES.card, 'flex flex-col gap-2', className)}
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-gray-500 dark:text-gray-400">Na Carteira</p>
          <p className="flex flex-wrap items-center gap-1.5 text-[15px] font-medium text-gray-800 dark:text-white/90">
            <Link
              href={hrefDaAba(opcoes.atual.abaId)}
              className="underline-offset-[3px] outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-mf-outside dark:focus-visible:ring-mf-tranquilidade"
            >
              {rotuloAtual(opcoes)}
            </Link>
            {opcoes.movivel && movido && (
              <MovidoBadge movidoEm={movido.em} viaConsultor={movido.viaConsultant} />
            )}
          </p>
        </div>
        {opcoes.movivel && (
          <button
            type="button"
            onClick={onMover}
            data-mf-mover-ativo=""
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-gray-300 px-4 text-[15px] font-medium text-gray-700 outline-none focus-visible:ring-[3px] focus-visible:ring-mf-outside active:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:focus-visible:ring-mf-tranquilidade dark:active:bg-white/5"
          >
            Mover
          </button>
        )}
      </div>
      {!opcoes.movivel && opcoes.motivo && (
        <p className="text-[13px] text-gray-500 dark:text-gray-400">{opcoes.motivo}.</p>
      )}
      {opcoes.movivel && movido && original && (
        <button
          type="button"
          onClick={onRestaurar}
          disabled={restaurando}
          className={twMerge(LINK_BOTAO, 'min-h-11 self-start text-left text-[14px]')}
        >
          {restaurando ? 'Voltando…' : `Voltar para ${rotuloOriginal(original)}`}
        </button>
      )}
    </section>
  );
}
