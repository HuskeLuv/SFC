/**
 * Seção 7 (Saúde financeira) do Relatório financeiro. Plano Advanced.
 *
 * Fase 2 do orquestrador (pura): roda depois da fase 1, com os blocos já montados.
 *
 * Bases que não dependem do mês parcial (o mês corrente nunca entra):
 *  - Poupança: sobra ÷ receita dos meses FECHADOS do período; com n=1 (só o mês parcial no
 *    bloco do orçamento), a média dos 3 últimos meses fechados.
 *  - Reserva: reserva de emergência ÷ gasto médio dos 3 últimos meses fechados.
 *  - Comprometimento: parcelas do mês (seção 3) ÷ receita média dos 3 fechados.
 *  - Endividamento: dívidas ÷ bens do balanço.
 *  - Independência: proventos por mês ÷ gastos por mês, médias dos 3 fechados.
 *  - Rotativo: existe rotativo com saldo.
 * Sem gasto nos 3 fechados: o indicador que depende dele fica '—' e fora da média.
 * Nota pela régua provisória (notaSaude). Metas do Pedro (podem diferir da tela Saúde).
 */
import type {
  BlocoCarteiraAvancada,
  BlocoDividas,
  BlocoOrcamento,
  BlocoSaude,
  ChaveIndicadorSaude,
  IndicadorSaudeRelatorio,
  LinhaBalancoRelatorio,
  ProventosMesRelatorio,
  StatusSemaforo,
} from '@/types/relatorioFinanceiro';
import type { SaudeFinanceiraPayload } from '@/services/saudeFinanceira/saudeFinanceiraServer';
import { notaSaude, PONTOS_STATUS } from '@/services/saudeFinanceira/notaSaude';
import { fP } from '@/components/relatorios/financeiro/formato';
import type { ContextoMontador } from './insumos';
import { patrimonioInvestido } from './carteira';
import { proventosDaJanelaCarregados } from './carteiraAvancada';
import { mesesDaJanela } from './periodo';

