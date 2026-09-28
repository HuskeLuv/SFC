import type { CSSProperties } from 'react';
import type { CashflowGroup, CashflowItem } from '@/types/cashflow';
import { CANONICAL_GROUPS, canonicalName } from '@/services/cashflow/groupMatchers';

/**
 * Regras de permissão das linhas do fluxo de caixa — ÚNICAS e alinhadas ao servidor
 * (batch-update, item/move): a visão do mês do celular decide por aqui o que cada sheet oferece.
 *
 * O desktop importa só os helpers visuais (isInvestment, groupDisplayName, DESPESAS_PERCENT_STYLE)
 * e mantém as próprias condições — em particular o "Excluir" de linha de dívida, que o desktop
 * ainda mostra e o servidor recusa (PR separado).
 */

export type ReadOnlyReason = 'investimento' | 'auto-realizado' | 'divida' | 'sonho';

export const READONLY_REASON_TEXT: Record<ReadOnlyReason, string> = {
  investimento: 'Calculado automaticamente da carteira',
  'auto-realizado': 'O realizado deste sonho vem dos ativos vinculados',
  divida: 'Gerida em Dívidas',
  sonho: 'Editável no Planejamento de Sonhos',
};

export interface ItemCapabilities {
  /** Valores do mês (e fórmula). */
  editValues: boolean;
  /** Nome, porquê e nível de prioridade. */
  editStructure: boolean;
  canDelete: boolean;
  /** Excluir linha de sonho também apaga o objetivo (confirmação obrigatória). */
  deleteNeedsObjetivoConfirm: boolean;
  /** Mover para outra seção. */
  canMove: boolean;
  canComment: boolean;
  /** Situação (cor) da célula. */
  canColor: boolean;
  /** Por que algo está travado (texto em READONLY_REASON_TEXT). */
  readOnlyReason?: ReadOnlyReason;
}

export interface GroupCapabilities {
  /** "+ Linha": grupo-folha que não é o Aporte/Resgate calculado. */
  addRow: boolean;
  /** Destino de "Mover" (entrada/despesa folha; nunca Investimentos nem Conta Corrente). */
  acceptsMovedRow: boolean;
}

/** Aporte/Resgate: linhas calculadas da carteira (grupo `investimento` ou id sintético). */
export function isInvestment(group: Pick<CashflowGroup, 'type'>, item?: Pick<CashflowItem, 'id'>) {
  return group.type === 'investimento' || !!item?.id.startsWith('investimento-');
}

export function getItemCapabilities(
  item: Pick<CashflowItem, 'id' | 'objetivoId' | 'dividaId' | 'objetivoAutoRealizado'>,
  group: Pick<CashflowGroup, 'type'>,
): ItemCapabilities {
  const inv = isInvestment(group, item);
  const autoRealizado = !!item.objetivoAutoRealizado;
  const sonho = !!item.objetivoId;
  const divida = !!item.dividaId;
  const editValues = !inv && !autoRealizado;

  const readOnlyReason: ReadOnlyReason | undefined = inv
    ? 'investimento'
    : autoRealizado
      ? 'auto-realizado'
      : divida
        ? 'divida'
        : sonho
          ? 'sonho'
          : undefined;

  return {
    editValues,
    editStructure: !inv && !sonho && !divida,
    canDelete: !inv && !divida,
    deleteNeedsObjetivoConfirm: sonho,
    canMove: group.type !== 'investimento' && group.type !== 'saldo' && !sonho && !divida,
    canComment: !inv,
    canColor: editValues,
    ...(readOnlyReason ? { readOnlyReason } : {}),
  };
}

export function getGroupCapabilities(
  group: Pick<CashflowGroup, 'type' | 'children'>,
): GroupCapabilities {
  const leaf = !group.children?.length;
  return {
    addRow: leaf && group.type !== 'investimento',
    acceptsMovedRow: leaf && (group.type === 'entrada' || group.type === 'despesa'),
  };
}

/** Nome exibido do grupo (Aporte/Resgate, Total de Entradas, Despesas Fixas e Variáveis). */
export function groupDisplayName(group: CashflowGroup): string {
  if (group.type === 'investimento') return 'Aporte/Resgate';
  const canonical = canonicalName(group);
  if (canonical === CANONICAL_GROUPS.ENTRADAS && !group.parentId) return 'Total de Entradas';
  if (canonical === CANONICAL_GROUPS.DESPESAS && !group.parentId) {
    return 'Despesas Fixas e Variáveis';
  }
  return group.name;
}

/**
 * Formatação condicional do % Receita da linha "Despesas Fixas e Variáveis" — faixas do ticket QA
 * 19/08/2026: ≤80% azul · (80,90]% amarelo · (90,100]% vermelho claro · >100% vermelho forte.
 * Ajuste QA 21/08: a CÉLULA inteira ganha o fundo da faixa (como na planilha). Semântico — fica
 * fora da paleta.
 */
export const DESPESAS_PERCENT_STYLE = (pct: number): CSSProperties => {
  if (pct <= 80) return { backgroundColor: '#2E7DFF', color: '#FFFFFF' };
  if (pct <= 90) return { backgroundColor: '#FFD54D', color: '#000000' };
  if (pct <= 100) return { backgroundColor: '#FF9B9B', color: '#000000' };
  return { backgroundColor: '#FF0000', color: '#FFFFFF' };
};
