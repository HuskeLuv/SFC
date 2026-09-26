import type { CashflowGroup, CashflowItem } from '@/types/cashflow';
import type { CashflowAggregation } from '@/services/cashflow/cashflowAggregation';
import type { CashflowColorValue } from '@/utils/cashflowColorLegend';
import { CANONICAL_GROUPS, isCanonical } from '@/services/cashflow/groupMatchers';
import {
  inflacaoPessoalPorMes,
  peaceIndex,
  savingsIndex,
} from '@/services/cashflow/derivedIndices';
import { groupLevel, type GroupLevel } from '@/components/cashflow/groupLevel';
import { isReceitaGroupByType } from '@/utils/formatters';
import { cellColorLabel, normalizeCellColor } from './cellColor';
import {
  getItemCapabilities,
  groupDisplayName,
  isInvestment,
  type ItemCapabilities,
} from './itemCapabilities';

/**
 * Modelo PURO da "visão do mês" do Fluxo de caixa no celular (PWA fase 2, fatia A): a coluna de UM
 * mês da planilha de desktop, na MESMA ordem do DataTableTwo, como uma lista de blocos (grupos
 * recursivos e linhas calculadas).
 *
 * Nenhuma conta nova: todo número vem da agregação (`processedData`), das séries derivadas
 * (`useCashflowDerivedRows`) ou dos índices (`derivedIndices`) — as mesmas fontes do desktop.
 */

/** Agregação + árvore, como `useProcessedData` devolve. */
export type MonthProcessedData = CashflowAggregation & { groups: CashflowGroup[] };

/** Séries derivadas que a visão do mês lê (subconjunto de `useCashflowDerivedRows`). */
export interface MonthDerivedSeries {
  saldoContaCorrenteAnteriorByMonth: Array<number | null>;
  fluxoCaixaLivreByMonth: number[];
  evolucaoPatrimonioByMonth: Array<number | null>;
  proventosByMonth: number[];
  despesasFixasData: { byMonth: number[]; annual: number };
  contaCorrenteGroup: CashflowGroup | null;
}

export type DerivedKey =
  | 'saldoCcAnterior'
  | 'inflacao'
  | 'saldoMes'
  | 'poupanca'
  | 'fluxoLivre'
  | 'evolucao'
  | 'rendimentos'
  | 'paz';

export type ItemBadge = 'sonho' | 'divida';

export interface MonthItem {
  kind: 'item';
  itemId: string;
  groupId: string;
  name: string;
  /** Valor da célula no mês (0 = sem valor). */
  monthValue: number;
  /** Total do ano da linha (coluna Total Anual). */
  annual: number;
  /** Situação (cor) da célula normalizada para a legenda; `null` = sem situação. */
  colorKey: CashflowColorValue | null;
  /** Nome da situação na legenda ("Pago", "Recebido"…). */
  colorLabel: string | null;
  hasComment: boolean;
  hasFormula: boolean;
  badges: ItemBadge[];
  caps: ItemCapabilities;
  /** Aporte/Resgate calculado da carteira. */
  readOnly: boolean;
}

export interface MonthGroup {
  kind: 'group';
  groupId: string;
  label: string;
  level: GroupLevel;
  /** Tipo do grupo ('entrada' | 'despesa' | 'investimento' | 'saldo'). */
  groupType: string;
  monthSubtotal: number;
  annual: number;
  /** Só no Despesas raiz: despesas do mês ÷ entradas do mês × 100 (`null` sem entradas). */
  percent?: number | null;
  /** Aporte/Resgate: calculado da carteira, sem ações de grupo. */
  readOnly: boolean;
  /** Linhas calculadas logo abaixo da faixa (Inflação Pedro no Despesas raiz). */
  afterBand: MonthDerived[];
  /** Subgrupos primeiro, depois as linhas do próprio grupo (mesma ordem do desktop). */
  children: MonthGroup[];
  items: MonthItem[];
}

export interface MonthDerived {
  kind: 'derived';
  key: DerivedKey;
  label: string;
  value: number | null;
  format: 'currency' | 'percent';
  /** Linhas-chave (Saldo do mês, Fluxo livre, Evolução): destaque. */
  emphasis: boolean;
  helpKey: DerivedKey;
  /** Série do ano (para o mini-gráfico do sheet da conta). */
  series: Array<number | null>;
}

export type MonthBlock = MonthGroup | MonthDerived;

