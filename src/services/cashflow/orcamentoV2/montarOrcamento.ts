/**
 * Montagem do Orçamento v2 no servidor (desenho técnico §6.2/§6.3): PURA, sem Prisma. Recebe a
 * árvore mesclada do Fluxo, os orçados do ano, a receita prevista por mês e as prefs, e devolve o
 * `OrcamentoV2Response` completo, com tudo calculado pelas regras de `lib/orcamento/regras`.
 *
 * Mapeamento (§2):
 * - Categoria = grupo de despesa da MESMA partição de `collectCategorias` (a tela antiga usa a
 *   mesma função): filhos de "Despesas Fixas", "Despesas Variáveis", demais filhos de "Despesas"
 *   e grupos de despesa do usuário na raiz. Investimentos fica fora (D12), assim como receitas e
 *   Conta Corrente.
 * - Subcategoria = `CashflowItem`; itens de subgrupos aninhados entram achatados na categoria
 *   (mesma soma da tela antiga), na ordem da árvore.
 * - Nome exibido = `CashflowGroup.name`/`CashflowItem.name` mesclados (D11). O catálogo só dá
 *   ícone padrão, abreviação, poupança e fixa padrão.
 * - Realizado (R-03, P1): Lançado = toda célula; Consolidado = só `isConsolidadoColor`. Espelhos de
 *   objetivo e de dívida seguem a mesma regra, sem exceção (Q4).
 * - Visão ano (R-15, Q7): Σ jan..mês do realizado e do orçado (% convertido pela receita de cada
 *   mês), ritmo do ano, receita acumulada; somente leitura.
 */
import type { CashflowGroup, CashflowItem } from '@/types/cashflow';
import type {
  AnoMes,
  CategoriaV2,
  EspelhoSubcategoria,
  FonteOrcamento,
  OrcamentoV2Response,
  OrigemReceita,
  ReceitaPrevistaV2,
  RotuloRealizado,
  SubcategoriaV2,
  VisaoOrcamento,
} from '@/types/orcamentoV2';
import {
  calcularCategoria,
  calcularResumo,
  calcularSubcategoria,
  inicioDoAcumulado,
  mesesSemOrcamento,
  orcadoAcumulado,
  orcadoEfetivo,
  receitaAcumulada,
  ritmoDoAno,
  ritmoDoMes,
  subcategoriaFixa,
  type FaseMes,
  type HojeSP,
  type Orcado,
} from '@/lib/orcamento/regras';
import {
  abreviacaoCategoria,
  categoriaDoCatalogo,
  ehCategoriaPoupanca,
  fixaPadrao,
  iconePadraoCategoria,
} from '@/lib/orcamento/catalogo';
import { isConsolidadoColor } from '@/utils/cashflowColorLegend';
import { canonicalName } from '../groupMatchers';
import { collectCategorias } from '../orcamentoVsReal';
import type { ReceitaMes } from './receitaPrevista';

/** Linha de `cashflow_orcamento_itens` já com Decimal → number (mês 0–11). */
export interface OrcadoRow {
  itemId: string;
  ano: number;
  mes: number;
  valor: number | null;
  pct: number | null;
}

/** Linha de `cashflow_orcamento_prefs` (ou `null`, usuário sem prefs). */
export interface PrefsRow {
  categoriasRecolhidas: string[];
  graficoVisivel: boolean;
  estruturaCriadaEm: Date | null;
  avisoGeralVistoEm: Date | null;
}

export interface EntradaMontagem {
  arvore: CashflowGroup[];
  /** Orçados do ano (e, se houver, de dez do ano anterior, para o "Copiar de"). */
  orcados: OrcadoRow[];
  /** 12 meses (0–11) do ano pedido. */
  receitaPorMes: ReceitaMes[];
  ano: number;
  mes0: number;
  visao: VisaoOrcamento;
  fonte: FonteOrcamento;
  hojeSP: HojeSP;
  prefs: PrefsRow | null;
  atualizadoEm: Date;
}

const MESES = 12;

