import type { CashflowGroup, CashflowItem } from '@/types/cashflow';
import { isReceitaGroupByType } from '@/utils/formatters';
import { isConsolidadoColor } from '@/utils/cashflowColorLegend';
import { CANONICAL_GROUPS, isCanonical } from './groupMatchers';

/**
 * Orçamento vs Real — agregação pura e isomórfica da seção de metas.
 *
 * Espelha a aba "Orçamento vs Real (Mensal)" da planilha do Wellington:
 * resumo por categoria com meta mensal (orçamento), real e diferença, mais a
 * linha especial de Investimentos cuja meta é % da renda do mês.
 *
 * Convenções:
 * - "Categorias" formam uma PARTIÇÃO DISJUNTA das despesas (o Total nunca
 *   conta a mesma célula duas vezes): filhos do grupo canônico 'Despesas
 *   Fixas', o grupo 'Despesas Variáveis' inteiro, demais filhos de 'Despesas'
 *   e grupos de despesa criados pelo usuário na raiz.
 * - Todo real vem em DOIS modos: `lancado` (todas as células do mês, como o
 *   SUMIF da planilha) e `consolidado` (só células pintadas de Pago/Recebido —
 *   ver `isConsolidadoColor`). O modo padrão da UI é `lancado`.
 * - O Total de despesas NÃO inclui a linha Investimentos (aporte não é
 *   despesa — mesma convenção do `aggregateCashflow`).
 */

const MONTHS = 12;

export type OrcamentoModo = 'lancado' | 'consolidado';

/** Série mensal nos dois modos de leitura do real. */
export interface SeriePorModo {
  lancado: number[];
  consolidado: number[];
}

/** Meta persistida (linha de cashflow_orcamentos), já com Decimal→number. */
export interface OrcamentoMetaRow {
  groupId: string | null;
  tipo: string; // 'grupo' | 'investimentos'
  tipoMeta: string; // 'valor' | 'percentual'
  valor: number;
}

export interface OrcamentoCategoria {
  groupId: string;
  nome: string;
  /** Nome do grupo pai (ex.: 'Despesas Fixas') — contexto na UI. */
  parentNome: string | null;
  /** Meta mensal em R$ (null = usuário ainda não definiu). */
  metaMensal: number | null;
  realPorMes: SeriePorModo;
  realAnual: { lancado: number; consolidado: number };
}

export interface OrcamentoInvestimentos {
  /** 'valor' (R$ mensal fixo, padrão) | 'percentual' (legado, % da renda) | null sem meta. */
  tipoMeta: string | null;
  /** Valor bruto persistido: R$ mensal ou % conforme tipoMeta (null = sem meta). */
  valorMeta: number | null;
  /** Renda (entradas) por mês — base quando tipoMeta='percentual'. */
  entradasPorMes: SeriePorModo;
  /**
   * Meta em R$ por mês: valor fixo repetido (tipoMeta='valor') ou
   * percentual × entradas do mês por modo (tipoMeta='percentual').
   */
  metaPorMes: SeriePorModo;
  /**
   * Real investido por mês (linha Aporte/Resgate derivada das transações).
   * Não tem modo: transação executada já é consolidada por natureza.
   */
  realPorMes: number[];
}

export interface OrcamentoTotais {
  /** Soma das metas mensais definidas (só categorias, sem investimentos). */
  metaMensal: number;
  realPorMes: SeriePorModo;
  realAnual: { lancado: number; consolidado: number };
}

export interface OrcamentoVsReal {
  categorias: OrcamentoCategoria[];
  investimentos: OrcamentoInvestimentos;
  totais: OrcamentoTotais;
}

const zeros = (): number[] => Array(MONTHS).fill(0);

const round2 = (v: number): number => Math.round(v * 100) / 100;

/** Soma os valores mensais dos itens de um subtree, nos dois modos. */
function sumSubtree(group: CashflowGroup, into: { lancado: number[]; consolidado: number[] }) {
  group.items?.forEach((item: CashflowItem) => {
    item.values?.forEach((val) => {
      const month = val.month;
      const value = val.value;
      if (typeof month !== 'number' || month < 0 || month >= MONTHS) return;
      if (typeof value !== 'number') return;
      into.lancado[month] += value;
      if (isConsolidadoColor(val.color)) into.consolidado[month] += value;
    });
  });
  group.children?.forEach((child) => sumSubtree(child, into));
}

function serieDoGrupo(group: CashflowGroup): SeriePorModo {
  const into = { lancado: zeros(), consolidado: zeros() };
  sumSubtree(group, into);
  return {
    lancado: into.lancado.map(round2),
    consolidado: into.consolidado.map(round2),
  };
}

/**
 * Partição disjunta das categorias de despesa (ver doc do módulo).
 * Retorna pares (grupo, nome do pai) na ordem da árvore.
 */
