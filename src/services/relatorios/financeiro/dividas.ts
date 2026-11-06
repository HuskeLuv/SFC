/**
 * Seção 3 (Dívidas) do Relatório financeiro. Todos os planos. Sem série histórica na v1 (com
 * n > 1 o front mostra o callout "em breve").
 *
 * Regras (decisão 3 do Wellington, 06/11):
 *  - Saldo CORRIGIDO pelo índice realizado (`resumoDivida` × `accruedIndexFactor`), como a
 *    Carteira e a Saúde. A tela Dívidas mostra o saldo sem correção (diferença documentada).
 *  - Parcela do mês = a linha do mês no cronograma do app (corrigida por `monthlyIndexFactors`
 *    nos indexados, sem as parcelas do fim cortadas por amortização) — o mesmo valor que a
 *    dívida projeta no Fluxo. Rotativa = mínimo de 15% do saldo. Fora de 'ativa' (pausada, em
 *    espera, quitada) = 0, como no Fluxo.
 *  - Juros do mês = saldo × taxa a.m.; CET a.a. = (1 + taxa a.m.)^12 − 1.
 *  - Juros até quitar = fórmula fechada do Pedro (SAC: i·A·n(n+1)/2; PRICE: PMT·n − saldo;
 *    parcelado: 0) sobre o saldo corrigido e o prazo restante; nunca no rotativo.
 *  - 'Cartão parcelado' só com taxa 0 e fora do Open Finance (Pluggy com taxa 0 = taxa não
 *    informada: fica no sistema do contrato, sem CET).
 *  - Itens ordenados por CET desc; sem CET no fim. Dívidas quitadas ficam fora dos itens.
 *
 * Só leitura: lê `insumos.dividasComPagamentos()` e os fatores do índice. Funções puras
 * (`calcularItemDivida`, `montarBlocoDividas`, `jurosAteQuitar`…) separadas do loader.
 */
import type {
  BlocoDividas,
  ItemDividaRelatorio,
  MotivoSemDividasForaImovel,
  SistemaDividaRelatorio,
} from '@/types/relatorioFinanceiro';
import {
  corrigirCronograma,
  gerarCronograma,
  parcelasCortadasDe,
  resumoDivida,
  type PagamentoDividaInput,
  type ParcelaCronograma,
} from '@/services/dividas/amortizacao';
import {
  accruedIndexFactor,
  isIndexadorCorrigivel,
  monthlyIndexFactors,
} from '@/services/dividas/indexacaoDivida';
import { ehImportacaoOpenFinance } from '@/services/pluggy/notaImportacao';
import { amToAa } from '@/utils/rateConversion';
import type { ContextoMontador, DividaComPagamentos } from './insumos';
import { chaveMes, somarMeses } from './periodo';

/** Pagamento mínimo do rotativo (fração do saldo). */
export const MINIMO_ROTATIVO = 0.15;

const round2 = (v: number): number => Math.round(v * 100) / 100;
const num = (v: unknown): number => Number(v);
const numOuNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

// ── Puro ────────────────────────────────────────────────────────────────────────

/** A dívida já com Decimal → number (o que as funções puras precisam). */
export interface EntradaDivida {
  id: string;
  nome: string;
  instituicao: string | null;
  tipo: string;
  modalidade: string;
  status: string;
  notes: string | null;
  principal: number | null;
  taxaAm: number | null;
  prazoMeses: number | null;
  sistema: string | null;
  indexador: string;
  primeiroVencimento: string | null;
  saldoInicial: number | null;
  dataSaldoInicial: string | null;
  pagamentos: PagamentoDividaInput[];
}

/** Fatores do índice realizado (1 e {} em prefixado). */
export interface FatoresDivida {
  /** Do 1º vencimento até hoje: corrige o saldo. */
  acumulado: number;
  /** Por mês do cronograma (aniversário): corrige a parcela. */
  mensais: Record<string, number>;
}

export const SEM_CORRECAO: FatoresDivida = { acumulado: 1, mensais: {} };

export function entradaDaDivida(d: DividaComPagamentos): EntradaDivida {
  return {
    id: d.id,
    nome: d.nome,
    instituicao: d.instituicao,
    tipo: d.tipo,
    modalidade: d.modalidade,
    status: d.status,
    notes: d.notes,
    principal: numOuNull(d.principal),
    taxaAm: numOuNull(d.taxaAm),
    prazoMeses: d.prazoMeses,
    sistema: d.sistema,
    indexador: d.indexador,
    primeiroVencimento: d.primeiroVencimento,
    saldoInicial: numOuNull(d.saldoInicial),
    dataSaldoInicial: d.dataSaldoInicial,
    pagamentos: d.pagamentos.map((p) => ({
      valor: num(p.valor),
      parcelaNumero: p.parcelaNumero,
      tipo: p.tipo,
      month: p.month,
    })),
  };
}

const ehFinanciamentoCompleto = (d: EntradaDivida): boolean =>
  d.modalidade === 'financiamento' &&
  d.principal != null &&
  d.taxaAm != null &&
  d.prazoMeses != null &&
  !!d.sistema &&
  !!d.primeiroVencimento;