export const DERIVED_LABEL: Record<DerivedKey, string> = {
  saldoCcAnterior: 'Saldo Conta Corrente Mês Anterior',
  inflacao: 'Inflação Pedro',
  saldoMes: 'Saldo do mês (Lucro Líquido)',
  poupanca: 'Índice de Poupança Mensal',
  fluxoLivre: 'Fluxo de Caixa livre',
  evolucao: 'Evolução do Patrimônio',
  rendimentos: 'Rendimentos Recebidos',
  paz: 'Índice paz financeira',
};

const EMPHASIS = new Set<DerivedKey>(['saldoMes', 'fluxoLivre', 'evolucao']);
const PERCENT = new Set<DerivedKey>(['inflacao', 'poupanca', 'paz']);

const zeros = (): number[] => Array(12).fill(0);

function derivedBlock(key: DerivedKey, series: Array<number | null>, month: number): MonthDerived {
  const raw = series[month];
  return {
    kind: 'derived',
    key,
    label: DERIVED_LABEL[key],
    value: raw === undefined || raw === null || !Number.isFinite(raw) ? null : raw,
    format: PERCENT.has(key) ? 'percent' : 'currency',
    emphasis: EMPHASIS.has(key),
    helpKey: key,
    series,
  };
}

function buildItem(
  item: CashflowItem,
  group: CashflowGroup,
  processedData: MonthProcessedData,
  month: number,
  year: number,
): MonthItem {
  // Mesma leitura do ItemRow do desktop: o valor vem de itemTotals; cor, comentário e fórmula da
  // célula do ano mostrado.
  const cell = item.values?.find((v) => v.month === month && v.year === year);
  const badges: ItemBadge[] = [];
  if (item.objetivoId) badges.push('sonho');
  if (item.dividaId) badges.push('divida');
  return {
    kind: 'item',
    itemId: item.id,
    groupId: group.id,
    name: item.name || '',
    monthValue: processedData.itemTotals[item.id]?.[month] || 0,
    annual: processedData.itemAnnualTotals[item.id] || 0,
    colorKey: normalizeCellColor(cell?.color),
    colorLabel: cellColorLabel(cell?.color),
    hasComment: !!cell?.comment,
    hasFormula: !!cell?.formula,
    badges,
    caps: getItemCapabilities(item, group),
    readOnly: isInvestment(group, item),
  };
}

function buildGroup(
  group: CashflowGroup,
  processedData: MonthProcessedData,
  month: number,
  year: number,
): MonthGroup {
  const isMainDespesas = isCanonical(group, CANONICAL_GROUPS.DESPESAS) && !group.parentId;
  const monthSubtotal = processedData.groupTotals[group.id]?.[month] || 0;
  const entradas = processedData.entradasByMonth[month] || 0;
  const block: MonthGroup = {
    kind: 'group',
    groupId: group.id,
    label: groupDisplayName(group),
    level: groupLevel(group),
    groupType: group.type,
    monthSubtotal,
    annual: processedData.groupAnnualTotals[group.id] || 0,
    readOnly: group.type === 'investimento',
    afterBand: [],
    children: (group.children ?? []).map((c) => buildGroup(c, processedData, month, year)),
    items: (group.items ?? []).map((i) => buildItem(i, group, processedData, month, year)),
  };
  if (isMainDespesas) {
    block.percent = entradas > 0 ? (monthSubtotal / entradas) * 100 : null;
    block.afterBand.push(
      derivedBlock('inflacao', inflacaoPessoalPorMes(processedData.despesasByMonth), month),
    );
  }
  return block;
}

/**
 * Blocos do mês na ordem do DataTableTwo:
 * Total de Entradas → Saldo C/C mês anterior → Despesas Fixas e Variáveis (% da receita + Inflação
 * Pedro) → Saldo do mês → Índice de Poupança → Conta Corrente → Aporte/Resgate → Fluxo de caixa
 * livre → Evolução do patrimônio → Rendimentos → Paz financeira.
 */
