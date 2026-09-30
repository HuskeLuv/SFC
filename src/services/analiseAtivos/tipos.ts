/**
 * Tipos de domínio compartilhados da Análise de Ativos (Fase 0).
 *
 * Contrato da fatia 0 (docs/analise-ativos/fase0/spec-fase0.json → contratos.tiposTs): as fatias A–E
 * compilam contra estes nomes. Não renomear sem atualizar a spec.
 *
 * Convenções: datas civis como 'AAAA-MM-DD' (UTC); percentuais em pontos percentuais (6,4 = 6,4%);
 * três estados explícitos (ok | ausente | nao_se_aplica) — nunca comparar null com número.
 */
import type { PrismaClient } from '@prisma/client';
import type { ScoringParams } from '@/services/analiseAtivos/params/scoringParamsSchema';

export type { ScoringParams };

export type ClasseAnalise = 'acao' | 'fii' | 'stock' | 'reit';
export type FiiTipo = 'tijolo' | 'papel' | 'fof' | 'hibrido' | 'indefinido';
export type Regua = 'acao' | 'acao_financeira' | 'fii_tijolo' | 'fii_papel' | 'fora_do_indice';
export type TipoPeriodo = 'FY' | 'YTD' | '3M' | 'TTM'; // TTM = linha derivada gravada pela fatia A (regra 14)
export type Escopo = 'con' | 'ind';
export type PadraoContabil = 'IFRS' | 'BRGAAP' | 'USGAAP';
export type ClasseTitulo = 'ON' | 'PN' | 'UNIT';

// Três estados (regra 1). Zero é ok com valor 0.
export type MotivoAusente =
  | 'sem_dado_fonte'
  | 'fonte_falhou'
  | 'fonte_defasada'
  | 'historico_curto'
  | 'controladora_zero'
  | 'sem_preco'
  | 'sem_acoes'
  | 'sem_data_com'
  | 'outro';
export type MotivoNaoSeAplica =
  | 'financeira'
  | 'fof'
  | 'receita_nao_positiva'
  | 'receita_menor_que_lucro'
  | 'base_nao_positiva'
  | 'sem_fonte_estruturada'
  | 'criterio_desligado'
  | 'papel_sem_imoveis'
  | 'fora_do_escopo';
export type Valor<T = number> =
  | { estado: 'ok'; valor: T }
  | { estado: 'ausente'; motivo: MotivoAusente; detalhe?: string }
  | { estado: 'nao_se_aplica'; motivo: MotivoNaoSeAplica; detalhe?: string };

export type StatusCriterio = 'atende' | 'parcial' | 'nao_atende' | 'nao_se_aplica' | 'sem_dado';
export interface CheckSemaforo {
  codigo: string;
  status: StatusCriterio;
  valor: number | null;
  referencia: number | [number, number] | null;
  provisorio?: boolean;
  motivo?: string;
}

export type EstadoComponente =
  | { estado: 'calculado'; nota: number; metrica: number }
  | { estado: 'zero_regra'; nota: 0; motivo: 'prejuizo' | 'pl_nao_positivo' }
  | { estado: 'ausente'; nota: 0; motivo: MotivoAusente }
  | { estado: 'nao_se_aplica'; motivo: MotivoNaoSeAplica };
export type NomeComponente = 'lucro' | 'divida' | 'rent' | 'div' | 'preco';
export interface ResultadoIndice {
  indice: Valor<number>;
  componentes: Record<NomeComponente, EstadoComponente>;
  pesosEfetivos: Partial<Record<NomeComponente, number>>;
  incompleto: boolean;
  motivosIncompleto: string[];
}

