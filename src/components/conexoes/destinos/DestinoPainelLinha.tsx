'use client';

import React from 'react';
import {
  DestinoAbaList,
  avisosDoDestino,
  type EscolhaDestino as EscolhaDoMover,
} from '@/components/carteira/mover/DestinoAbaList';
import { EfeitosMoverList, useEfeitosMover } from '@/components/carteira/mover/EfeitosMoverList';
import { isCategoriaCaixaRf, type CategoriaMovivel } from '@/lib/carteiraMover';
import { rotuloItem, type EscolhaItem, type ItemRevisavel } from './destinosEstado';

/** Escolha da revisão → forma do DestinoAbaList (seção '' nas abas sem seção). */
export const paraEscolhaDoMover = (escolha: EscolhaItem | null): EscolhaDoMover | null =>
  escolha ? { categoria: escolha.categoria, subgrupo: escolha.subgrupo ?? '' } : null;

/** Texto fixo do que NÃO muda (bolsa e fundos; no trio RF/Reservas vale a lista "O que muda"). */
export const TEXTO_NAO_MUDA =
  'Saldo e rentabilidade não mudam. Só o lugar onde ele aparece na Carteira.';

/**
 * Hook do painel: efeitos (trio RF/Reservas, com a prévia da Saúde sob demanda pela cache de
 * /api/saude-financeira) e avisos do destino — tudo lido das opções do servidor.
 */
export function useImpactoDestino(item: ItemRevisavel | null, escolha: EscolhaItem | null) {
  const destino: CategoriaMovivel | null = escolha?.categoria ?? null;
  const efeitos = useEfeitosMover(item?.opcoes, destino);
  const avisos = item ? avisosDoDestino(item.opcoes, paraEscolhaDoMover(escolha)) : [];
  const caixaRf = !!item && isCategoriaCaixaRf(item.opcoes.atual.categoria);
  return { efeitos, avisos, caixaRf };
}

/**
 * Painel na linha da tabela (computador, protótipo D3/D4): a lista de destinos do mover
 * (DestinoAbaList, variante 'dialog') com as abas bloqueadas recolhidas e o motivo do
 * servidor, os efeitos/avisos e "Voltar à sugestão" / "Pronto". O Esc (que fecha o painel e
 * devolve o foco ao botão do destino) é tratado pela revisão.
 *
 * O wrapper só mexe em LAYOUT do DestinoAbaList (grade de 250px+ e summary dos bloqueados com
 * 44px); nenhuma regra é sobrescrita.
 */
export default function DestinoPainelLinha({
  id,
  item,
  escolha,
  mudou,
  disabled,
  onEscolher,
  onVoltarASugestao,
  onPronto,
}: {
  id: string;
  item: ItemRevisavel;
  /** Escolha do usuário (null = a sugestão). */
  escolha: EscolhaItem | null;
  mudou: boolean;
  disabled?: boolean;
  onEscolher: (categoria: CategoriaMovivel, subgrupo: string | null) => void;
  onVoltarASugestao: () => void;
  onPronto: () => void;
}) {
  const rotulo = rotuloItem(item);
  const { efeitos, avisos, caixaRf } = useImpactoDestino(item, escolha);
  const tituloId = `${id}-titulo`;

  return (
    <div
      id={id}
      role="group"
      aria-labelledby={tituloId}
      data-mf-destino-painel=""
      className="flex flex-col gap-3 px-4 py-4 sm:px-6"
    >
      <h4 id={tituloId} className="text-sm font-semibold text-gray-800 dark:text-white/90">
        Onde {rotulo} vai entrar na Carteira
      </h4>
      <div className="[&>div]:grid [&>div]:grid-cols-[repeat(auto-fill,minmax(250px,1fr))] [&>div]:items-start [&>div>details]:col-span-full [&>div>fieldset[data-mf-destino-grupo]]:col-span-full [&_summary]:min-h-11">
        <DestinoAbaList
          variante="dialog"
          opcoes={item.opcoes}
          escolha={paraEscolhaDoMover(escolha)}
          onEscolher={(e) => onEscolher(e.categoria, e.subgrupo || null)}
          disabled={disabled}
        />
      </div>
      <div
        aria-live="polite"
        className="flex flex-col gap-1.5 rounded-[10px] bg-white px-3 py-2.5 text-[13px] text-gray-700 dark:bg-white/[0.04] dark:text-gray-200"
      >
        {caixaRf && efeitos.length > 0 ? (
          <EfeitosMoverList efeitos={efeitos} />
        ) : (
          <p>{TEXTO_NAO_MUDA}</p>
        )}
        {avisos.map((aviso) => (
          <p key={aviso} className="text-gray-800 dark:text-white/90">
            {aviso}
          </p>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {mudou && (
          <button
            type="button"
            onClick={onVoltarASugestao}
            disabled={disabled}
            className="min-h-11 rounded-lg px-3 text-sm font-semibold text-mf-patrimonio underline underline-offset-[3px] outline-none focus-visible:ring-[3px] focus-visible:ring-mf-outside disabled:opacity-60 dark:text-mf-tranquilidade dark:focus-visible:ring-mf-tranquilidade"
          >
            Voltar à sugestão
          </button>
        )}
        <button
          type="button"
          onClick={onPronto}
          className="min-h-11 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-800 outline-none hover:bg-gray-50 focus-visible:ring-[3px] focus-visible:ring-mf-outside dark:border-gray-600 dark:bg-transparent dark:text-white/90 dark:hover:bg-white/[0.04] dark:focus-visible:ring-mf-tranquilidade"
        >
          Pronto
        </button>
      </div>
    </div>
  );
}
