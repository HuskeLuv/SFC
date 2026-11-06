/**
 * Seção 2 (Orçamento) do Relatório financeiro. Todos os planos.
 *
 * Mês a mês, a montagem PURA do Orçamento v2 (`montarOrcamentoV2`, visão 'mes', fonte 'lancado')
 * sobre a árvore mesclada do ano (insumo `cashflowDoAno`), os orçados dos anos da janela e a
 * receita de `calcularReceitaPrevista`. Nunca chama `carregarOrcamentoV2` (que garante as Gerais e
 * pode gravar) nem depende do gate ORCAMENTO_V2: quem não ativou o v2 só fica sem orçados
 * (`temOrcamento: false`), e nada é ativado nem gravado.
 *
 * Regras do relatório (decisão 2 do Wellington, 06/11):
 *  - Sobra pelo REALIZADO (receita − gastos lançados), com o Planejamento Financeiro (categoria de
 *    poupança, dinheiro dos sonhos) FORA dos gastos: a categoria não entra em `categorias`.
 *  - Categorias somadas por CHAVE canônica (a abreviação do catálogo ou, fora dele, o nome), para
 *    a mesma categoria com ids diferentes em dois anos (ou duas árvores) virar uma só linha.
 *  - Receita: a do Fluxo; a média dos 3 meses anteriores só no mês corrente; mês passado sem
 *    receita lançada = 0 ('vazio').
 *  - Status: o do app (bad acima de 100,5%), com 'warn' (à frente do ritmo) → 'ritmo'.
 *
 * Funções puras (`montarBlocoOrcamento`, `agregarPeriodoOrcamento`) separadas do loader
 * (`montarOrcamento`).
 */
import type { CashflowGroup } from '@/types/cashflow';
import type {
  BlocoOrcamento,
  CategoriaOrcamentoRelatorio,
  MesOrcamentoRelatorio,
  OrigemReceitaRelatorio,
  ReferenciaFechadaOrcamento,
  RitmoOrcamentoRelatorio,
  StatusCategoriaRelatorio,
} from '@/types/relatorioFinanceiro';
import type { OrcamentoV2Response } from '@/types/orcamentoV2';
import {
  arred1,
  arred2,
  normalizarBusca,
  TOLERANCIA_ESTOURO,
  type HojeSP,
  type StatusOrcamento,
} from '@/lib/orcamento/regras';
import { montarOrcamentoV2, type OrcadoRow } from '@/services/cashflow/orcamentoV2/montarOrcamento';
import {
  calcularReceitaPrevista,
  entradasLancadas,
  precisaDoAnoAnterior,
  type ReceitaMes,
} from '@/services/cashflow/orcamentoV2/receitaPrevista';
import type { ContextoMontador } from './insumos';
import { chaveMes, rotuloMes, somarMeses } from './periodo';

/** Quantos meses fechados entram na referência da saúde. */
export const MESES_REFERENCIA_FECHADA = 3;

// ── Puro ────────────────────────────────────────────────────────────────────────

/** Árvore e receita de um ano, já prontas para a montagem pura. */
export interface AnoOrcamento {
  arvore: CashflowGroup[];
  /** 12 meses (0–11), de `calcularReceitaPrevista`. */
  receitaPorMes: ReceitaMes[];
}

export interface EntradaBlocoOrcamento {
  /** Meses do período, 'YYYY-MM', do mais antigo ao corrente. */
  mesesDoPeriodo: string[];
  hojeSP: HojeSP;
  /** Árvore + receita de cada ano tocado (período e os 3 meses fechados da referência). */
  anos: Map<number, AnoOrcamento>;
  /** Orçados dos anos tocados. */
  orcados: OrcadoRow[];
  agora: Date;
}

const statusDoApp = (s: StatusOrcamento): StatusCategoriaRelatorio =>
  s === 'bad' ? 'bad' : s === 'warn' ? 'ritmo' : 'ok';

/** Mesma comparação em centavos de `regras.passouDaTolerancia` (100,5%). */
const passouDaTolerancia = (orcado: number, realizado: number): boolean =>
  Math.round(realizado * 100) * 1000 >
  Math.round(orcado * 100) * Math.round(TOLERANCIA_ESTOURO * 1000);