export interface FundamentosPeriodo {
  emissorId: string;
  docTipo: 'DFP' | 'ITR';
  tipoPeriodo: TipoPeriodo;
  escopo: Escopo;
  padraoContabil: PadraoContabil;
  dtIni: string;
  dtFim: string;
  anoFiscal: number;
  trimestreFiscal: number | null;
  versao: number;
  dtEntregaOriginal: string;
  receita: number | null;
  lucroBruto: number | null;
  ebit: number | null;
  depreciacaoAmortizacao: number | null;
  lucroLiquido: number | null;
  lucroAtribuivel: number | null;
  /**
   * Lucro atribuível do escopo INDIVIDUAL do mesmo documento, preenchido só quando o escopo escolhido
   * é o consolidado com 'controladora_zero' (regra 12): no individual o lucro é todo da controladora
   * (CXSE3 FY2023/2024). Usado na sequência de anos com lucro; nunca nos múltiplos.
   */
  lucroAtribuivelIndividual?: number | null;
  ativoTotal: number | null;
  ativoCirculante: number | null;
  passivoCirculante: number | null;
  caixa: number | null;
  aplicacoesFinanceiras: number | null;
  dividaBrutaCp: number | null;
  dividaBrutaLp: number | null;
  pl: number | null;
  plControladora: number | null;
  fco: number | null;
  fci: number | null;
  fcf: number | null;
  capex: number | null;
  dividendosJcpPagos: number | null;
  dmplDeclarado: number | null;
  lpaOn: number | null;
  lpaPn: number | null;
  naoSeAplica: string[];
  flags: string[];
}
// regra 13 (salto sem evento) é flag da fatia D, não status gravado pela A
export interface ContagemAcoes {
  cnpj: string;
  data: string;
  on: number | null;
  pn: number | null;
  total: number | null;
  fonte: string;
  razaoLpa: number | null;
  status: 'ok' | 'alerta' | 'nao_verificavel';
}
export interface TickerAcao {
  symbol: string;
  cnpj: string;
  classeTitulo: ClasseTitulo;
  unitQtdOn: number | null;
  unitQtdPn: number | null;
}
export interface EmissorInfo {
  cnpj: string;
  nome: string;
  mesFimExercicio: number | null;
  raizes: string[];
  setor: string | null;
  subsetor: string | null;
  segmento: string | null;
  segmentoListagem: string | null;
  ehFinanceira: boolean;
  ehBanco: boolean;
  escopoPreferido: Escopo;
}
export interface TickerFii {
  symbol: string;
  cnpj: string;
  conferido: boolean;
  origem: 'b3_isin' | 'b3_nome' | 'manual';
}
export interface ItemUniverso {
  symbol: string;
  classe: ClasseAnalise;
  cnpj: string;
  negociadoUltimos30: boolean;
  baixaLiquidez: boolean | null;
  conferido: boolean;
}
export interface CotacaoDia {
  symbol: string;
  date: string;
  closeRaw: number;
  volumeFin: number;
  negocios: number;
  codBdi: string;
}
export interface ResumoCotacao {
  symbol: string;
  ultimoPregao: string;
  closeRaw: number;
  volumeMedio21: number;
  pregoesComNegocio21: number;
  baixaLiquidez: boolean;
  negociadoUltimos30: boolean;
}
export interface FiiMes {
  cnpj: string;
  refMonth: string;
  vpCota: number | null;
  pl: number | null;
  cotas: number | null;
  cotistas: number | null;
  passivoTotal: number | null;
  rendDistribuir: number | null;
  imoveis: number | null;
  spe: number | null;
  cri: number | null;
  lciLca: number | null;
  cotasFii: number | null;
  tipoComposicao: FiiTipo | null;
  tipoVigente: FiiTipo | null;
  reguaVigente: Regua | null;
  obrigacoesPlPct: number | null;
  segmentoCvm: string | null;
  fatorDesdobramento: number | null;
  flags: string[];
}
export interface FiiTrimestre {
  cnpj: string;
  refQuarter: string;
  nImoveisRenda: number | null;
  areaM2: number | null;
  vacanciaFisicaCvmPct: number | null;
  inadimplenciaCvmPct: number | null;
  nCri: number | null;
  maiorCriPct: number | null;
  flags: string[];
}
/**
 * BRAPI: pagamento=date, ex=dataCom · YAHOO: date É a data EX (dataCom null em 2.863/2.863 linhas do
 * dev), pagamento=null — conversão feita em repositorio.proventos pela convenção de
 * params.sanidade.proventos.camposPorFonte.
 */
