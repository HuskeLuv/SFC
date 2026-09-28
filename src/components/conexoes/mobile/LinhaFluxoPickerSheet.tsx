'use client';

import React, { useMemo, useState, type ReactNode } from 'react';
import BottomSheet from '@/components/ui/sheet/BottomSheet';
import type { OpcaoLinha } from '@/hooks/useConexoesBancarias';

/**
 * Escolha da linha do fluxo de caixa de uma transação da Caixa de entrada no celular (PWA fase 3).
 * As MESMAS opções do <select> do desktop (`useLinhasFluxo`), agrupadas pelo 1º nível do rótulo
 * ("Despesas Fixas › Habitação › Luz" → grupo "Despesas Fixas") e filtradas por texto sem acento.
 */

/** Minúsculas e sem acento: "Habitação" casa com "habitacao". */
export function normalizarBusca(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

const SEPARADOR = ' › ';

interface Grupo {
  nome: string;
  opcoes: { itemId: string; rotulo: string; resto: string }[];
}

/** Agrupa preservando a ordem da 1ª aparição (a ordem da estrutura do fluxo). */
export function agruparLinhas(opcoes: OpcaoLinha[], busca: string): Grupo[] {
  const termo = normalizarBusca(busca);
  const grupos = new Map<string, Grupo>();
  for (const o of opcoes) {
    if (termo && !normalizarBusca(o.rotulo).includes(termo)) continue;
    const partes = o.rotulo.split(SEPARADOR);
    const nome = partes.length > 1 ? partes[0] : '';
    const resto = partes.length > 1 ? partes.slice(1).join(SEPARADOR) : o.rotulo;
    let g = grupos.get(nome);
    if (!g) {
      g = { nome, opcoes: [] };
      grupos.set(nome, g);
    }
    g.opcoes.push({ itemId: o.itemId, rotulo: o.rotulo, resto });
  }
  return [...grupos.values()];
}

export interface LinhaFluxoPickerSheetProps {
  isOpen: boolean;
  onClose(): void;
  opcoes: OpcaoLinha[];
  /** itemId escolhido hoje ('' = nenhum). */
  valor: string;
  /** Tocar numa linha escolhe e fecha. */
  onEscolher(itemId: string): void;
  /** Sobre qual transação (descrição · valor), sob o título. */
  assunto?: ReactNode;
}

export default function LinhaFluxoPickerSheet({
  isOpen,
  onClose,
  opcoes,
  valor,
  onEscolher,
  assunto,
}: LinhaFluxoPickerSheetProps) {
  const [busca, setBusca] = useState('');
  const grupos = useMemo(() => agruparLinhas(opcoes, busca), [opcoes, busca]);

  const fechar = () => {
    setBusca('');
    onClose();
  };
  const escolher = (itemId: string) => {
    onEscolher(itemId);
    fechar();
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={fechar} title="Linha do fluxo de caixa">
      <div className="space-y-3 pb-2">
        {assunto ? (
          <p className="truncate text-sm text-gray-500 dark:text-gray-400">{assunto}</p>
        ) : null}
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar linha"
          aria-label="Buscar linha"
          autoComplete="off"
          enterKeyHint="search"
          className="min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-base text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        />
        {grupos.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
            Nenhuma linha encontrada.
          </p>
        ) : (
          <div className="space-y-3">
            {grupos.map((g) => (
              <section key={g.nome || '_'} aria-label={g.nome || undefined}>
                {g.nome ? (
                  <h3 className="px-1 pb-1 text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
                    {g.nome}
                  </h3>
                ) : null}
                <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                  {g.opcoes.map((o) => {
                    const atual = o.itemId === valor;
                    return (
                      <li key={o.itemId}>
                        <button
                          type="button"
                          aria-pressed={atual}
                          aria-label={o.rotulo}
                          onClick={() => escolher(o.itemId)}
                          className={`flex min-h-11 w-full items-center gap-2 px-1 py-2 text-left text-sm active:bg-gray-100 dark:active:bg-white/5 ${
                            atual
                              ? 'font-semibold text-mf-patrimonio dark:text-mf-tranquilidade'
                              : 'text-gray-800 dark:text-white/90'
                          }`}
                        >
                          <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{o.resto}</span>
                          {atual ? (
                            <svg
                              width="18"
                              height="18"
                              viewBox="0 0 24 24"
                              fill="none"
                              aria-hidden="true"
                            >
                              <path
                                d="M5 12.5l4.5 4.5L19 7.5"
                                stroke="currentColor"
                                strokeWidth="2.2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
