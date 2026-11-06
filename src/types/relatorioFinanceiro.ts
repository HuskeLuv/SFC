/**
 * Contrato do Relatório financeiro (ticket 86e3yg90z), versão 1.
 *
 * Um objeto por geração, devolvido por GET /api/relatorios/financeiro?meses=1|3|6|12. Nomes do
 * Pedro (docs/relatorio-usuarios) + os campos que o protótipo calculava no front.
 *
 * Convenções:
 *  - Reais em `number` (R$, 2 casas no máximo); percentuais em % (10 = 10%), salvo indicação.
 *  - Meses como 'YYYY-MM' (`mes`) + `rotulo` 'Mmm/aa' quando o front precisa do texto.
 *  - Bloco que o plano não libera vem `null` (o servidor nem calcula). O front nunca decide o
 *    plano: lê `plano` e usa `temAcesso` de `@/lib/planos`.
 *
 * Só tipos: este arquivo é importado pelo front e pelo backend.
 */
import type { Plano } from '@/lib/planos';
import type { ResultadoIrpfAnual } from '@/services/ir/irpfAnual';

export type { Plano } from '@/lib/planos';

export const VERSAO_RELATORIO_FINANCEIRO = 1 as const;

/** Períodos aceitos pela rota. */
export const MESES_RELATORIO = [1, 3, 6, 12] as const;
export type MesesRelatorio = (typeof MESES_RELATORIO)[number];

/** Semáforo usado em todo o relatório (cores --good/--warn/--bad do Pedro). */
export type StatusSemaforo = 'good' | 'warn' | 'bad';

// ── Período ───────────────────────────────────────────────────────────────────

export interface PeriodoRelatorio {
  meses: MesesRelatorio;
  /** 'Novembro de 2026 (parcial, lançado até 06/11)' com n=1; 'Jun/26 a Nov/26 · 6 meses' senão. */
  rotulo: string;
  /** Primeiro mês do período, 'YYYY-MM'. */
  inicio: string;
  /** Mês corrente (em São Paulo), 'YYYY-MM'. */
  fim: string;
  /** O mês corrente sempre entra parcial. */
  parcial: true;
  /** Data de geração em SP, 'dd/mm' (CashflowValue não tem dia). */
  lancadoAte: string;
}

// ── 2 Orçamento (sempre) ────────────────────────────────────────────────────────

export type StatusCategoriaRelatorio = 'ok' | 'ritmo' | 'bad';

export interface CategoriaOrcamentoRelatorio {
  /** Chave canônica (templateName/abreviação): soma a mesma categoria entre anos e árvores. */
  chave: string;
  nome: string;
  orcado: number;
  realizado: number;
  status: StatusCategoriaRelatorio;
}

export type OrigemReceitaRelatorio = 'fluxo' | 'media3m' | 'vazio';

export interface MesOrcamentoRelatorio {
  /** 'YYYY-MM'. */
  mes: string;
  /** 'Mmm/aa'. */
  rotulo: string;
  /** false só no mês corrente (parcial). */
  fechado: boolean;
  receita: number;
  /** 'media3m' só no mês corrente; mês passado sem receita lançada = 0 e 'vazio'. */
  receitaOrigem: OrigemReceitaRelatorio;
  categorias: CategoriaOrcamentoRelatorio[];
}

export interface RitmoOrcamentoRelatorio {
  dia: number;
  diasNoMes: number;
  /** % do mês que já passou. */
  pctMes: number;
  /** % do orçado do mês já lançado (null sem orçado). */
  pctOrcadoLancado: number | null;
}

/** Bases dos meses FECHADOS (usadas pela saúde e pelos ganchos). */
export interface ReferenciaFechadaOrcamento {
  /** Média dos 3 últimos meses fechados. */
  receitaMedia3m: number;
  gastoMedio3m: number;
  /** Sobra do mês anterior fechado (null sem dado). */
  sobraMesAnterior: number | null;
}