export interface ProventoBruto {
  id: string;
  symbol: string;
  source: string;
  tipo: string;
  valor: number;
  dataPagamento: string | null;
  dataExGravada: string | null;
  dataExOrigem: 'dataCom' | 'date' | null;
}
export type CoberturaProventos = 'OK' | 'EMPTY' | 'FETCH_FAIL' | 'GAP_QUEUED' | null;
export interface ProventoAuditado {
  origemId: string;
  symbol: string;
  tipoNormalizado: 'DIVIDENDO' | 'JCP' | 'RENDIMENTO' | 'AMORTIZACAO' | 'REST_CAP' | 'OUTRO';
  valor: number;
  dataPagamento: string | null;
  dataComReal: string | null;
  status: 'valido' | 'duplicata' | 'tipo_excluido' | 'sem_data_com' | 'fonte_secundaria_descartada';
  duplicataDe: string | null;
  fatorAjusteHoje: number;
  flags: string[];
}
export interface EventoCorporativoBruto {
  id: string;
  symbol: string;
  date: string;
  type: string;
  factor: number;
  source: string;
}
export interface EventoCorporativoVerificado {
  symbol: string;
  dataEvento: string;
  fator: number;
  tipo: 'DESDOBRAMENTO' | 'GRUPAMENTO' | 'BONIFICACAO';
  anoBase: number;
  status: 'confirmado' | 'descartado' | 'nao_validavel' | 'emissao_recompra';
  razaoCvm: number | null;
  idsOrigem: string[];
}
export interface EntregaDocumento {
  cnpj: string;
  docTipo: 'DFP' | 'ITR';
  dtFim: string;
  anoFiscal: number;
  trimestreFiscal: number | null;
  dtEntregaOriginal: string;
}

export type NomeJob =
  | 'b3-cadastro'
  | 'fii-cadastro'
  | 'cvm-cias:fca'
  | 'cvm-cias:dfp'
  | 'cvm-cias:itr'
  | 'cvm-ipe'
  | 'fii-mensal'
  | 'fii-trimestral'
  | 'cotahist'
  | 'scores'
  | `backfill:${string}`;
export interface AlertaJob {
  codigo: string;
  nivel: 'info' | 'aviso' | 'erro';
  mensagem: string;
  ref?: string;
}
export interface JobContexto {
  prisma: PrismaClient;
  prazo: number;
  restanteMs(): number;
  estourouPrazo(): boolean;
  alertar(a: AlertaJob): void;
  contar(campo: 'linhasLidas' | 'linhasGravadas' | 'rejeitadas', n?: number): void;
  params: ScoringParams;
  paramsVersion: number;
  hoje: string;
  origem: 'cron' | 'script';
  aplicar: boolean;
}
export interface ResultadoJob {
  parcial?: boolean;
  detalhes?: Record<string, unknown>;
}
export interface RelatorioJob {
  id: string;
  job: NomeJob;
  status: 'ok' | 'parcial' | 'falha' | 'pulado';
  duracaoMs: number;
  linhasLidas: number;
  linhasGravadas: number;
  rejeitadas: number;
  alertas: AlertaJob[];
  rssPicoMb: number;
  erro?: string;
}
// movido da fatia E para cá (E e repositorio.jobs usam)
export type Camada =
  | 'cotacoes'
  | 'fundamentos_dfp'
  | 'fundamentos_itr'
  | 'fii_mensal'
  | 'fii_trimestral'
  | 'cadastro_b3'
  | 'cadastro_fii'
  | 'eventos'
  | 'scores';