/** Itens da categoria, com os de subgrupos aninhados achatados (ordem da árvore). */
function itensAchatados(group: CashflowGroup): CashflowItem[] {
  return [
    ...(group.items ?? []).filter((i) => !i.hidden),
    ...(group.children ?? []).filter((c) => !c.hidden).flatMap(itensAchatados),
  ];
}

/** Realizado (0–11) do item na fonte pedida (R-03, P1). */
function realizadoPorMes(item: CashflowItem, fonte: FonteOrcamento): number[] {
  const out = Array<number>(MESES).fill(0);
  for (const v of item.values ?? []) {
    if (typeof v.month !== 'number' || v.month < 0 || v.month >= MESES) continue;
    const valor = Number(v.value);
    if (!Number.isFinite(valor)) continue;
    if (fonte === 'consolidado' && !isConsolidadoColor(v.color)) continue;
    out[v.month] += valor;
  }
  return out;
}

const espelhoDo = (item: CashflowItem): EspelhoSubcategoria =>
  item.objetivoId ? 'objetivo' : item.dividaId ? 'divida' : null;

const temOrcado = (o: Orcado): boolean => (o.valor ?? 0) > 0 || (o.pct ?? 0) > 0;

/** Mês anterior na convenção da API (1–12). */
function mesAnterior(ano: number, mes0: number): AnoMes {
  return mes0 === 0 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes0 };
}

function rotuloRealizado(fase: FaseMes, fonte: FonteOrcamento): RotuloRealizado {
  if (fonte === 'consolidado') return 'realizado';
  return fase === 'futuro' ? 'previsto' : 'lancado';
}

/** Origem da receita acumulada: 'nenhuma' sem nenhum mês; 'fluxo' só se todos vieram do Fluxo. */
function origemAcumulada(meses: ReceitaMes[]): OrigemReceita {
  const conhecidos = meses.filter((r) => r.origem !== 'nenhuma');
  if (conhecidos.length === 0) return 'nenhuma';
  return conhecidos.every((r) => r.origem === 'fluxo') ? 'fluxo' : 'media3m';
}