/** Status de uma soma (orçado, realizado) pela régua do app; 'ritmo' só se alguma parte já era. */
function statusDaSoma(
  orcado: number,
  realizado: number,
  partes: StatusCategoriaRelatorio[],
): StatusCategoriaRelatorio {
  if (!(orcado > 0)) return realizado > 0 ? 'bad' : 'ok';
  if (passouDaTolerancia(orcado, realizado)) return 'bad';
  return partes.includes('ritmo') ? 'ritmo' : 'ok';
}

/** Chave canônica da categoria: abreviação do catálogo (ou o nome), sem acento nem caixa. */
export const chaveCategoria = (abreviacao: string): string => normalizarBusca(abreviacao);

/**
 * Categorias de gasto de um mês (sem as de poupança), somadas por chave. Duas categorias com a
 * mesma chave no mesmo mês viram uma linha, com o status recalculado sobre a soma.
 */
export function categoriasDoMes(r: OrcamentoV2Response): CategoriaOrcamentoRelatorio[] {
  const porChave = new Map<
    string,
    CategoriaOrcamentoRelatorio & { partes: StatusCategoriaRelatorio[] }
  >();
  for (const c of r.categorias) {
    if (c.poupanca) continue;
    const chave = chaveCategoria(c.abreviacao);
    const status = statusDoApp(c.status);
    const atual = porChave.get(chave);
    if (!atual) {
      porChave.set(chave, {
        chave,
        nome: c.abreviacao,
        orcado: c.orcado,
        realizado: c.realizado,
        status,
        partes: [status],
      });
      continue;
    }
    atual.orcado = arred2(atual.orcado + c.orcado);
    atual.realizado = arred2(atual.realizado + c.realizado);
    atual.partes.push(status);
    atual.status = statusDaSoma(atual.orcado, atual.realizado, atual.partes);
  }
  return [...porChave.values()].map(({ partes: _partes, ...c }) => c);
}

/** Receita do relatório: Fluxo; média dos 3 meses só no mês corrente; passado sem Fluxo = 0. */
export function receitaDoRelatorio(
  receita: ReceitaMes | undefined,
  corrente: boolean,
): { valor: number; origem: OrigemReceitaRelatorio } {
  if (receita?.origem === 'fluxo' && receita.valor !== null) {
    return { valor: receita.valor, origem: 'fluxo' };
  }
  if (corrente && receita?.origem === 'media3m' && receita.valor !== null) {
    return { valor: receita.valor, origem: 'media3m' };
  }
  return { valor: 0, origem: 'vazio' };
}

interface MesMontado {
  mes: MesOrcamentoRelatorio;
  resposta: OrcamentoV2Response;
}

function montarMes(mes: string, e: EntradaBlocoOrcamento): MesMontado {
  const [ano, mm] = mes.split('-').map(Number);
  const mes0 = mm - 1;
  const doAno = e.anos.get(ano) ?? { arvore: [], receitaPorMes: [] };
  const resposta = montarOrcamentoV2({
    arvore: doAno.arvore,
    orcados: e.orcados,
    receitaPorMes: doAno.receitaPorMes,
    ano,
    mes0,
    visao: 'mes',
    fonte: 'lancado',
    hojeSP: e.hojeSP,
    prefs: null,
    atualizadoEm: e.agora,
  });
  const corrente = ano === e.hojeSP.ano && mes0 === e.hojeSP.mes0;
  const receita = receitaDoRelatorio(doAno.receitaPorMes[mes0], corrente);
  return {
    resposta,
    mes: {
      mes,
      rotulo: rotuloMes(mes),
      fechado: !corrente,
      receita: receita.valor,
      receitaOrigem: receita.origem,
      categorias: categoriasDoMes(resposta),
    },
  };
}

const gastoDoMes = (m: MesOrcamentoRelatorio): number =>
  arred2(m.categorias.reduce((a, c) => a + c.realizado, 0));