export interface BlocoOrcamento {
  temOrcamento: boolean;
  /** Meses do período, do mais antigo ao corrente. */
  meses: MesOrcamentoRelatorio[];
  /** Ritmo do mês corrente (callout com n=1). */
  ritmo: RitmoOrcamentoRelatorio | null;
  referenciaFechada: ReferenciaFechadaOrcamento;
}

// ── 3 Dívidas (sempre) ──────────────────────────────────────────────────────────

export type SistemaDividaRelatorio = 'SAC' | 'PRICE' | 'Cartão parcelado' | 'Rotativo';

export interface ItemDividaRelatorio {
  id: string;
  nome: string;
  instituicao: string | null;
  sistema: SistemaDividaRelatorio;
  imobiliario: boolean;
  /** Status da dívida no app ('ativa', 'quitada', 'pausada'…). */
  status: string;
  /** Saldo CORRIGIDO pelo índice (como Carteira e Saúde). */
  saldo: number;
  /** CET a.a. em % (null = taxa não informada). */
  cetAA: number | null;
  /** Parcela do mês pelo cronograma do app (rotativa: 15% do saldo; pausada: 0). */
  parcelaMes: number;
  jurosMes: number | null;
  /** Fórmula fechada do Pedro; null no rotativo. */
  jurosAteQuitar: number | null;
  parcelasRestantes: number | null;
  /** Mês da última parcela, 'YYYY-MM'. */
  quitacao: string | null;
}

export type MotivoSemDividasForaImovel = 'ok' | 'so_imovel' | 'sem_dividas' | 'com_rotativo';

export interface BlocoDividas {
  itens: ItemDividaRelatorio[];
  semDividasForaImovel: {
    /** 'YYYY-MM' ou null. */
    mes: string | null;
    motivo: MotivoSemDividasForaImovel;
  };
  avisos: {
    /** Nº de dívidas sem CET informado. */
    semCet: number;
    /** Nº de parcelas vencidas sem pagamento registrado. */
    parcelasVencidasSemPagamento: number;
  };
}

// ── 4a Carteira (Pro) ───────────────────────────────────────────────────────────

export type ChaveClasseCarteira =
  | 'rendaFixa'
  | 'tesouro'
  | 'acoes'
  | 'fiis'
  | 'exterior'
  | 'reits'
  | 'outros';

export interface ClasseCarteiraRelatorio {
  chave: ChaveClasseCarteira;
  nome: string;
  valor: number;
}

export interface ValorMensal {
  /** 'YYYY-MM'. */
  mes: string;
  valor: number;
}

export interface BlocoCarteira {
  /** Data do último snapshot, 'YYYY-MM-DD' (null sem snapshot). */
  asOf: string | null;
  patrimonio: number;
  classes: ClasseCarteiraRelatorio[];
  nAtivos: number;
  nClasses: number;
  /** Fim de cada mês; com n=1 vêm 6 meses. */
  historico: ValorMensal[];
  /** Último snapshot − snapshot anterior ao período (null sem cobertura). */
  variacaoPeriodo: number | null;
  /** Compras − vendas no período (a MESMA função da seção 5). */
  aportesPeriodo: number;
  aportes: ValorMensal[];
  /**
   * 'processando': sem snapshot ou snapshot defasado (o backfill roda em background).
   * 'indisponivel': snapshot recente, mas longe das posições atuais; o backfill não resolve
   * (recalcula pelas transações), então não é disparado.
   */
  historicoStatus: 'ok' | 'processando' | 'indisponivel';
}

// ── 4b Carteira avançada (Advanced) ─────────────────────────────────────────────

export interface ProventosMesRelatorio {
  /** 'YYYY-MM'. */
  mes: string;
  fii: number;
  acao: number;
  jcp: number;
  exterior: number;
}

