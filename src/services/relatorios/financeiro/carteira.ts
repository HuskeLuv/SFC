/**
 * Seção 4a (Carteira: patrimônio, classes, histórico) do Relatório financeiro. Plano Pro.
 *
 *  - Valoração: a de buildSaudeFinanceira (insumo saudeBase), a mesma do /api/carteira/resumo.
 *    Patrimônio investido = Σ das classes, sem imóveis/bens, com o caixa para investir
 *    (= totais.dinheiro do resumo).
 *  - Classes: as 6 fatias do Pedro + "Outros" (cripto, previdência, opções); a reserva de caixa
 *    de cada aba entra na classe da aba, como no resumo, e o caixa livre em Renda fixa. Só as
 *    classes com valor > 0.
 *  - Histórico e variação: último snapshot diário de cada mês (portfolio_daily_snapshots).
 *  - Investimentos do período: compras − vendas por mês da carteira toda (aportesMensais, a
 *    mesma função da seção 5, mas sem os filtros de vínculo de aposentadoria/sonho), não a
 *    variação do totalInvested.
 *  - Sem cobertura de snapshots ou último snapshot defasado: 'processando', sem variação; o
 *    backfill em background (que regrava a série inteira) só roda sem consultor (com consultor
 *    nada é gravado).
 *  - Último snapshot recente que não bate com as posições atuais (mais de 10% e R$ 50 de
 *    diferença do patrimônio): 'indisponivel', sem histórico nem variação, para a folha não juntar
 *    o KPI de hoje com barras de outra base. Sem backfill: ele recalcula pelas transações e
 *    regravaria o mesmo valor a cada abertura.
 */
import type {
  BlocoCarteira,
  ChaveClasseCarteira,
  ClasseCarteiraRelatorio,
  ValorMensal,
} from '@/types/relatorioFinanceiro';
import type { SaudeFinanceiraPayload } from '@/services/saudeFinanceira/saudeFinanceiraServer';
import { triggerLazyBackfill } from '@/services/portfolio/portfolioSnapshotPersistence';
import type { ContextoMontador, SnapshotDiario } from './insumos';
import { mesesDaJanela } from './periodo';

/** Com n=1 o histórico mostra os últimos 6 meses (como o protótipo). */
export const MESES_HISTORICO_MINIMO = 6;

/** Último snapshot mais velho que isto: histórico 'processando'. */
const SNAPSHOT_DEFASADO_DIAS = 7;
const DIA_MS = 24 * 60 * 60 * 1000;

/** Diferença entre o último snapshot e o patrimônio atual acima da qual o histórico não vale. */
const DIVERGENCIA_MAX_PCT = 0.1;
const DIVERGENCIA_MIN_REAIS = 50;

/** O último snapshot não corresponde às posições atuais (puro). */
export function snapshotDiverge(ultimoValor: number, patrimonio: number): boolean {
  const diff = Math.abs(ultimoValor - patrimonio);
  return (
    diff > DIVERGENCIA_MIN_REAIS &&
    diff > DIVERGENCIA_MAX_PCT * Math.max(Math.abs(patrimonio), Math.abs(ultimoValor))
  );
}

export const NOMES_CLASSES: Record<ChaveClasseCarteira, string> = {
  rendaFixa: 'Renda fixa',
  tesouro: 'Tesouro Direto',
  acoes: 'Ações',
  fiis: 'FIIs',
  exterior: 'Exterior',
  reits: 'REITs',
  outros: 'Outros',
};

const ORDEM_CLASSES: ChaveClasseCarteira[] = [
  'rendaFixa',
  'tesouro',
  'acoes',
  'fiis',
  'exterior',
  'reits',
  'outros',
];

const round2 = (v: number) => Math.round(v * 100) / 100;

type BaseCarteira = Pick<SaudeFinanceiraPayload, 'porClasse' | 'caixa'>;

/**
 * As classes do relatório a partir da valoração da Saúde (puro). Inclui as classes zeradas, na
 * ordem do Pedro; quem exibe filtra.
 */
export function valoresPorClasse(base: BaseCarteira): Record<ChaveClasseCarteira, number> {
  const p = base.porClasse;
  const a = base.caixa.porAba;
  const caixaLivre = Math.max(0, base.caixa.bolso - base.caixa.reservado);
  return {
    rendaFixa:
      p.reservaEmergencia + p.reservaOportunidade + p.rendaFixaFundos + a.rendaFixa + caixaLivre,
    tesouro: p.tesouroDireto,
    acoes: p.acoes + p.etfs + p.fimFia + a.acoes + a.etf + a.fimFia,
    fiis: p.fiis + a.fii,
    exterior: p.stocks + p.etfsExterior + a.stocks,
    reits: p.reits + a.reit,
    outros:
      p.moedasCriptos +
      p.previdenciaSeguros +
      p.opcoes +
      a.moedasCriptos +
      a.previdenciaSeguros +
      a.opcoes,
  };
}