function collectCategorias(
  groups: CashflowGroup[],
): Array<{ group: CashflowGroup; parentNome: string | null }> {
  const out: Array<{ group: CashflowGroup; parentNome: string | null }> = [];

  for (const group of groups) {
    if (isReceitaGroupByType(group.type)) continue;
    if (group.type === 'investimento' || group.type === 'saldo') continue;

    if (isCanonical(group, CANONICAL_GROUPS.DESPESAS)) {
      for (const child of group.children ?? []) {
        if (isCanonical(child, CANONICAL_GROUPS.DESPESAS_FIXAS) && child.children?.length) {
          // Grão da planilha: Habitação, Transporte, Saúde…
          child.children.forEach((cat) => out.push({ group: cat, parentNome: child.name }));
          // Itens soltos direto em 'Despesas Fixas' (sem subgrupo) não têm
          // categoria própria — ficam de fora das metas, mas o Total real
          // os incluiria em dobro se somássemos o pai. Mantemos fora: o
          // template não tem itens soltos nesse nível.
        } else {
          out.push({ group: child, parentNome: group.name });
        }
      }
    } else {
      // Grupo de despesa custom na raiz.
      out.push({ group, parentNome: null });
    }
  }

  return out;
}

/** Entradas (renda) por mês nos dois modos — base da meta % de investimentos. */
function entradasPorMes(groups: CashflowGroup[]): SeriePorModo {
  const into = { lancado: zeros(), consolidado: zeros() };
  groups.forEach((group) => {
    if (isReceitaGroupByType(group.type)) sumSubtree(group, into);
  });
  return {
    lancado: into.lancado.map(round2),
    consolidado: into.consolidado.map(round2),
  };
}

export function buildOrcamentoVsReal({
  groups,
  metas,
  investimentosRealPorMes,
}: {
  groups: CashflowGroup[];
  metas: OrcamentoMetaRow[];
  /** Linha Aporte/Resgate (totaisPorMes + planejamento) das transações. */
  investimentosRealPorMes: number[];
}): OrcamentoVsReal {
  const metaPorGrupo = new Map<string, number>();
  let metaInvestimentosRow: OrcamentoMetaRow | null = null;

  for (const meta of metas) {
    if (meta.tipo === 'investimentos') {
      metaInvestimentosRow = meta;
    } else if (meta.groupId) {
      metaPorGrupo.set(meta.groupId, meta.valor);
    }
  }

  const categorias: OrcamentoCategoria[] = collectCategorias(groups).map(
    ({ group, parentNome }) => {
      const realPorMes = serieDoGrupo(group);
      return {
        groupId: group.id,
        nome: group.name,
        parentNome,
        metaMensal: metaPorGrupo.get(group.id) ?? null,
        realPorMes,
        realAnual: {
          lancado: round2(realPorMes.lancado.reduce((a, b) => a + b, 0)),
          consolidado: round2(realPorMes.consolidado.reduce((a, b) => a + b, 0)),
        },
      };
    },
  );

  const entradas = entradasPorMes(groups);
  // Meta de investimentos: R$ mensal fixo (padrão, como as categorias) ou
  // % da renda do mês (legado — planilha guardava o % numa célula auxiliar).
  const metaInvestimentos: SeriePorModo = (() => {
    if (!metaInvestimentosRow) return { lancado: zeros(), consolidado: zeros() };
    if (metaInvestimentosRow.tipoMeta === 'percentual') {
      const pct = metaInvestimentosRow.valor;
      return {
        lancado: entradas.lancado.map((v) => round2((pct / 100) * v)),
        consolidado: entradas.consolidado.map((v) => round2((pct / 100) * v)),
      };
    }
    const fixo = Array(MONTHS).fill(round2(metaInvestimentosRow.valor));
    return { lancado: fixo, consolidado: [...fixo] };
  })();

  const realTotais: SeriePorModo = { lancado: zeros(), consolidado: zeros() };
  categorias.forEach((cat) => {
    for (let m = 0; m < MONTHS; m++) {
      realTotais.lancado[m] += cat.realPorMes.lancado[m];
      realTotais.consolidado[m] += cat.realPorMes.consolidado[m];
    }
  });
  realTotais.lancado = realTotais.lancado.map(round2);
  realTotais.consolidado = realTotais.consolidado.map(round2);

  return {
    categorias,
    investimentos: {
      tipoMeta: metaInvestimentosRow?.tipoMeta ?? null,
      valorMeta: metaInvestimentosRow?.valor ?? null,
      entradasPorMes: entradas,
      metaPorMes: metaInvestimentos,
      realPorMes: (investimentosRealPorMes ?? zeros()).slice(0, MONTHS).map(round2),
    },
    totais: {
      metaMensal: round2(categorias.reduce((sum, cat) => sum + (cat.metaMensal ?? 0), 0)),
      realPorMes: realTotais,
      realAnual: {
        lancado: round2(realTotais.lancado.reduce((a, b) => a + b, 0)),
        consolidado: round2(realTotais.consolidado.reduce((a, b) => a + b, 0)),
      },
    },
  };
}