export interface BlocoCarteiraAvancada {
  /** Séries acumuladas no período, em %, todas começando em 0 na mesma data. */
  retornoDiario: {
    /** 'YYYY-MM-DD'. */
    datas: string[];
    carteira: number[];
    ibov: number[];
    cdi: number[];
    ipca: number[];
  };
  /** Acumulados no período em % (null = rentabilidade em processamento). */
  twr: number | null;
  cdi: number | null;
  ipca: number | null;
  ibov: number | null;
  proventos: ProventosMesRelatorio[];
  /** Fora da v1: o front mostra "em breve". */
  fgc: null;
  /** Fora da v1: o front mostra "em breve". */
  irRendaVariavel: null;
}

// ── 5 Planejamento (Pro) ────────────────────────────────────────────────────────

export interface PontoPlanejamentoRelatorio {
  /** 'YYYY-MM'. */
  mes: string;
  planejado: number | null;
  realizado: number | null;
  aporteProjetado: number | null;
  aporteRealizado: number | null;
  /** Rentabilidade do mês (TWR) em %. */
  rentabilidade: number | null;
}

export interface BlocoPlanejamento {
  temPlano: boolean;
  patrimonioRealizado: number;
  patrimonioPlanejadoHoje: number | null;
  /** Em R$ de hoje; `mes` 'YYYY-MM'. */
  metaIndependencia: { valor: number; mes: string } | null;
  /** Rentabilidade meta em % a.m. (null sem plano). */
  metaMensal: number | null;
  /** Com n=1 vêm 6 meses. */
  serie: PontoPlanejamentoRelatorio[];
}

// ── 6 Sonhos (Pro) ──────────────────────────────────────────────────────────────

export interface SonhoRelatorio {
  id: string;
  nome: string;
  prioridade: string;
  prazo: string;
  meta: number;
  acumulado: number;
  aporteMensal: number;
  aportadoPeriodo: number;
  /** 'YYYY-MM' ou null. */
  conclusao: string | null;
  status: StatusSemaforo;
  /** 'No ritmo' | 'Abaixo do ritmo' | 'Sem aporte há N meses' | 'Pausado'. */
  rotuloStatus: string;
  mesesSemAporte: number;
  /** Saldo no fim de cada mês; com n=1 vêm 6 meses. */
  historico: ValorMensal[];
}

// ── 7 Saúde (Advanced) ──────────────────────────────────────────────────────────

export type ChaveIndicadorSaude =
  | 'poupanca'
  | 'reserva'
  | 'comprometimento'
  | 'endividamento'
  | 'independencia'
  | 'rotativo';

export type BaseIndicadorSaude = 'fechados3m' | 'mesAnterior' | 'periodo';

export interface IndicadorSaudeRelatorio {
  chave: ChaveIndicadorSaude;
  /** null = '—' (fica fora da média da nota). */
  valor: number | null;
  valorFmt: string;
  /** Texto da meta ('≥ 20%', '≥ 6 meses', 'Não usar'…). */
  meta: string;
  status: StatusSemaforo | null;
  base: BaseIndicadorSaude;
}

export interface LinhaBalancoRelatorio {
  nome: string;
  valor: number;
}

export interface BlocoSaude {
  /** 0–100. */
  nota: number | null;
  status: StatusSemaforo | null;
  frase: string;
  indicadores: IndicadorSaudeRelatorio[];
  bens: LinhaBalancoRelatorio[];
  dividas: LinhaBalancoRelatorio[];
  /** 'YYYY-MM-DD'. */
  asOf: string;
  /** Fora da v1 (mini-gráfico da nota): sempre []. */
  historicoNota: [];
}

// ── 8 IR a restituir (Advanced) ─────────────────────────────────────────────────

export type OrigemRendaIr = 'simulacao' | 'lancado';

/** Recorte de ResultadoIrpfAnual (inclui o redutor em completo/simplificado, IRPFM e avisos). */
export type SimulacaoIrRelatorio = Pick<
  ResultadoIrpfAnual,
  | 'completo'
  | 'simplificado'
  | 'deducoesCompleto'
  | 'descontoSimplificado'
  | 'melhorModelo'
  | 'irDevido'
  | 'economiaCompletoVsSimplificado'
  | 'saldoAjuste'
  | 'limiteDoacoes'
  | 'avisos'