/** Cronograma efetivo do app: sem as parcelas do fim cortadas por amortização com redução de prazo. */
export function cronogramaEfetivo(d: EntradaDivida): ParcelaCronograma[] {
  if (!ehFinanciamentoCompleto(d)) return [];
  const completo = gerarCronograma({
    principal: d.principal!,
    taxaAm: d.taxaAm!,
    prazoMeses: d.prazoMeses!,
    primeiroVencimento: d.primeiroVencimento!,
    sistema: d.sistema!,
  });
  const cortadas = Math.max(0, parcelasCortadasDe(d.pagamentos));
  return cortadas > 0 ? completo.slice(0, Math.max(0, completo.length - cortadas)) : completo;
}

/**
 * Juros até quitar pela fórmula fechada do Pedro, sobre o saldo de hoje e o prazo restante:
 * SAC = i·A·n(n+1)/2 (A = saldo/n); PRICE = PMT·n − saldo; parcelado = 0. Rotativo → null.
 */
export function jurosAteQuitar(
  sistema: SistemaDividaRelatorio,
  saldo: number,
  taxaAm: number,
  n: number,
): number | null {
  if (sistema === 'Rotativo') return null;
  if (sistema === 'Cartão parcelado' || !(n > 0) || !(saldo > 0)) return 0;
  if (sistema === 'SAC') {
    const a = saldo / n;
    return round2((taxaAm * a * n * (n + 1)) / 2);
  }
  if (Math.abs(taxaAm) < 1e-10) return 0;
  const pmt = (saldo * taxaAm) / (1 - Math.pow(1 + taxaAm, -n));
  return round2(pmt * n - saldo);
}

/** Sistema do relatório: rotativa; 'Cartão parcelado' só com taxa 0 e fora do Open Finance. */
export function sistemaDaDivida(d: EntradaDivida): SistemaDividaRelatorio {
  if (d.modalidade === 'rotativa') return 'Rotativo';
  if ((d.taxaAm ?? 0) === 0 && !ehImportacaoOpenFinance(d.notes)) return 'Cartão parcelado';
  return d.sistema === 'SAC' ? 'SAC' : 'PRICE';
}

/** Taxa a.m. conhecida (null = "taxa não informada": rotativa sem CET, Pluggy com taxa 0). */
function taxaConhecida(d: EntradaDivida, sistema: SistemaDividaRelatorio): number | null {
  if (d.taxaAm == null) return null;
  if (sistema === 'Cartão parcelado') return 0;
  return d.taxaAm > 0 ? d.taxaAm : null;
}

/** Item calculado + o que só serve aos avisos. */
export interface ItemDividaCalculado {
  item: ItemDividaRelatorio;
  /** Parcelas do cronograma vencidas antes do mês corrente e sem pagamento registrado. */
  vencidasSemPagamento: number;
}

/** Pura: uma dívida do relatório, no mês corrente `mesAtual` ('YYYY-MM'). */
export function calcularItemDivida(
  d: EntradaDivida,
  fatores: FatoresDivida,
  mesAtual: string,
): ItemDividaCalculado {
  const sistema = sistemaDaDivida(d);
  const resumo = resumoDivida(d, d.pagamentos);
  const financiamento = d.modalidade === 'financiamento';
  const saldo = round2(resumo.saldoDevedor * (financiamento ? fatores.acumulado : 1));
  const taxa = taxaConhecida(d, sistema);
  const ativa = d.status === 'ativa';

  let parcelaMes = 0;
  let quitacao: string | null = null;
  let vencidasSemPagamento = 0;
  const restantes = financiamento ? resumo.prazoRestanteMeses : null;

  if (financiamento) {
    const crono = cronogramaEfetivo(d);
    const linha = crono.find((p) => p.mes === mesAtual);
    if (ativa && linha) {
      const corrigida = isIndexadorCorrigivel(d.indexador)
        ? corrigirCronograma([linha], fatores.mensais)[0]
        : linha;
      parcelaMes = round2(corrigida.parcelaCorrigida ?? corrigida.parcela);
    }
    if (restantes != null && restantes > 0 && crono.length > 0) {
      // Última parcela do contrato; com parcelas vencidas sem pagamento registrado, o fim
      // escorrega para "mês atual + restantes − 1" (pagando uma por mês a partir de agora).
      const [a, m] = mesAtual.split('-').map(Number);
      const fimPagando = somarMeses(a, m - 1, restantes - 1);
      const fimPagandoYm = chaveMes(fimPagando.ano, fimPagando.mes0);
      const fimContrato = crono[crono.length - 1].mes;
      quitacao = fimPagandoYm > fimContrato ? fimPagandoYm : fimContrato;
    }
    if (ativa && resumo.parcelasPagas != null) {
      const vencidas = crono.filter((p) => p.mes < mesAtual).length;
      vencidasSemPagamento = Math.max(0, vencidas - resumo.parcelasPagas);
    }
  } else if (ativa) {
    parcelaMes = round2(saldo * MINIMO_ROTATIVO);
  }

  return {
    vencidasSemPagamento,
    item: {
      id: d.id,
      nome: d.nome,
      instituicao: d.instituicao,
      sistema,
      imobiliario: d.tipo === 'financiamento_imobiliario',
      status: d.status,
      saldo,
      cetAA: taxa === null ? null : round2(amToAa(taxa) * 100),
      parcelaMes,
      jurosMes: taxa === null ? null : round2(saldo * taxa),
      jurosAteQuitar: taxa === null ? null : jurosAteQuitar(sistema, saldo, taxa, restantes ?? 0),
      parcelasRestantes: restantes,
      quitacao: saldo > 0 ? quitacao : null,
    },
  };
}

