import type { CashflowGroup } from '@/types/cashflow';

/**
 * Identificação canônica de grupos estruturais do fluxo de caixa.
 *
 * Grupos como 'Despesas Fixas' são identificados pelo NOME DO TEMPLATE
 * (`templateName`, estampado pelo merge server-side), não pelo nome exibido —
 * assim renomear um grupo via override não quebra agregações/render. Árvores
 * sem templateName (custom puro, fixtures de teste) caem no nome exibido.
 */

export const CANONICAL_GROUPS = {
  ENTRADAS: 'Entradas',
  ENTRADAS_FIXAS: 'Entradas Fixas',
  ENTRADAS_VARIAVEIS: 'Entradas Variáveis',
  DESPESAS: 'Despesas',
  DESPESAS_FIXAS: 'Despesas Fixas',
  DESPESAS_VARIAVEIS: 'Despesas Variáveis',
  INVESTIMENTOS: 'Investimentos',
  CONTA_CORRENTE: 'Conta Corrente',
} as const;

export type CanonicalGroupName = (typeof CANONICAL_GROUPS)[keyof typeof CANONICAL_GROUPS];

/** Nome canônico do grupo: template de origem, com fallback no nome exibido. */
export const canonicalName = (group: CashflowGroup): string => group.templateName ?? group.name;

export const isCanonical = (group: CashflowGroup, name: CanonicalGroupName): boolean =>
  canonicalName(group) === name;

/** Busca em profundidade por nome canônico. */
export function findGroupByCanonicalName(
  groups: CashflowGroup[],
  name: CanonicalGroupName,
): CashflowGroup | null {
  for (const group of groups) {
    if (isCanonical(group, name)) return group;
    if (group.children?.length) {
      const found = findGroupByCanonicalName(group.children, name);
      if (found) return found;
    }
  }
  return null;
}