>;

export interface CondicaoIrRelatorio {
  chave: string;
  /** 'info' = ícone "i" do Pedro. */
  status: 'good' | 'warn' | 'info';
  titulo: string;
  descricao: string;
}

export interface PlanoPrevidenciaRelatorio {
  id: string;
  nome: string;
  /** Fora da v1: sempre null ('—'). */
  seguradora: string | null;
  cnpj: string | null;
  regime: string | null;
  tipo: 'pgbl' | 'vgbl' | null;
  nAportes: number;
  totalAno: number;
  saldoAtual: number;
}

export interface DeducaoIrRelatorio {
  chave: 'saude' | 'educacao' | 'dependentes' | 'previdencia' | 'pensao' | 'livroCaixa' | 'doacoes';
  valor: number;
  /** Linha fina ('teto atingido', '2 cadastrados'…). */
  nota: string | null;
}

export interface BlocoIr {
  ano: number;
  /** Ano corrente sem regra cadastrada: usa o último com regra e marca encerrado. */
  encerrado: boolean;
  rendaTributavel: number;
  rendaPartes: LinhaBalancoRelatorio[];
  rendaOrigem: OrigemRendaIr;
  limite12: number;
  aportado: number;
  nAportes: number;
  economia: number;
  economiaMaxima: number;
  faltaNoLimite: number;
  economiaFalta: number;
  /** null quando encerrado. */
  diasAte3112: number | null;
  simulacao: SimulacaoIrRelatorio;
  retidoNaFonte: number | null;
  restituicaoProjetada: number | null;
  condicoes: CondicaoIrRelatorio[];
  planos: PlanoPrevidenciaRelatorio[];
  deducoes: DeducaoIrRelatorio[];
}

/** Gancho do cartão de cadeado da seção 8 (só Basic e Pro). */
export interface IrGancho {
  ano: number;
  encerrado: boolean;
  rendaTributavel: number;
  rendaOrigem: OrigemRendaIr;
  /** economiaPotencial da simulação; o .gain some com ≤ 0 ou encerrado. */
  economiaMaxima: number;
  diasAte3112: number | null;
}

// ── Relatório ───────────────────────────────────────────────────────────────────

export interface RelatorioFinanceiro {
  versao: typeof VERSAO_RELATORIO_FINANCEIRO;
  /** Nome do cliente (o dono dos dados, também com consultor). */
  cliente: string;
  /** Preenchido SÓ quando um consultor gera pelo cliente. */
  consultor: string | null;
  plano: Plano;
  periodo: PeriodoRelatorio;
  /** ISO com -03:00. */
  geradoEm: string;
  orcamento: BlocoOrcamento;
  dividas: BlocoDividas;
  /** null no Basic. */
  carteira: BlocoCarteira | null;
  /** null no Basic e no Pro. */
  carteiraAvancada: BlocoCarteiraAvancada | null;
  /** null no Basic. */
  planejamento: BlocoPlanejamento | null;
  /** null no Basic. */
  sonhos: SonhoRelatorio[] | null;
  /** null no Basic e no Pro. */
  saude: BlocoSaude | null;
  /** null no Basic e no Pro. */
  ir: BlocoIr | null;
  /** Só no Basic e no Pro (null no Advanced). */
  irGancho: IrGancho | null;
}

/** Blocos que o plano pode travar (chaves de ACESSO_BLOCOS). */
export type BlocoBloqueavel =
  | 'carteira'
  | 'carteiraAvancada'
  | 'planejamento'
  | 'sonhos'
  | 'saude'
  | 'ir';

/** Resposta de GET /api/relatorios/financeiro/config. */
export interface RelatorioFinanceiroConfig {
  habilitado: boolean;
}