/** Ordem da tabela: CET desc, sem CET no fim (estável entre iguais). */
export function ordenarPorCet(itens: ItemDividaRelatorio[]): ItemDividaRelatorio[] {
  return [...itens].sort((a, b) => {
    if (a.cetAA === null && b.cetAA === null) return 0;
    if (a.cetAA === null) return 1;
    if (b.cetAA === null) return -1;
    return b.cetAA - a.cetAA;
  });
}

/**
 * "Sem dívidas, fora o imóvel": o maior mês de quitação dos financiamentos não imobiliários em
 * aberto. 'com_rotativo' quando há rotativa em aberto (o mês ignora o rotativo, que não tem fim);
 * 'so_imovel' quando só o imóvel está em aberto; 'sem_dividas' sem nada em aberto.
 */
export function semDividasForaImovel(
  itens: ItemDividaRelatorio[],
): BlocoDividas['semDividasForaImovel'] {
  const abertos = itens.filter((i) => i.saldo > 0);
  if (abertos.length === 0) return { mes: null, motivo: 'sem_dividas' };
  const temRotativo = abertos.some((i) => i.sistema === 'Rotativo');
  const fora = abertos.filter((i) => !i.imobiliario && i.sistema !== 'Rotativo');
  const meses = fora.map((i) => i.quitacao).filter((m): m is string => m !== null);
  const mes = meses.length > 0 ? meses.reduce((a, b) => (b > a ? b : a)) : null;
  let motivo: MotivoSemDividasForaImovel;
  if (temRotativo) motivo = 'com_rotativo';
  else if (fora.length === 0) motivo = 'so_imovel';
  else motivo = 'ok';
  return { mes, motivo };
}

/**
 * CET médio ponderado pelo saldo (KPI do Pedro), em % a.a.: só as dívidas em aberto COM CET
 * (rotativa sem taxa e Pluggy com taxa 0 ficam fora da média). null sem nenhuma.
 */
export function cetMedioPonderado(itens: ItemDividaRelatorio[]): number | null {
  const comCet = itens.filter((i) => i.saldo > 0 && i.cetAA !== null);
  const saldo = comCet.reduce((a, i) => a + i.saldo, 0);
  if (!(saldo > 0)) return null;
  return round2(comCet.reduce((a, i) => a + i.saldo * (i.cetAA as number), 0) / saldo);
}

/** Pura: o bloco da seção 3 a partir das dívidas e dos fatores já carregados. */
export function montarBlocoDividas(
  dividas: { entrada: EntradaDivida; fatores: FatoresDivida }[],
  mesAtual: string,
): BlocoDividas {
  const calculados = dividas
    .filter(({ entrada }) => entrada.status !== 'quitada')
    .map(({ entrada, fatores }) => calcularItemDivida(entrada, fatores, mesAtual));
  const itens = ordenarPorCet(calculados.map((c) => c.item));
  return {
    itens,
    semDividasForaImovel: semDividasForaImovel(itens),
    avisos: {
      semCet: itens.filter((i) => i.saldo > 0 && i.cetAA === null).length,
      parcelasVencidasSemPagamento: calculados.reduce((a, c) => a + c.vencidasSemPagamento, 0),
    },
  };
}

// ── Loader ──────────────────────────────────────────────────────────────────────

async function fatoresDa(d: EntradaDivida, agora: Date): Promise<FatoresDivida> {
  if (d.modalidade !== 'financiamento' || !isIndexadorCorrigivel(d.indexador)) {
    return SEM_CORRECAO;
  }
  const crono = cronogramaEfetivo(d);
  const [acumulado, mensais] = await Promise.all([
    accruedIndexFactor(d.indexador, d.primeiroVencimento, agora),
    crono.length > 0
      ? monthlyIndexFactors(d.indexador, d.primeiroVencimento, crono[crono.length - 1].mes, agora)
      : Promise.resolve({}),
  ]);
  return { acumulado, mensais };
}

export async function montarDividas(ctx: ContextoMontador): Promise<BlocoDividas> {
  const rows = await ctx.insumos.dividasComPagamentos();
  const entradas = rows.map(entradaDaDivida).filter((d) => d.status !== 'quitada');
  const comFatores = await Promise.all(
    entradas.map(async (entrada) => ({ entrada, fatores: await fatoresDa(entrada, ctx.agora) })),
  );
  return montarBlocoDividas(comFatores, chaveMes(ctx.hojeSP.ano, ctx.hojeSP.mes0));
}