export function montarOrcamentoV2(entrada: EntradaMontagem): OrcamentoV2Response {
  const { arvore, orcados, receitaPorMes, ano, mes0, visao, fonte, hojeSP, prefs } = entrada;
  const porAno = visao === 'ano';

  const doMes = ritmoDoMes(ano, mes0, hojeSP);
  const receitaValores = Array.from({ length: MESES }, (_, m) => receitaPorMes[m]?.valor ?? null);

  const orcadoPorChave = new Map<string, Orcado>();
  for (const o of orcados) {
    orcadoPorChave.set(`${o.itemId}|${o.ano}|${o.mes}`, { valor: o.valor, pct: o.pct });
  }
  const orcadoDe = (itemId: string, a: number, m: number): Orcado | undefined =>
    orcadoPorChave.get(`${itemId}|${a}|${m}`);

  // Acumulado (R-15 revisto): orçado total de cada mês nas subcategorias visíveis, para achar o
  // 1º mês com orçado — o período começa nele (receita, realizado e ritmo inclusive).
  const orcadoTotalPorMes = Array<number>(MESES).fill(0);
  if (porAno) {
    for (const { group } of collectCategorias(arvore))
      for (const item of itensAchatados(group))
        for (let m = 0; m < MESES; m++) {
          const o = orcadoDe(item.id, ano, m);
          if (o) orcadoTotalPorMes[m] += orcadoEfetivo(o, receitaValores[m]);
        }
  }
  const inicio0 = porAno ? inicioDoAcumulado(orcadoTotalPorMes, mes0) : mes0;

  const ritmo = porAno ? ritmoDoAno(ano, mes0, hojeSP, inicio0) : doMes.ritmo;
  const receita = porAno ? receitaAcumulada(receitaValores, mes0, inicio0) : receitaValores[mes0];

  const anterior = mesAnterior(ano, mes0);
  let copiarTemOrcado = false;

  const categorias: CategoriaV2[] = collectCategorias(arvore).map(({ group }) => {
    const canonico = canonicalName(group);
    const poupanca = ehCategoriaPoupanca(canonico);

    const subcategorias: SubcategoriaV2[] = itensAchatados(group).map((item) => {
      const geral = item.isGeral === true;
      const espelho = espelhoDo(item);
      const fixa = subcategoriaFixa({
        orcamentoFixa: item.orcamentoFixa ?? null,
        fixaPadrao: fixaPadrao(item.name, canonico),
        poupanca,
      });

      const realMeses = realizadoPorMes(item, fonte);
      const realizado = porAno
        ? realMeses.slice(inicio0, mes0 + 1).reduce((a, b) => a + b, 0)
        : realMeses[mes0];

      const anteriorOrcado = orcadoDe(item.id, anterior.ano, anterior.mes - 1);
      if (anteriorOrcado && temOrcado(anteriorOrcado)) copiarTemOrcado = true;

      let valor: number | null;
      let pct: number | null;
      if (porAno) {
        const orcadosMeses = Array.from({ length: MESES }, (_, m) => orcadoDe(item.id, ano, m));
        const algum = orcadosMeses.slice(0, mes0 + 1).some((o) => o && temOrcado(o));
        valor = algum ? orcadoAcumulado(orcadosMeses, receitaValores, mes0) : null;
        pct = null;
      } else {
        const o = orcadoDe(item.id, ano, mes0);
        valor = o?.valor ?? null;
        pct = o?.pct ?? null;
      }

      const calc = calcularSubcategoria({ geral, fixa, valor, pct, realizado }, receita, ritmo);
      return {
        id: item.id,
        nome: item.name,
        geral,
        fixa,
        espelho,
        orcado: calc.orcado,
        valor,
        pct,
        realizado: calc.realizado,
        diferenca: calc.diferenca,
        consumido: calc.consumido,
        status: calc.status,
        editavelEstrutura: !geral && espelho === null,
        editavelOrcado: !porAno,
      };
    });

    const cat = calcularCategoria(subcategorias, receita);
    return {
      id: group.id,
      nome: group.name,
      icone: group.icone ?? iconePadraoCategoria(canonico),
      abreviacao: categoriaDoCatalogo(canonico) ? abreviacaoCategoria(canonico) : group.name,
      poupanca,
      sistema: Boolean(group.templateId) || group.isTemplate === true,
      ...cat,
      subcategorias,
    };
  });

  const receitaMes = receitaPorMes[mes0] ?? { valor: null, origem: 'nenhuma' as const };
  const receitaPrevista: ReceitaPrevistaV2 = porAno
    ? { valor: receita, origem: origemAcumulada(receitaPorMes.slice(inicio0, mes0 + 1)) }
    : {
        valor: receitaMes.valor,
        origem: receitaMes.origem,
        ...(receitaMes.mesesBase ? { mesesBase: receitaMes.mesesBase } : {}),
      };

  return {
    versao: 2,
    ano,
    mes: mes0 + 1,
    visao,
    fonte,
    referencia: {
      dia: doMes.dia,
      diasNoMes: doMes.diasNoMes,
      ritmo,
      fase: doMes.fase,
      rotuloRealizado: rotuloRealizado(doMes.fase, fonte),
      atualizadoEm: entrada.atualizadoEm.toISOString(),
    },
    receitaPrevista,
    resumo: calcularResumo(categorias, receita),
    copiarDe: { ...anterior, temOrcado: copiarTemOrcado },
    prefs: {
      categoriasRecolhidas: prefs?.categoriasRecolhidas ?? [],
      graficoVisivel: prefs?.graficoVisivel ?? true,
      avisoGeralPendente: prefs?.estruturaCriadaEm != null && prefs.avisoGeralVistoEm == null,
    },
    ...(porAno
      ? {
          inicioAcumulado: inicio0 + 1,
          mesesSemOrcamento: mesesSemOrcamento(orcadoTotalPorMes, mes0, inicio0).map((m) => m + 1),
        }
      : {}),
    categorias,
  };
}