export function buildMonthBlocks({
  processedData,
  derived,
  month,
  year,
}: {
  processedData: MonthProcessedData;
  derived: MonthDerivedSeries;
  month: number;
  year: number;
}): MonthBlock[] {
  const blocks: MonthBlock[] = [];
  const { groups } = processedData;
  const mainGroups = groups.filter((g) => g.type !== 'investimento' && g.type !== 'saldo');

  mainGroups.forEach((group, index) => {
    const isFirstDespesaGroup =
      !isReceitaGroupByType(group.type) &&
      mainGroups.slice(0, index).every((g) => isReceitaGroupByType(g.type));
    if (isFirstDespesaGroup) {
      blocks.push(
        derivedBlock('saldoCcAnterior', derived.saldoContaCorrenteAnteriorByMonth, month),
      );
    }
    blocks.push(buildGroup(group, processedData, month, year));
  });

  blocks.push(derivedBlock('saldoMes', processedData.totalByMonth, month));
  blocks.push(
    derivedBlock(
      'poupanca',
      processedData.totalByMonth.map((saldo, i) =>
        savingsIndex(saldo, processedData.entradasByMonth[i] || 0),
      ),
      month,
    ),
  );

  if (derived.contaCorrenteGroup) {
    // A árvore do processedData é a fonte (o grupo do derived é o mesmo objeto).
    const cc =
      groups.find((g) => g.id === derived.contaCorrenteGroup?.id) ?? derived.contaCorrenteGroup;
    blocks.push(buildGroup(cc, processedData, month, year));
  }

  for (const group of groups.filter((g) => g.type === 'investimento')) {
    blocks.push(buildGroup(group, processedData, month, year));
  }

  blocks.push(derivedBlock('fluxoLivre', derived.fluxoCaixaLivreByMonth, month));
  blocks.push(derivedBlock('evolucao', derived.evolucaoPatrimonioByMonth, month));
  blocks.push(derivedBlock('rendimentos', derived.proventosByMonth, month));
  const despesasFixas = derived.despesasFixasData.byMonth ?? zeros();
  blocks.push(
    derivedBlock(
      'paz',
      derived.proventosByMonth.map((p, i) => peaceIndex(p, despesasFixas[i] || 0)),
      month,
    ),
  );
  return blocks;
}

export type MonthStatus = 'atual' | 'fechado' | 'previsto';

/** Passado = fechado, hoje = atual, futuro = previsto. */
export function monthStatus(year: number, month: number, now: Date = new Date()): MonthStatus {
  const y = now.getFullYear();
  const m = now.getMonth();
  if (year < y || (year === y && month < m)) return 'fechado';
  if (year === y && month === m) return 'atual';
  return 'previsto';
}

/** Saldo de cada mês (Saldo do mês da planilha) para o "Escolher mês" do MonthStepper. */
export function monthSummaries(
  processedData: Pick<MonthProcessedData, 'totalByMonth'>,
  year: number,
  now: Date = new Date(),
): Array<{ saldo: number | null; previsto: boolean }> {
  return Array.from({ length: 12 }, (_, m) => {
    const saldo = processedData.totalByMonth[m];
    return {
      saldo: typeof saldo === 'number' && Number.isFinite(saldo) ? saldo : null,
      previsto: monthStatus(year, m, now) === 'previsto',
    };
  });
}

/** Mês inicial: o mês de hoje no ano corrente; dezembro em ano passado; janeiro em ano futuro. */
export function defaultMonth(year: number, now: Date = new Date()): number {
  const y = now.getFullYear();
  if (year === y) return now.getMonth();
  return year < y ? 11 : 0;
}

/** Todos os ids de grupo da árvore (Recolher tudo, igual ao desktop). */
export function allGroupIds(groups: CashflowGroup[]): string[] {
  const ids: string[] = [];
  const walk = (list: CashflowGroup[]) => {
    for (const g of list) {
      ids.push(g.id);
      if (g.children?.length) walk(g.children);
    }
  };
  walk(groups);
  return ids;
}

/** Ids dos grupos do caminho até a linha (raiz → grupo da linha); vazio se a linha não existe. */
export function groupPathToItem(groups: CashflowGroup[], itemId: string): string[] {
  for (const g of groups) {
    if (g.items?.some((i) => i.id === itemId)) return [g.id];
    if (g.children?.length) {
      const sub = groupPathToItem(g.children, itemId);
      if (sub.length) return [g.id, ...sub];
    }
  }
  return [];
}

/** Grupo sem nenhuma linha com valor no mês (nem nos subgrupos). */
export function isGroupEmptyInMonth(group: MonthGroup): boolean {
  return group.items.every((i) => !i.monthValue) && group.children.every(isGroupEmptyInMonth);
}