/** Os 3 meses fechados antes do corrente, 'YYYY-MM', do mais antigo ao mais novo. */
export function mesesDaReferencia(hojeSP: HojeSP): string[] {
  return Array.from({ length: MESES_REFERENCIA_FECHADA }, (_, i) => {
    const m = somarMeses(hojeSP.ano, hojeSP.mes0, i - MESES_REFERENCIA_FECHADA);
    return chaveMes(m.ano, m.mes0);
  });
}

/**
 * Bases dos meses FECHADOS (saúde e ganchos), independentes do período escolhido:
 *  - receitaMedia3m / gastoMedio3m = média dos 3 últimos meses fechados, e 0 quando algum deles
 *    não tem receita (ou gasto) lançada: a saúde lê 0 como '—' ("sem 3 meses fechados");
 *  - sobraMesAnterior = receita − gastos do mês anterior, null sem receita ou sem gasto nele.
 */
export function referenciaFechada(fechados: MesOrcamentoRelatorio[]): ReferenciaFechadaOrcamento {
  const receitas = fechados.map((m) => m.receita);
  const gastos = fechados.map(gastoDoMes);
  const completos = (vs: number[]) =>
    vs.length === MESES_REFERENCIA_FECHADA && vs.every((v) => v > 0);
  const media = (vs: number[]) =>
    completos(vs) ? arred2(vs.reduce((a, v) => a + v, 0) / vs.length) : 0;
  const anterior = fechados[fechados.length - 1];
  const gastoAnterior = gastos[gastos.length - 1] ?? 0;
  return {
    receitaMedia3m: media(receitas),
    gastoMedio3m: media(gastos),
    sobraMesAnterior:
      anterior && anterior.receita > 0 && gastoAnterior > 0
        ? arred2(anterior.receita - gastoAnterior)
        : null,
  };
}

/** Ritmo do mês corrente (callout com n=1): dias passados e % do orçado já lançado (do app). */
function ritmoDoCorrente(r: OrcamentoV2Response): RitmoOrcamentoRelatorio {
  const { dia, diasNoMes } = r.referencia;
  return {
    dia,
    diasNoMes,
    pctMes: arred1((dia / diasNoMes) * 100),
    pctOrcadoLancado: r.resumo.realizadoPctOrcado,
  };
}

/** Pura: o bloco da seção 2 a partir das árvores, receitas e orçados já carregados. */
export function montarBlocoOrcamento(e: EntradaBlocoOrcamento): BlocoOrcamento {
  const cache = new Map<string, MesMontado>();
  const doMes = (mes: string) => {
    let m = cache.get(mes);
    if (!m) {
      m = montarMes(mes, e);
      cache.set(mes, m);
    }
    return m;
  };

  const meses = e.mesesDoPeriodo.map((mes) => doMes(mes).mes);
  const corrente = chaveMes(e.hojeSP.ano, e.hojeSP.mes0);
  const ritmo = e.mesesDoPeriodo.includes(corrente)
    ? ritmoDoCorrente(doMes(corrente).resposta)
    : null;

  return {
    temOrcamento: meses.some((m) => m.categorias.some((c) => c.orcado > 0)),
    meses,
    ritmo,
    referenciaFechada: referenciaFechada(mesesDaReferencia(e.hojeSP).map((m) => doMes(m).mes)),
  };
}

// ── Soma do período (para o front de n > 1) ───────────────────────────────────────

export interface CategoriaPeriodoOrcamento extends CategoriaOrcamentoRelatorio {
  /** realizado ÷ orçado em % (1 casa); null com orçado 0. */
  pctConsumido: number | null;
  /** Meses com orçado > 0 e status 'bad' (o mês corrente parcial entra, como no protótipo). */
  mesesEstourados: number;
}

export interface PeriodoOrcamento {
  receita: number;
  orcado: number;
  realizado: number;
  /** receita − realizado (Planejamento Financeiro fora dos gastos). */
  sobra: number;
  /** sobra ÷ receita em % (1 casa); null sem receita. */
  indicePoupanca: number | null;
  /** orçado ÷ receita em % (1 casa); null sem receita. */
  orcadoPctReceita: number | null;
  /** realizado ÷ orçado em % (1 casa); null sem orçado. */
  realizadoPctOrcado: number | null;
  categorias: CategoriaPeriodoOrcamento[];
}

