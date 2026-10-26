/**
 * O Anexo B (`orcamentoAnexoB.ts`) como árvore MESCLADA do Fluxo, no formato que
 * `getMergedCashflowGroups` devolve: Entradas (receita 24.000 em out/2026) › Despesas › Despesas
 * Fixas (12 categorias) + Despesas Variáveis, mais Investimentos (com aportes, D12) e Conta
 * Corrente. Cada subcategoria vira um item com `orcamentoFixa` = coluna "Flag" e realizado de
 * outubro pintado de Pago (consolidado) — Lançado e Consolidado coincidem, salvo ajuste no teste.
 *
 * Dados 100% sintéticos (os do protótipo da spec).
 */
import type { CashflowGroup, CashflowItem, CashflowValue } from '@/types/cashflow';
import { ANEXO_B, ANEXO_B_HOJE, ANEXO_B_RECEITA } from './orcamentoAnexoB';

export const ANEXO_B_ANO = ANEXO_B_HOJE.ano;
export const ANEXO_B_MES0 = ANEXO_B_HOJE.mes0;
export const USER_ID = 'u-anexo-b';
export const PAGO = '#FF0000';

export function valor(
  itemId: string,
  month: number,
  value: number,
  color: string | null = PAGO,
): CashflowValue {
  return {
    id: `v-${itemId}-${month}`,
    itemId,
    userId: USER_ID,
    year: ANEXO_B_ANO,
    month,
    value,
    color,
  };
}

export function item(
  id: string,
  groupId: string,
  name: string,
  extra: Partial<CashflowItem> = {},
): CashflowItem {
  return {
    id,
    userId: USER_ID,
    groupId,
    name,
    significado: null,
    rank: null,
    values: [],
    templateId: null,
    isGeral: false,
    orcamentoFixa: null,
    ...extra,
  };
}

export function grupo(
  id: string,
  name: string,
  type: string,
  extra: Partial<CashflowGroup> = {},
): CashflowGroup {
  return {
    id,
    userId: USER_ID,
    name,
    type,
    parentId: null,
    orderIndex: 0,
    items: [],
    children: [],
    templateId: `tpl-${id}`,
    templateName: name,
    isTemplate: false,
    icone: null,
    ...extra,
  };
}

/** Id do item da subcategoria `j` da categoria `i` (ordem do Anexo B). */
export const idSub = (i: number, j: number): string => `it-${i}-${j}`;
export const idCat = (i: number): string => `cat-${i}`;

/** Categoria do Anexo B pelo nome (ex.: 'Habitação'). */
export const indiceCategoria = (nome: string): number => ANEXO_B.findIndex((c) => c.nome === nome);

/** Árvore mesclada do Anexo B. `receitaPorMes` (0–11) sobrescreve a entrada de cada mês. */
export function arvoreAnexoB(
  receitaPorMes: Partial<Record<number, number>> = { [ANEXO_B_MES0]: ANEXO_B_RECEITA },
): CashflowGroup[] {
  const categorias = ANEXO_B.map((c, i) =>
    grupo(idCat(i), c.nome, 'despesa', {
      orderIndex: i,
      items: c.subcategorias.map((s, j) =>
        item(idSub(i, j), idCat(i), s.nome, {
          orderIndex: j,
          isGeral: s.geral,
          orcamentoFixa: s.fixa,
          values: s.realizado > 0 ? [valor(idSub(i, j), ANEXO_B_MES0, s.realizado)] : [],
        }),
      ),
    }),
  );
  const variaveis = categorias.pop()!;

  const salario = item('it-salario', 'g-entradas-fixas', 'Salário', {
    values: Object.entries(receitaPorMes).map(([m, v]) => valor('it-salario', Number(m), v ?? 0)),
  });

  return [
    grupo('g-entradas', 'Entradas', 'entrada', {
      orderIndex: 1,
      children: [grupo('g-entradas-fixas', 'Entradas Fixas', 'entrada', { items: [salario] })],
    }),
    grupo('g-despesas', 'Despesas', 'despesa', {
      orderIndex: 2,
      children: [
        grupo('g-despesas-fixas', 'Despesas Fixas', 'despesa', { children: categorias }),
        variaveis,
      ],
    }),
    grupo('g-investimentos', 'Investimentos', 'investimento', {
      orderIndex: 3,
      items: [
        item('it-aporte', 'g-investimentos', 'Aporte/Resgate', {
          values: [valor('it-aporte', ANEXO_B_MES0, 15_000)],
        }),
        item('it-carteira', 'g-investimentos', 'Carteira', {
          values: [valor('it-carteira', ANEXO_B_MES0, 760_000)],
        }),
      ],
    }),
    grupo('g-conta', 'Conta Corrente', 'saldo', {
      orderIndex: 4,
      items: [
        item('it-saldo', 'g-conta', 'Saldo', { values: [valor('it-saldo', ANEXO_B_MES0, 9_999)] }),
      ],
    }),
  ];
}

/** Orçados de outubro do Anexo B (linhas de `cashflow_orcamento_itens`, mês 0–11). */
export function orcadosAnexoB(mes0: number = ANEXO_B_MES0, ano: number = ANEXO_B_ANO) {
  return ANEXO_B.flatMap((c, i) =>
    c.subcategorias.flatMap((s, j) =>
      (s.valor ?? 0) > 0
        ? [{ itemId: idSub(i, j), ano, mes: mes0, valor: s.valor, pct: null }]
        : [],
    ),
  );
}

/** Acha um item da árvore pelo id (para ajustes pontuais nos testes). */
export function acharItem(arvore: CashflowGroup[], id: string): CashflowItem {
  const busca = (gs: CashflowGroup[]): CashflowItem | undefined => {
    for (const g of gs) {
      const achado = g.items.find((i) => i.id === id) ?? busca(g.children);
      if (achado) return achado;
    }
    return undefined;
  };
  const achado = busca(arvore);
  if (!achado) throw new Error(`item ${id} não está na árvore`);
  return achado;
}

/** Acha um grupo da árvore pelo id. */
export function acharGrupo(arvore: CashflowGroup[], id: string): CashflowGroup {
  const busca = (gs: CashflowGroup[]): CashflowGroup | undefined => {
    for (const g of gs) {
      if (g.id === id) return g;
      const achado = busca(g.children);
      if (achado) return achado;
    }
    return undefined;
  };
  const achado = busca(arvore);
  if (!achado) throw new Error(`grupo ${id} não está na árvore`);
  return achado;
}