/** Classes com valor > 0, na ordem do Pedro. */
export function classesDaCarteira(base: BaseCarteira): ClasseCarteiraRelatorio[] {
  const v = valoresPorClasse(base);
  return ORDEM_CLASSES.filter((c) => v[c] > 0.004).map((chave) => ({
    chave,
    nome: NOMES_CLASSES[chave],
    valor: round2(v[chave]),
  }));
}

/** Patrimônio investido (= totais.dinheiro do /api/carteira/resumo). */
export function patrimonioInvestido(base: BaseCarteira): number {
  const v = valoresPorClasse(base);
  return round2(ORDEM_CLASSES.reduce((s, c) => s + v[c], 0));
}

const mesDoSnapshot = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

/** Último snapshot de cada mês ('YYYY-MM' → snapshot). Snapshots em ordem de data. */
export function ultimoSnapshotPorMes(snaps: SnapshotDiario[]): Map<string, SnapshotDiario> {
  const out = new Map<string, SnapshotDiario>();
  for (const s of snaps) out.set(mesDoSnapshot(s.date), s);
  return out;
}

/** Recorta a série mensal aos meses pedidos (0 no mês sem valor). */
export function recortarMeses(serie: ValorMensal[], meses: string[]): ValorMensal[] {
  const porMes = new Map(serie.map((v) => [v.mes, v.valor]));
  return meses.map((mes) => ({ mes, valor: porMes.get(mes) ?? 0 }));
}

export async function montarCarteira(ctx: ContextoMontador): Promise<BlocoCarteira> {
  const [base, snaps, aportes13m] = await Promise.all([
    ctx.insumos.saudeBase(),
    ctx.insumos.snapshots13m(),
    ctx.insumos.aportesCarteira13m(),
  ]);

  const classes = classesDaCarteira(base);
  const patrimonio = patrimonioInvestido(base);

  // Histórico: fim de cada mês (com n=1, os últimos 6 meses); mês sem snapshot fica de fora.
  const porMes = ultimoSnapshotPorMes(snaps);
  const mesesHistorico = mesesDaJanela(ctx.hojeSP, Math.max(ctx.meses, MESES_HISTORICO_MINIMO));
  const historico: ValorMensal[] = mesesHistorico.flatMap((mes) => {
    const s = porMes.get(mes);
    return s ? [{ mes, valor: round2(s.totalValue) }] : [];
  });

  // Variação: último snapshot − último snapshot antes do 1º mês do período.
  const ultimo = snaps.length > 0 ? snaps[snaps.length - 1] : null;
  const [ai, mi] = ctx.periodo.inicio.split('-').map(Number);
  const inicioPeriodoMs = Date.UTC(ai, mi - 1, 1);
  const anterior = [...snaps].reverse().find((s) => s.date.getTime() < inicioPeriodoMs) ?? null;

  const aportes = recortarMeses(aportes13m, ctx.mesesDoPeriodo);
  const aportesPeriodo = round2(aportes.reduce((s, a) => s + a.valor, 0));

  const defasado =
    ultimo === null ||
    ctx.agora.getTime() - ultimo.date.getTime() > SNAPSHOT_DEFASADO_DIAS * DIA_MS;
  const diverge = ultimo !== null && snapshotDiverge(ultimo.totalValue, patrimonio);
  const temCarteira = patrimonio > 0 || base.nPosicoes > 0;
  // Divergente com snapshot recente não vai para o backfill: ele recalcula pelas transações e
  // regravaria o mesmo valor a cada abertura do relatório.
  const historicoStatus: BlocoCarteira['historicoStatus'] =
    temCarteira && defasado ? 'processando' : diverge ? 'indisponivel' : 'ok';
  const variacaoPeriodo =
    ultimo && anterior && !diverge ? round2(ultimo.totalValue - anterior.totalValue) : null;
  if (historicoStatus === 'processando' && !ctx.comConsultor) {
    // Mesma exceção da Carteira: grava os snapshots em background para a próxima leitura.
    void triggerLazyBackfill(ctx.userId, ctx.agora); // nunca lança (loga e segue)
  }

  return {
    asOf: ultimo ? ultimo.date.toISOString().slice(0, 10) : null,
    patrimonio,
    classes,
    nAtivos: base.nPosicoes,
    nClasses: classes.length,
    historico: diverge ? [] : historico,
    variacaoPeriodo,
    aportesPeriodo,
    aportes,
    historicoStatus,
  };
}