const pct = (parte: number, todo: number): number | null =>
  todo > 0 ? arred1((parte / todo) * 100) : null;

/**
 * Pura: soma dos meses do período por chave, com os % recalculados sobre a soma (nunca média
 * de %). Ordem das categorias = a do mês mais recente em que cada uma aparece.
 */
export function agregarPeriodoOrcamento(meses: MesOrcamentoRelatorio[]): PeriodoOrcamento {
  const porChave = new Map<
    string,
    CategoriaPeriodoOrcamento & { partes: StatusCategoriaRelatorio[] }
  >();
  for (const m of [...meses].reverse()) {
    for (const c of m.categorias) {
      const estourou = c.orcado > 0 && c.status === 'bad' ? 1 : 0;
      const atual = porChave.get(c.chave);
      if (!atual) {
        porChave.set(c.chave, {
          ...c,
          pctConsumido: null,
          mesesEstourados: estourou,
          partes: [c.status],
        });
        continue;
      }
      atual.orcado = arred2(atual.orcado + c.orcado);
      atual.realizado = arred2(atual.realizado + c.realizado);
      atual.mesesEstourados += estourou;
      atual.partes.push(c.status);
    }
  }
  const categorias = [...porChave.values()].map(({ partes, ...c }) => ({
    ...c,
    status: statusDaSoma(c.orcado, c.realizado, partes),
    pctConsumido: pct(c.realizado, c.orcado),
  }));
  const receita = arred2(meses.reduce((a, m) => a + m.receita, 0));
  const orcado = arred2(categorias.reduce((a, c) => a + c.orcado, 0));
  const realizado = arred2(categorias.reduce((a, c) => a + c.realizado, 0));
  const sobra = arred2(receita - realizado);
  return {
    receita,
    orcado,
    realizado,
    sobra,
    indicePoupanca: pct(sobra, receita),
    orcadoPctReceita: pct(orcado, receita),
    realizadoPctOrcado: pct(realizado, orcado),
    categorias,
  };
}

// ── Loader ──────────────────────────────────────────────────────────────────────

/** Anos tocados pelos meses pedidos ('YYYY-MM'). */
const anosDe = (meses: string[]): number[] =>
  [...new Set(meses.map((m) => Number(m.slice(0, 4))))].sort((a, b) => a - b);

export async function montarOrcamento(ctx: ContextoMontador): Promise<BlocoOrcamento> {
  const { insumos, hojeSP } = ctx;
  const anos = anosDe([...mesesDaReferencia(hojeSP), ...ctx.mesesDoPeriodo]);

  const [arvores, orcados] = await Promise.all([
    Promise.all(anos.map((a) => insumos.cashflowDoAno(a))),
    insumos.orcadosDosAnos(),
  ]);
  const arvorePorAno = new Map(anos.map((a, i) => [a, arvores[i]]));

  // A média de 3 meses só vale no mês corrente: jan–mar dele olham o fim do ano anterior. Os
  // outros anos não precisam (mês passado sem Fluxo = 0).
  const entradasCorrente = entradasLancadas(arvorePorAno.get(hojeSP.ano) ?? []);
  const entradasAnterior =
    hojeSP.mes0 < 3 && precisaDoAnoAnterior(entradasCorrente)
      ? entradasLancadas(
          arvorePorAno.get(hojeSP.ano - 1) ?? (await insumos.cashflowDoAno(hojeSP.ano - 1)),
        )
      : null;

  const porAno = new Map<number, AnoOrcamento>();
  for (const ano of anos) {
    const arvore = arvorePorAno.get(ano) ?? [];
    const corrente = ano === hojeSP.ano;
    porAno.set(ano, {
      arvore,
      receitaPorMes: calcularReceitaPrevista(
        ano,
        corrente ? entradasCorrente : entradasLancadas(arvore),
        corrente ? entradasAnterior : null,
      ),
    });
  }

  return montarBlocoOrcamento({
    mesesDoPeriodo: ctx.mesesDoPeriodo,
    hojeSP,
    anos: porAno,
    orcados,
    agora: ctx.agora,
  });
}
