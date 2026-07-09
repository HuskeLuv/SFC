import type { CashflowGroup, CashflowValue } from '@/types/cashflow';

/**
 * Injeção do grupo "Aporte/Resgate Investimentos" na árvore do fluxo de caixa.
 *
 * Os itens do grupo de investimentos NÃO são CashflowItems persistidos: são
 * calculados das transações reais da carteira (`GET /api/cashflow/investimentos`)
 * e injetados aqui, client-side, na árvore vinda de `GET /api/cashflow`.
 * Módulo puro — extraído do queryFn de `useCashflowData` para ser testável e
 * permitir que os dois fetches rodem em paralelo.
 */

export interface InvestimentoCalculado {
  id: string;
  name?: string;
  descricao?: string;
  significado?: string | null;
  order?: string | null;
  rank?: string | null;
  valores?: CashflowValue[];
  values?: CashflowValue[];
}

const hasMovimento = (inv: InvestimentoCalculado): boolean =>
  (inv.values || inv.valores || []).some(
    (v: CashflowValue & { valor?: number }) => (v.value ?? v.valor ?? 0) !== 0,
  );

/** Categorias sem movimento no ano ficam ocultas (a planilha só mostra onde houve aporte/resgate). */
export function filterInvestimentosComMovimento(
  investimentos: InvestimentoCalculado[],
): InvestimentoCalculado[] {
  return (investimentos || []).filter(hasMovimento);
}

const toItems = (investimentos: InvestimentoCalculado[], groupId: string) =>
  investimentos.map((inv) => ({
    id: inv.id,
    userId: null,
    groupId,
    name: inv.descricao || inv.name || '',
    significado: inv.significado ?? null,
    // Sem rank nas linhas de Aporte/Resgate (como na planilha) — `order` é só
    // ordenação server-side e vazava aqui como se fosse rank.
    rank: null,
    values: inv.values || inv.valores || [],
  }));

/**
 * Substitui os itens do grupo `type='investimento'` pelos calculados da
 * carteira. Se a árvore não tiver o grupo, cria um sintético no final.
 * Também remove grupos "Investimentos" legados aninhados em despesas.
 */
export function injectInvestimentosIntoGroups(
  groups: CashflowGroup[],
  investimentos: InvestimentoCalculado[],
): CashflowGroup[] {
  let injected = false;

  const walk = (group: CashflowGroup): CashflowGroup => {
    if (group.type === 'investimento' && !injected) {
      injected = true;
      return {
        ...group,
        items: toItems(investimentos, group.id) as CashflowGroup['items'],
        children: group.children?.map(walk) || [],
      };
    }

    const children = group.children?.map(walk) || [];
    const filteredChildren =
      group.type === 'despesa'
        ? children.filter((child) => !(child.name === 'Investimentos' && child.type === 'despesa'))
        : children;

    return { ...group, children: filteredChildren };
  };

  const result = groups.map(walk);

  if (!injected && investimentos.length > 0) {
    result.push({
      id: 'investimentos-calculados',
      userId: null,
      name: 'Investimentos',
      type: 'investimento',
      orderIndex: 999,
      parentId: null,
      items: toItems(investimentos, 'investimentos-calculados') as CashflowGroup['items'],
      children: [],
    });
  }

  return result;
}
