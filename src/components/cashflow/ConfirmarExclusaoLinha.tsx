'use client';

import React, { useId } from 'react';
import { createPortal } from 'react-dom';
import { Modal } from '@/components/ui/modal';
import { TextoSensivel } from '@/components/common/valores/Sensivel';
import { formatBRL } from '@/utils/format';
import type { DestinoExclusaoLinha } from '@/hooks/useGroupEditMode';

/**
 * Excluir linha com valores numa categoria com "Geral" (Orçamento v2, ticket 86e3vxd5r): a
 * pessoa escolhe se os valores vão para a Geral (a fusão de sempre) ou se são apagados. O que
 * veio do banco (Open Finance) vai para a Geral nos dois casos, junto com as transações.
 */

export interface ResumoValoresLinha {
  /** Total do ano na tela. */
  total: number;
  /** Parte lançada pelo banco no ano. */
  banco: number;
  /** Meses com valor no ano. */
  meses: number;
  ano: number;
}

/** Frase do impacto, igual no desktop e no celular. */
export function textoImpactoExclusao({ total, banco, meses, ano }: ResumoValoresLinha): string {
  const base = `Esta linha tem ${formatBRL(total)} em ${ano} (${meses} ${meses === 1 ? 'mês' : 'meses'}).`;
  const doBanco =
    banco > 0
      ? ` ${formatBRL(banco)} vieram do banco (Open Finance) e vão para Geral nos dois casos.`
      : '';
  return `${base}${doBanco}`;
}

export const TEXTO_OUTROS_ANOS =
  'A escolha vale também para os outros anos. Dá para voltar atrás em Desfazer, no Histórico de alterações.';

export const BTN_MOVER_GERAL =
  'rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-white/[0.03] dark:text-gray-200 dark:hover:bg-white/5';
/** Ação destrutiva no vermelho semântico aprovado (#D92D20 / #F97066 no escuro). */
export const BTN_APAGAR =
  'rounded-lg bg-[#D92D20] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#F97066] dark:text-gray-900';

export function ConfirmarExclusaoLinha({
  nome,
  resumo,
  onEscolher,
  onCancelar,
}: {
  nome: string;
  resumo: ResumoValoresLinha;
  onEscolher: (destino: DestinoExclusaoLinha) => void;
  onCancelar: () => void;
}) {
  const tituloId = useId();
  // Portal: a linha da Planilha fica dentro de células fixas (sticky) da tabela; o modal não pode
  // herdar o contexto delas.
  if (typeof document === 'undefined') return null;
  return createPortal(
    <Modal
      isOpen
      onClose={onCancelar}
      showCloseButton={false}
      ariaLabelledby={tituloId}
      className="max-w-md p-6"
    >
      <div data-mf-confirmar-exclusao-linha="">
        <h3 id={tituloId} className="text-base font-semibold text-gray-900 dark:text-white/90">
          Excluir “{nome}”?
        </h3>
        <div className="mt-3 space-y-2 text-sm text-gray-600 dark:text-gray-300">
          <p>
            <TextoSensivel texto={textoImpactoExclusao(resumo)} />
          </p>
          <p>
            <b className="text-gray-800 dark:text-white/90">Mover para Geral</b> soma os valores na
            linha Geral da categoria. <b className="text-gray-800 dark:text-white/90">Apagar</b>{' '}
            tira os valores do Fluxo e do Orçamento (use se você já lançou esses valores em outra
            linha).
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{TEXTO_OUTROS_ANOS}</p>
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button type="button" className={BTN_MOVER_GERAL} onClick={onCancelar}>
            Cancelar
          </button>
          <button type="button" className={BTN_MOVER_GERAL} onClick={() => onEscolher('geral')}>
            Mover para Geral
          </button>
          <button type="button" className={BTN_APAGAR} onClick={() => onEscolher('apagar')}>
            Apagar os valores
          </button>
        </div>
      </div>
    </Modal>,
    document.body,
  );
}

/** Resumo do ano a partir das células da linha. */
export function resumirValoresLinha(
  values: { month: number; value: number; valorBanco?: number; year?: number }[] | undefined,
  ano: number,
): ResumoValoresLinha {
  let total = 0;
  let banco = 0;
  let meses = 0;
  for (const v of values ?? []) {
    if (v.year != null && v.year !== ano) continue;
    if (v.month < 0 || v.month > 11) continue;
    total += v.value;
    banco += v.valorBanco ?? 0;
    if (v.value !== 0) meses++;
  }
  return { total: Math.round(total * 100) / 100, banco: Math.round(banco * 100) / 100, meses, ano };
}