export interface EntradaSaude {
  ctx: ContextoMontador;
  /** insumos.saudeBase() já resolvido. */
  saudeBase: SaudeFinanceiraPayload;
  orcamento: BlocoOrcamento;
  dividas: BlocoDividas;
  /** Proventos para o indicador de independência (montado no Advanced, que é quem vê a saúde). */
  carteiraAvancada: BlocoCarteiraAvancada | null;
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const TRACO = '—';

const META: Record<ChaveIndicadorSaude, string> = {
  poupanca: '≥ 20%',
  reserva: '≥ 6 meses',
  comprometimento: '≤ 30%',
  endividamento: '≤ 30%',
  independencia: '100%',
  rotativo: 'Não usar',
};

/** Como o indicador aparece na frase da nota. */
const NOME_NA_FRASE: Record<ChaveIndicadorSaude, string> = {
  poupanca: 'o índice de poupança',
  reserva: 'a reserva de emergência',
  comprometimento: 'o comprometimento da renda',
  endividamento: 'o endividamento',
  independencia: 'a independência financeira',
  rotativo: 'o uso do rotativo',
};

const fMeses = (v: number) =>
  `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} meses`;

const gastoDoMes = (m: BlocoOrcamento['meses'][number]) =>
  m.categorias.reduce((s, c) => s + c.realizado, 0);

/** Os 3 últimos meses fechados ('YYYY-MM'), do mais antigo ao mais novo. */
const fechados3m = (ctx: ContextoMontador) => mesesDaJanela(ctx.hojeSP, 4).slice(0, 3);

function indicador(
  chave: ChaveIndicadorSaude,
  valor: number | null,
  status: StatusSemaforo | null,
  base: IndicadorSaudeRelatorio['base'],
  formatar: (v: number) => string = (v) => fP(v),
): IndicadorSaudeRelatorio {
  return {
    chave,
    valor: valor === null ? null : round2(valor),
    valorFmt: valor === null ? TRACO : formatar(valor),
    meta: META[chave],
    status: valor === null ? null : status,
    base,
  };
}

/** Balanço: Investimentos, cada imóvel/bem, Saldo em contas; dívidas da seção 3. */
export function balancoSaude(
  saudeBase: SaudeFinanceiraPayload,
  dividas: BlocoDividas,
): { bens: LinhaBalancoRelatorio[]; dividas: LinhaBalancoRelatorio[] } {
  const caixa = saudeBase.caixa.bolso;
  const bens: LinhaBalancoRelatorio[] = [
    { nome: 'Investimentos', valor: round2(patrimonioInvestido(saudeBase) - caixa) },
    ...saudeBase.imoveisBens.map((b) => ({ nome: b.nome, valor: round2(b.valor) })),
  ];
  if (caixa > 0) bens.push({ nome: 'Saldo em contas', valor: round2(caixa) });
  const linhasDividas = dividas.itens
    .filter((d) => d.status !== 'quitada' && d.saldo > 0)
    .map((d) => ({ nome: d.nome, valor: round2(d.saldo) }));
  return { bens, dividas: linhasDividas };
}

/** Proventos médios por mês dos 3 últimos meses fechados (null sem nenhum dos 3 meses). */
function proventosMedios3m(
  ctx: ContextoMontador,
  carteiraAvancada: BlocoCarteiraAvancada | null,
): number | null {
  const meses = new Set(fechados3m(ctx));
  const fonte: ProventosMesRelatorio[] =
    proventosDaJanelaCarregados(ctx.insumos) ?? carteiraAvancada?.proventos ?? [];
  const linhas = fonte.filter((p) => meses.has(p.mes));
  if (linhas.length === 0) return null;
  const total = linhas.reduce((s, p) => s + p.fii + p.acao + p.jcp + p.exterior, 0);
  return total / 3;
}

/** Os 6 indicadores (puro). */
export function indicadoresRelatorio(entrada: EntradaSaude): IndicadorSaudeRelatorio[] {
  const { ctx, saudeBase, orcamento, dividas, carteiraAvancada } = entrada;
  const ref = orcamento.referenciaFechada;
  const temGasto3m = ref.gastoMedio3m > 0;
  const temReceita3m = ref.receitaMedia3m > 0;

  // Poupança
  let poupanca: IndicadorSaudeRelatorio;
  if (ctx.meses > 1) {
    const fechados = orcamento.meses.filter((m) => m.fechado);
    const receita = fechados.reduce((s, m) => s + m.receita, 0);
    const sobra = fechados.reduce((s, m) => s + m.receita - gastoDoMes(m), 0);
    const v = receita > 0 ? (sobra / receita) * 100 : null;
    poupanca = indicador('poupanca', v, statusPoupanca(v), 'periodo');
  } else {
    const v = temReceita3m
      ? ((ref.receitaMedia3m - ref.gastoMedio3m) / ref.receitaMedia3m) * 100
      : null;
    poupanca = indicador('poupanca', temGasto3m ? v : null, statusPoupanca(v), 'fechados3m');
  }

  // Reserva de emergência em meses de gasto
  const reservaMeses = temGasto3m ? saudeBase.porClasse.reservaEmergencia / ref.gastoMedio3m : null;
  const reserva = indicador(
    'reserva',
    reservaMeses,
    reservaMeses === null ? null : reservaMeses >= 6 ? 'good' : reservaMeses >= 3 ? 'warn' : 'bad',
    'fechados3m',
    fMeses,
  );

  // Comprometimento da renda
  const abertas = dividas.itens.filter((d) => d.status !== 'quitada');
  const parcelas = abertas.reduce((s, d) => s + d.parcelaMes, 0);
  const comp = temReceita3m ? (parcelas / ref.receitaMedia3m) * 100 : null;
  const comprometimento = indicador(
    'comprometimento',
    comp,
    comp === null ? null : comp <= 30 ? 'good' : 'bad',
    'fechados3m',
  );

  // Endividamento (balanço)
  const bal = balancoSaude(saudeBase, dividas);
  const totalBens = bal.bens.reduce((s, b) => s + b.valor, 0);
  const totalDividas = bal.dividas.reduce((s, d) => s + d.valor, 0);
  const endiv = totalBens > 0 ? (totalDividas / totalBens) * 100 : null;
  const endividamento = indicador(
    'endividamento',
    endiv,
    endiv === null ? null : endiv <= 30 ? 'good' : 'bad',
    'periodo',
  );

  // Independência financeira
  const prov = proventosMedios3m(ctx, carteiraAvancada);
  const indep = temGasto3m && prov !== null ? (prov / ref.gastoMedio3m) * 100 : null;
  const independencia = indicador(
    'independencia',
    indep,
    indep === null ? null : indep >= 100 ? 'good' : 'warn',
    'fechados3m',
  );

  // Rotativo
  const usaRotativo = abertas.some((d) => d.sistema === 'Rotativo' && d.saldo > 0);
  const rotativo = indicador(
    'rotativo',
    usaRotativo ? 1 : 0,
    usaRotativo ? 'bad' : 'good',
    'periodo',
    (v) => (v > 0 ? 'Sim' : 'Não'),
  );

  return [poupanca, reserva, comprometimento, endividamento, independencia, rotativo];
}

function statusPoupanca(v: number | null): StatusSemaforo | null {
  if (v === null) return null;
  if (v < 0) return 'bad';
  return v >= 20 ? 'good' : 'warn';
}

const ADJETIVO: Record<StatusSemaforo, string> = {
  good: 'boa',
  warn: 'pede atenção',
  bad: 'em alerta',
};

/** Frase da nota: o melhor e o pior indicador disponível. */
export function fraseSaude(
  status: StatusSemaforo | null,
  indicadores: IndicadorSaudeRelatorio[],
): string {
  const disponiveis = indicadores.filter((i) => i.valor !== null && i.status !== null);
  if (status === null || disponiveis.length === 0) {
    return 'Ainda não há dados suficientes para calcular a sua nota.';
  }
  const ordem = [...disponiveis].sort(
    (a, b) => PONTOS_STATUS[b.status as StatusSemaforo] - PONTOS_STATUS[a.status as StatusSemaforo],
  );
  const melhor = ordem[0];
  const pior = ordem[ordem.length - 1];
  const inicio =
    status === 'warn'
      ? 'Sua saúde financeira pede atenção'
      : `Sua saúde financeira está ${ADJETIVO[status]}`;
  if (pior.status === 'good') {
    return `${inicio}: todos os indicadores disponíveis estão dentro da meta.`;
  }
  const ponto = pior.status === 'bad' ? 'alerta' : 'atenção';
  const fraco = `O ponto de ${ponto} é ${NOME_NA_FRASE[pior.chave]} (${pior.valorFmt}).`;
  if (melhor.status !== 'good') return `${inicio}. ${fraco}`;
  return `${inicio}: seu ponto forte é ${NOME_NA_FRASE[melhor.chave]} (${melhor.valorFmt}). ${fraco}`;
}

/**
 * O rotativo sempre tem valor (Sim/Não). Sozinho ele não sustenta uma nota: sem nenhum outro
 * indicador com base real (usuário sem fluxo fechado, sem bens), a nota fica null e a frase cai
 * em "Ainda não há dados suficientes".
 */
function temBaseParaNota(indicadores: IndicadorSaudeRelatorio[]): boolean {
  return indicadores.some((i) => i.chave !== 'rotativo' && i.valor !== null && i.status !== null);
}

export function montarSaude(entrada: EntradaSaude): BlocoSaude {
  const indicadores = indicadoresRelatorio(entrada);
  const { nota, status } = temBaseParaNota(indicadores)
    ? notaSaude(indicadores)
    : { nota: null, status: null };
  const bal = balancoSaude(entrada.saudeBase, entrada.dividas);
  const h = entrada.ctx.hojeSP;
  return {
    nota,
    status,
    frase: fraseSaude(status, indicadores),
    indicadores,
    bens: bal.bens,
    dividas: bal.dividas,
    asOf: `${h.ano}-${String(h.mes0 + 1).padStart(2, '0')}-${String(h.dia).padStart(2, '0')}`,
    historicoNota: [],
  };
}
