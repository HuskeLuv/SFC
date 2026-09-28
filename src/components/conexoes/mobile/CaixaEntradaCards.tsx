'use client';

import React, { useState } from 'react';
import { formatBRL } from '@/utils/format';
import type { OpcaoLinha, PendenteDTO } from '@/hooks/useConexoesBancarias';
import LinhaFluxoPickerSheet from './LinhaFluxoPickerSheet';

/**
 * Caixa de entrada em cartões (celular, PWA fase 3). Só apresentação: o estado (escolhas,
 * marcadas) e os handlers ficam no CaixaEntrada, os mesmos da tabela do desktop.
 *
 * Cada transação: marcar (label de 44px), descrição, "conta · categoria" e data, valor (saída em
 * vermelho, entrada em azul — sem verde), a linha do fluxo (toque abre o LinhaFluxoPickerSheet) e
 * Lançar | Ignorar. Com marcadas, uma barra fixa acima da barra de abas.
 */

export interface CaixaEntradaCardsProps {
  pendentes: PendenteDTO[];
  linhas: OpcaoLinha[];
  escolhas: Record<string, string>;
  setEscolha(id: string, itemId: string): void;
  marcadas: Set<string>;
  onAlternar(id: string): void;
  ocupado: boolean;
  onLancar(ids: string[]): void;
  onIgnorar(ids: string[]): void;
  /** Ids com sugestão de linha ("Lançar sugeridas"). */
  sugeridas: string[];
  /** Ids de transferência/investimento ("Ignorar transferências"). */
  transferencias: string[];
  rotuloSugestao(p: PendenteDTO): string;
}

const BTN_PRIMARIO =
  'inline-flex min-h-11 items-center justify-center rounded-xl bg-mf-seguranca px-3 text-sm font-semibold text-white disabled:opacity-50 dark:bg-mf-patrimonio';
const BTN_SECUNDARIO =
  'inline-flex min-h-11 items-center justify-center rounded-xl border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-700 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300';

const dataCurta = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' });

export default function CaixaEntradaCards({
  pendentes,
  linhas,
  escolhas,
  setEscolha,
  marcadas,
  onAlternar,
  ocupado,
  onLancar,
  onIgnorar,
  sugeridas,
  transferencias,
  rotuloSugestao,
}: CaixaEntradaCardsProps) {
  const [pickerDe, setPickerDe] = useState<PendenteDTO | null>(null);
  const rotuloDe = (itemId: string | undefined) =>
    itemId ? linhas.find((l) => l.itemId === itemId)?.rotulo : undefined;

  return (
    <div data-mf-mobile="" className={marcadas.size > 0 ? 'pb-32' : undefined}>
      <div className="mb-3 grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
        <button
          type="button"
          className={BTN_PRIMARIO}
          onClick={() => onLancar(sugeridas)}
          disabled={ocupado || sugeridas.length === 0}
        >
          Lançar sugeridas ({sugeridas.length})
        </button>
        <button
          type="button"
          className={BTN_SECUNDARIO}
          onClick={() => onIgnorar(transferencias)}
          disabled={ocupado || transferencias.length === 0}
        >
          Ignorar transferências ({transferencias.length})
        </button>
      </div>

      <ul className="space-y-3" aria-label="Caixa de entrada">
        {pendentes.map((p) => {
          const saida = p.amount < 0; // negativo = saída (conta e cartão)
          const nome = p.merchantName ?? p.description;
          const escolhida = rotuloDe(escolhas[p.id]);
          return (
            <li
              key={p.id}
              data-mf-card=""
              className="rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-white/[0.03]"
            >
              <div className="flex items-start gap-1">
                <label
                  htmlFor={`caixa-m-${p.id}`}
                  className="-mt-2 -ml-2 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center"
                >
                  <input
                    id={`caixa-m-${p.id}`}
                    type="checkbox"
                    aria-label={`Marcar ${p.description}`}
                    checked={marcadas.has(p.id)}
                    onChange={() => onAlternar(p.id)}
                    className="h-5 w-5"
                  />
                </label>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800 [overflow-wrap:anywhere] dark:text-white/90">
                    {nome}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {dataCurta(p.date)} · {p.contaNome}
                    {p.providerCategory ? ` · ${p.providerCategory}` : ''}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-sm font-semibold tabular-nums ${
                    saida
                      ? 'text-[#D92D20] dark:text-[#F97066]'
                      : 'text-mf-patrimonio dark:text-mf-tranquilidade'
                  }`}
                >
                  {saida ? '−' : '+'}
                  {formatBRL(Math.abs(p.amount))}
                </span>
              </div>

              <button
                type="button"
                aria-haspopup="dialog"
                aria-label={`Linha para ${p.description}: ${escolhida ?? 'nenhuma escolhida'}`}
                onClick={() => setPickerDe(p)}
                className="mt-2 flex min-h-11 w-full flex-col items-start justify-center rounded-xl border border-gray-200 px-3 py-2 text-left dark:border-gray-700"
              >
                <span
                  className={`text-sm [overflow-wrap:anywhere] ${
                    escolhida
                      ? 'font-medium text-gray-800 dark:text-white/90'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {escolhida ?? '— escolher linha —'}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {rotuloSugestao(p)}
                </span>
              </button>

              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className={BTN_PRIMARIO}
                  onClick={() => onLancar([p.id])}
                  disabled={ocupado}
                >
                  Lançar
                </button>
                <button
                  type="button"
                  className={BTN_SECUNDARIO}
                  onClick={() => onIgnorar([p.id])}
                  disabled={ocupado}
                >
                  Ignorar
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {marcadas.size > 0 ? (
        <div
          role="region"
          aria-label="Transações marcadas"
          className="fixed inset-x-4 bottom-[calc(var(--mf-bottom-nav-h,0px)+0.5rem)] z-[9998] grid grid-cols-2 gap-2 rounded-2xl border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-800 dark:bg-gray-900"
        >
          <span className="col-span-2 px-2 pt-1 text-sm text-gray-600 dark:text-gray-300">
            {marcadas.size} marcada(s)
          </span>
          <button
            type="button"
            className={BTN_SECUNDARIO}
            onClick={() => onIgnorar([...marcadas])}
            disabled={ocupado}
          >
            Ignorar marcadas
          </button>
          <button
            type="button"
            className={BTN_PRIMARIO}
            onClick={() => onLancar([...marcadas])}
            disabled={ocupado}
          >
            Lançar marcadas
          </button>
        </div>
      ) : null}

      <LinhaFluxoPickerSheet
        isOpen={pickerDe !== null}
        onClose={() => setPickerDe(null)}
        opcoes={linhas}
        valor={pickerDe ? (escolhas[pickerDe.id] ?? '') : ''}
        onEscolher={(itemId) => {
          if (pickerDe) setEscolha(pickerDe.id, itemId);
        }}
        assunto={
          pickerDe
            ? `${pickerDe.merchantName ?? pickerDe.description} · ${pickerDe.amount < 0 ? '−' : '+'}${formatBRL(Math.abs(pickerDe.amount))}`
            : undefined
        }
      />
    </div>
  );
}
