'use client';

import React from 'react';
import { twMerge } from 'tailwind-merge';
import { formatBRL } from '@/utils/format';
import { DestinoSemEscolha, OrigemDestino, SelosDestino } from './DestinosTabela';
import {
  ehRevisavel,
  itemMudou,
  rotuloItem,
  rotuloVigente,
  type EstadoDestinos,
  type FaixaDestinos,
  type ItemRevisavel,
} from './destinosEstado';

/**
 * Revisão no celular (protótipo M2): uma faixa por aba sugerida (com "Trocar todos" quando há 2+
 * itens com escolha) e um cartão de raio 16 por investimento, com "Entra em" / "Você escolheu" e
 * o botão "Trocar" de 44px, que abre o DestinoImportadoSheet. Itens sem escolha: só a frase.
 */
export default function DestinosCartoesMobile({
  faixas,
  estado,
  salvando,
  onTrocar,
  onTrocarTodos,
}: {
  faixas: FaixaDestinos[];
  estado: EstadoDestinos;
  salvando: boolean;
  onTrocar: (item: ItemRevisavel) => void;
  onTrocarTodos: (faixa: FaixaDestinos) => void;
}) {
  return (
    <div className="flex flex-col gap-2" data-mf-destinos-cartoes="">
      {faixas.map((faixa) => {
        const editaveis = faixa.revisaveis.filter((id) => !estado.salvos.has(id));
        return (
          <section key={faixa.grupo} aria-label={faixa.rotulo} className="flex flex-col gap-2">
            <div className="mt-2 flex min-h-11 items-center gap-2 rounded-lg bg-mf-patrimonio py-1 pr-1 pl-3 text-sm font-semibold text-white">
              <span className="min-w-0 flex-1">
                {faixa.rotulo}{' '}
                <span className="font-normal opacity-90">({faixa.itens.length})</span>
              </span>
              {editaveis.length >= 2 && (
                <button
                  type="button"
                  disabled={salvando}
                  onClick={() => onTrocarTodos(faixa)}
                  aria-label={`Trocar todos de ${faixa.rotulo}`}
                  className="min-h-11 shrink-0 rounded-lg px-3 text-sm font-semibold text-white underline underline-offset-[3px] outline-none focus-visible:ring-[3px] focus-visible:ring-mf-escolha disabled:opacity-60"
                >
                  Trocar todos
                </button>
              )}
            </div>
            <ul className="flex flex-col gap-2">
              {faixa.itens.map((item) => {
                const id = item.bankInvestmentId;
                const revisavel = ehRevisavel(item);
                const editavel = revisavel && !estado.salvos.has(id);
                const mudou = itemMudou(item, estado);
                const falhou = !!estado.falhas[id];
                const rotulo = rotuloItem(item);
                return (
                  <li
                    key={id}
                    data-mf-destino-cartao={id}
                    className={twMerge(
                      'rounded-2xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-white/[0.03]',
                      mudou && 'shadow-[inset_3px_0_0_#0079F2]',
                      falhou && 'shadow-[inset_3px_0_0_#D92D20]',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-gray-800 dark:text-white/90">
                          <span className="break-words">{rotulo}</span>
                          <SelosDestino item={item} estado={estado} />
                        </div>
                        <div className="text-xs break-words text-gray-600 dark:text-gray-300">
                          {item.ticker ? item.nome : item.banco}
                        </div>
                      </div>
                      <div className="shrink-0 text-right text-sm font-semibold tabular-nums text-gray-800 dark:text-white/90">
                        {formatBRL(item.saldo)}
                      </div>
                    </div>
                    <div className="mt-2.5 flex items-end gap-2 border-t border-gray-100 pt-2.5 dark:border-gray-800">
                      {revisavel ? (
                        <>
                          <div className="min-w-0 flex-1">
                            <div className="text-[11px] font-medium tracking-wide text-gray-600 uppercase dark:text-gray-300">
                              {mudou ? 'Você escolheu' : 'Entra em'}
                            </div>
                            <div className="text-sm font-semibold break-words text-gray-800 dark:text-white/90">
                              {rotuloVigente(item, estado)}
                            </div>
                            <OrigemDestino item={item} estado={estado} />
                          </div>
                          {editavel && (
                            <button
                              type="button"
                              disabled={salvando}
                              onClick={() => onTrocar(item)}
                              aria-label={`Trocar destino de ${rotulo}`}
                              className="min-h-11 shrink-0 rounded-xl border border-gray-300 px-4 text-sm font-semibold text-mf-patrimonio outline-none focus-visible:ring-[3px] focus-visible:ring-mf-outside disabled:opacity-60 dark:border-gray-600 dark:text-mf-tranquilidade dark:focus-visible:ring-mf-tranquilidade"
                            >
                              Trocar
                            </button>
                          )}
                        </>
                      ) : (
                        <DestinoSemEscolha item={item} />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
