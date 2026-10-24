/**
 * Fundamentos · Essencial da página do ativo (fatia C). Só o banco: nenhuma fonte externa.
 *
 * - Até 10 anos FECHADOS (o ano corrente fica fora, series.anosFechados) + a linha 'Últ. 12m'
 *   quando há período mais recente que o último ano fechado. O último ano fechado vem marcado em
 *   `ultimoAno` (v2.4: no lugar de `destaque`; a tela usa data-ultimo-ano).
 * - Ações (v2.4, fatia C2 — ordem do HTML do Pedro, valores em R$ bi): Ano | Receita líq. | EBITDA |
 *   Lucro líq. ⓘ | Margem líq. ⓘ | Dívida líq. ⓘ | Dív. líq./EBITDA | FCL/CAPEX ⓘ | ROE | LPA |
 *   Div./ação | Payout | P/L | P/VP | DY. EBITDA = EBIT + D&A; dívida líquida = dívida bruta (CP +
 *   LP) − caixa − aplicações; FCL/CAPEX = (FCO − CAPEX) ÷ CAPEX (NUNCA o campo fcf); margem =
 *   lucro ÷ receita quando o múltiplo do ano não vem. Lucro = atribuível à controladora (D2: a CVM
 *   não publica o lucro sem itens não recorrentes; consolidado com 'controladora_zero' ⇒ o do
 *   individual, regra 12; sem individual ⇒ '—' com o motivo). Div./ação dos anos marcados por
 *   detectarSaltoProvento (DPA > 2× o ano anterior) leva o selo 'proventos em conferência'.
 *   Bancos/financeiras (D4): receita e margem aparecem; EBITDA, dívida líquida, Dív. líq./EBITDA e
 *   FCL/CAPEX não se aplicam (as colunas saem) e a nota diz o padrão contábil (individual BR GAAP).
 *   O layout v2.4 sai com `{ layout: 'v24' }` (obterFundamentosEssencial). Sem a opção, o layout
 *   LEGADO (R$ mi, receita e margem de banco 'não se aplica', colunas de antes) continua: é a base
 *   que o Raio-X (leitura/ativo/raioX.ts, Bloco D) lê linha a linha — fora desta fatia.
 * - FIIs tijolo/híbrido: Ano | Receita | Resultado | Rend./cota | DY | VP/cota | P/VP | Vacância |
 *   Nº imóveis | Área (CVM). Papel: Nº CRIs | Maior CRI no lugar das 3 últimas. Receita e resultado
 *   = soma dos 4 trimestres do informe; ano com menos de 4 trimestres = '—' com nota. Valores por
 *   cota anteriores a um desdobramento são levados à base de cotas de hoje.
 *
 * Bloco C (fatia B, só flags 'conf:' = params v2): a política de conferenciasAtivo vale célula a
 * célula — 'ocultar' = ausente('em_conferencia:<grupo>') com o número só em valorNaoPublicado
 * (célula hachurada na tela); 'selo' = valor + selo 'em_conferencia' na linha. Linha 'Últ. 12m'
 * pelas flags da linha do Quadro; anos pelas flags do ano (histórico e escala dos demonstrativos,
 * com o ano na chave — AssetMultiplesYearly.flags e a própria linha).
 *
 * As funções `montar*` são puras (testadas com os casos da spec); `obterFundamentosEssencial` lê o
 * banco e guarda o resultado em memória por ticker:versão do Quadro (TTL 30 min).
 *
 * v2.5 (fatia B; desenho final.mudancas_por_item "Financeiras" e "7 · Lucro descontado") — só o
 * layout 'v24' (o legado, base do Raio-X, fica igual):
 * - 'Lucro descontado' e 'Margem descontada' (§3.2): por CÉLULA, o net_income_adjusted aprovado de
 *   um provedor (camada de fontes: lerPontosVigentes + resolverSeries, pela prioridade dos params)
 *   quando existe; senão o lucro líquido dos controladores com a marca `fallback` (ⓘ com o tooltip
 *   de textosAtivo.essencial.tooltips.fallbackLucro/fallbackMargem). A margem usa o mesmo numerador
 *   da célula de lucro. Ponto incompleto da fonte = marca `incompleto` + selo 'dados incompletos'.
 * - Financeiras (params v2: naoSeAplica vazio): as 14 colunas da §3.2 na ordem, com '—' e o tooltip
 *   'sem dado nas demonstrações' onde falta dado (banco: EBITDA/DL nulos; holding de layout
 *   industrial: com valor). Religar o D4 por params (naoSeAplica com ebitda/dl/fcl) volta o
 *   'não se aplica' dessas colunas; notaFinanceira só com acao_financeira.notaEssencial.
 * - Receita ≤ 0 = '—' com o mesmo tooltip (nunca 'não se aplica'); receita ≤ lucro segue
 *   criterios.margem.receitaMenorQueLucro ('valor' na v2 = literal da spec; 'sem_dado' = '—').
 * - Nota de fonte montada pelas origens (textoFonte: 'Fonte: ‹provedor› · DFP/ITR (CVM).') no
 *   lugar do 'fonte: CVM' fixo da linha de unidade.
 *
 * A6 (fatia B; ANALISE_ATIVOS_TEMPLATES_FINANCEIRAS_HABILITADO): banco (segmento B3 'Bancos') e
 * seguradora ('Seguradoras'/'Resseguradoras') ganham o template próprio — colunas
 * COLUNAS_ESSENCIAL_BANCO/SEGURADORA com os textos de textosFinanceiras, FundamentosResposta.template
 * e ColunaFundamentos.tooltip (qual receita a seguradora usou) — nos DOIS layouts (v24 da página e o
 * legado, base do Raio-X: regra de ouro). Anos, 'Últ. 12m', ROE/payout/DY/P/L/P/VP e a conferência
 * são os de sempre. Chave desligada (ou outro emissor) ⇒ a resposta de hoje, sem a chave template.
 *
 * fundamentei-regras (F2; desenho docs/analise-ativos/fundamentei-regras/desenho.json) — só com
 * `essencialV2` (ANALISE_ATIVOS_ESSENCIAL_V2_HABILITADO, lida em obterFundamentosEssencial; nenhum
 * job lê): um lucro líquido só ('Lucro líquido'/'Margem líquida', sem descontado nem ⓘ de fallback,
 * A4.e); anos fechados por dtFim com o rótulo 'fev/2026' e a nota do exercício fora de dezembro
 * (A4.c); 'L' (rotuloCurto, tooltip 'prejuízo no período') no payout e no P/L com prejuízo (A4.a);
 * banco com PDD ÷ lucro em % (A5); o salto de provento lê o payoutPct do ano (o da scoring que
 * calculou). Sem a chave, a resposta é a de hoje. O tooltip do payout ('proventos pagos …') segue SÓ
 * a payout.regra da scoring vigente (`regraPayout`), nunca a chave: com 'dmpl_dpa' nada muda.
 */
import { prisma } from '@/lib/prisma';
import { getTtlCache } from '@/lib/simpleTtlCache';
import { CRITERIA_PARAMS_CODIGO } from '@/services/analiseAtivos/params/criteriaParamsCodigo';
import {
  fontesEfetivas,
  type CriteriaParams,
} from '@/services/analiseAtivos/params/criteriaParamsSchema';
import { resolverSeries } from '@/services/analiseAtivos/fontes/fundamentos/resolverSeries';
import { rotulosFontes } from '@/services/analiseAtivos/fontes/fundamentos/registro';
import { lerPontosVigentes } from '@/services/analiseAtivos/repositorio/fontesFundamentos';
import { textoNotaFonte, type RotulosFonte } from '@/services/analiseAtivos/textosCriterios';
import { fundamentosVigentes } from '@/services/analiseAtivos/repositorio/acoes';
import { paraData, paraNumero } from '@/services/analiseAtivos/repositorio/conversao';
import { lucroParaSequencia } from '@/services/analiseAtivos/regras/calculo/sequencias';
import { proventosEmConferencia } from '@/services/analiseAtivos/regras/calculo/plausibilidadeProventos';
import {
  obterCriteriaParamsQuadro,
  obterLinhaQuadro,
  versaoQuadro,
} from '@/services/analiseAtivos/leitura/linhasQuadro';
import {
  CAMPO_COLUNA_FUNDAMENTOS,
  aplicarConferenciaCampo,
  flagsAnuaisConf,
} from '@/services/analiseAtivos/leitura/ativo/conferenciasAtivo';
import { formatarFlagConf } from '@/services/analiseAtivos/regras/comum/conferencia';
import {
  conferirVacancia,
  liberadaPor,
  type VacanciaEmConferencia,
} from '@/services/analiseAtivos/regras/fii/saneamentoVacancia';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import { obterScoringParams } from '@/services/analiseAtivos/params/obterScoringParams';
import {
  regrasCalculoDe,
  type RegraPayout,
} from '@/services/analiseAtivos/params/scoringParamsSchema';
import { liberacoesVacancia } from '@/services/analiseAtivos/repositorio/curadoria';
import {
  anosPerShareEmConferencia,
  aplicarPerShareNosCodigos,
  conferirValoresDoAno,
  type ConferenciaEntrada,
} from '@/services/analiseAtivos/regras/conferencia/conferenciaAnual';
import { FLAG_CNPJ_EM_CONFERENCIA } from '@/services/analiseAtivos/quadro/montarLinhasQuadro';
import {
  anoDe,
  anosFechados,
  detectarSaltoProvento,
  exercicioForaDeDezembro,
  mesPorExtenso,
  rotuloExercicio,
  type CriterioAnoFechado,
} from '@/services/analiseAtivos/leitura/ativo/series';
import {
  TEXTOS_TELA,
  formatarTexto,
  textoMotivo,
  textoNaoSeAplica,
} from '@/services/analiseAtivos/textosTela';
import { TEXTOS_ATIVO } from '@/services/analiseAtivos/textosAtivo';
import { TEXTOS_FINANCEIRAS } from '@/services/analiseAtivos/textosFinanceiras';
import {
  analiseAtivosEssencialV2Habilitado,
  analiseAtivosTemplatesFinanceirasHabilitado,
} from '@/lib/analiseAtivosConfig';
import { listarEmissores } from '@/services/analiseAtivos/repositorio/universo';
import {
  emissorEhHoldingSeguradora,
  pddLucroPctDe,
  templateDoEmissor,
  valoresBanco,
  valoresSeguradora,
  type MotivoTemplate,
  type ValorTemplate,
} from '@/services/analiseAtivos/regras/acoes/templateFinanceira';
import {
  COLUNAS_ESSENCIAL_BANCO,
  COLUNAS_ESSENCIAL_SEGURADORA,
  type CodigoColunaBanco,
  type CodigoColunaSeguradora,
  type OrigemReceitaSeguradora,
  type TemplateFinanceira,
} from '@/types/analiseAtivosComplementos';
import type { FundamentosPeriodo } from '@/services/analiseAtivos/tipos';
import type {
  ColunaFundamentos,
  Estado,
  FiiTipoTela,
  FormatoAnalise,
  FundamentosResposta,
  LinhaFundamentos,
  MarcaCelulaEssencial,
  PontoSerieAnual,
  TipoSeloEstado,
} from '@/types/analiseAtivosApi';
import { MOTIVO_PREJUIZO, ROTULO_CURTO_PREJUIZO } from '@/types/analiseAtivosApi';
import type { IdCriterio } from '@/types/analiseAtivosCriterios';
import type { IdFonte, OrigemSerie } from '@/types/analiseAtivosFontes';
import { fatorCotasApos } from '@/services/analiseAtivos/regras/calculo/fatorCotas';

/** Reexportado para quem já importava daqui (Raio-X, Comparador, Valuation, testes). */
export { fatorCotasApos };

export const TTL_ANALISE_MS = 30 * 60_000;
export const MAX_ANOS_ESSENCIAL = 10;

const TF = TEXTOS_TELA.analise.fundamentos;
const TE = TEXTOS_ATIVO.essencial;
const TE2 = TEXTOS_ATIVO.essencialV2;
const SELO_CONF: TipoSeloEstado = 'proventos_em_conferencia';
const SELO_CONF_BLOCO_C: TipoSeloEstado = 'em_conferencia';

export type { ConferenciaEntrada };

/**
 * Bloco C: aplica a conferência a uma linha da tabela — conferirValoresDoAno (módulo compartilhado
 * com o Raio-X): ano fechado só com os grupos de ponto anual cuja chave é o ano; 'Últ. 12m' com
 * todas as flags da linha.
 */
function conferirLinha(
  linha: LinhaFundamentos,
  classe: 'acao' | 'fii',
  conf: ConferenciaEntrada | undefined,
): LinhaFundamentos {
  const r = conferirValoresDoAno(
    linha.valores,
    CAMPO_COLUNA_FUNDAMENTOS[classe],
    conf,
    linha.ano,
    classe,
  );
  if (!r.algum) return linha;
  const selos =
    r.selo && !linha.selos.includes(SELO_CONF_BLOCO_C)
      ? [...linha.selos, SELO_CONF_BLOCO_C]
      : linha.selos;
  return { ...linha, valores: r.valores, selos };
}

/**
 * Decisão 1 do Bloco D: ano com a base por ação quebrada ⇒ os códigos por ação da linha ficam
 * 'em conferência' (ocultar). Roda DEPOIS do Bloco C (uma célula já oculta por grupo fica como está).
 */
function conferirPerShare(
  linha: LinhaFundamentos,
  codigos: readonly string[],
  porAno: ReadonlyMap<number, string>,
): LinhaFundamentos {
  const motivo = linha.ano === null ? undefined : porAno.get(linha.ano);
  if (!motivo) return linha;
  return { ...linha, valores: aplicarPerShareNosCodigos(linha.valores, codigos, motivo) };
}

/** Colunas por ação do Essencial (decisão 1). */
export const COLUNAS_PER_SHARE = {
  acao: ['lpa', 'pl', 'pvp'],
  fii: ['rendCota', 'vpCota'],
} as const;

// ---------------------------------------------------------------------------
// Utilitários comuns (também usados pelo valuation)
// ---------------------------------------------------------------------------

/** Data civil de hoje em São Paulo (AAAA-MM-DD). */
export function hojeSaoPaulo(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(agora);
}

/** Valor ok com 4 casas (a tela usa de 0 a 2; o JSON fica menor). */
export function ok(valor: number): Estado<number> {
  return { estado: 'ok', valor: Math.round(valor * 1e4) / 1e4 };
}

export function semDado(texto: string = TEXTOS_TELA.ausentesPorCampo.semDado): Estado<number> {
  return { estado: 'ausente', motivo: 'sem_dado_fonte', texto };
}

export function ausenteCom(motivo: string, texto: string): Estado<number> {
  return { estado: 'ausente', motivo, texto };
}

export function naoSeAplicaCom(motivo: string): Estado<number> {
  return { estado: 'nao_se_aplica', motivo, texto: textoNaoSeAplica(motivo) };
}

/** Número finito ⇒ ok; senão ausente 'sem dado' (ou o texto dado). */
export function estadoDe(n: number | null | undefined, textoAusente?: string): Estado<number> {
  return typeof n === 'number' && Number.isFinite(n) ? ok(n) : semDado(textoAusente);
}

function dividir(n: number | null | undefined, fator: number): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n / fator : null;
}

function emMilhoes(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n / 1e6 : null;
}

function emBilhoes(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n / 1e9 : null;
}

const finito = (n: number | null | undefined): n is number =>
  typeof n === 'number' && Number.isFinite(n);

function coluna(
  codigo: keyof typeof TF.colunas,
  formato: FormatoAnalise,
  fonteCvmAviso = false,
): ColunaFundamentos {
  return { codigo, rotulo: TF.colunas[codigo], formato, fonteCvmAviso };
}

/** Tira as colunas em que todas as linhas são 'não se aplica' (ex.: receita e margem de banco). */
function semColunasNaoAplicaveis(
  colunas: ColunaFundamentos[],
  linhas: LinhaFundamentos[],
): ColunaFundamentos[] {
  if (linhas.length === 0) return colunas;
  return colunas.filter((c) => linhas.some((l) => l.valores[c.codigo]?.estado !== 'nao_se_aplica'));
}

// ---------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------

export interface PerShareAnoAcao {
  anoFiscal: number;
  lpaAjHoje: number | null;
  dpaAjHoje: number | null;
  payoutDmplPct: number | null;
  /** nº de ações no fim do ano (decisão 1: 1/10 da mediana) */
  acoesFim?: number | null;
  /** decisão 1: salto_acoes_sem_evento / dados_incompletos */
  flags?: string[] | null;
}

export interface MultiplosAnoAcao {
  anoFiscal: number;
  pl: number | null;
  pvp: number | null;
  dyPct: number | null;
  roePct: number | null;
  margemLiquidaPct: number | null;
  payoutPct: number | null;
  flags?: string[] | null;
}

export interface MultiplosAtuaisAcao {
  pl: number | null;
  pvp: number | null;
  dy12mPct: number | null;
  roePct: number | null;
  margemLiquidaPct: number | null;
  payoutPct: number | null;
  lpaTtm: number | null;
  dpa12m: number | null;
}

export interface EntradaFundamentosAcao {
  hoje: string;
  /** régua acao_financeira (bancos, seguradoras, holdings financeiras) */
  financeira: boolean;
  /** FY no escopo preferido (fundamentosVigentes) */
  fys: FundamentosPeriodo[];
  /** TTM mais recente no escopo preferido */
  ttm: FundamentosPeriodo | null;
  perShare: PerShareAnoAcao[];
  multiplos: MultiplosAnoAcao[];
  atual: MultiplosAtuaisAcao | null;
  /** DY/payout de 12 meses com proventos em conferência (linha do Quadro) */
  proventosEmConferencia: boolean;
  /** bloco C: flags 'conf:' (linha + anos) e motivos; ausente = como hoje */
  conferencia?: ConferenciaEntrada;
  /** v2.5: regras do Essencial vindas do criteria_params; ausente = CRITERIA_PARAMS_CODIGO */
  regras?: RegrasEssencialAcao;
  /**
   * v2.5: lucro descontado (net_income_adjusted) resolvido pela camada de fontes, em R$ mi por ano
   * fiscal, com a origem do ponto; ausente/sem o ano = a célula usa o lucro líquido (fallback).
   */
  descontado?: {
    valores: Readonly<Record<number, number | null>>;
    origens?: Readonly<Record<number, OrigemSerie>>;
  };
  /** v2.5: rótulos das fontes para a nota de fonte (registro); ausente = os ids */
  rotulosFontes?: RotulosFonte;
  /** A6: template de banco/seguradora (só com a chave); ausente/null = o template de hoje */
  template?: TemplateFinanceira | null;
}

/** Regras do Essencial de ações que vêm do criteria_params (v2.5; religáveis sem código). */
export interface RegrasEssencialAcao {
  /** ids do D4 que não se aplicam à financeira (v2: nenhum) */
  naoSeAplicaFinanceira: readonly IdCriterio[];
  /** nota 'não se aplicam a bancos…' (acao_financeira.notaEssencial; v2: false) */
  notaFinanceira: boolean;
  /** receita ≤ lucro (criterios.margem.receitaMenorQueLucro; v2: 'valor') */
  receitaMenorQueLucro: 'valor' | 'sem_dado';
}

export function regrasEssencialDe(
  p: Pick<CriteriaParams, 'perfis' | 'criterios'>,
): RegrasEssencialAcao {
  return {
    naoSeAplicaFinanceira: p.perfis.acao_financeira.naoSeAplica,
    notaFinanceira: p.perfis.acao_financeira.notaEssencial,
    receitaMenorQueLucro: p.criterios.margem.receitaMenorQueLucro,
  };
}

/**
 * Lucro do período em Estado (regra 12: controladora_zero ⇒ individual; senão motivo). `escala` =
 * divisor (1e6 = R$ mi; o Essencial v2.4 usa 1e9 = R$ bi).
 */
export function lucroEstado(f: FundamentosPeriodo, escala = 1e6): Estado<number> {
  const v = lucroParaSequencia(f);
  if (v.estado === 'ok') return ok(v.valor / escala);
  return ausenteCom(v.motivo, textoMotivo(v.motivo));
}

/** EBITDA = EBIT + depreciação e amortização (os dois no período), em R$. */
export function ebitdaDe(f: FundamentosPeriodo): number | null {
  return finito(f.ebit) && finito(f.depreciacaoAmortizacao)
    ? f.ebit + f.depreciacaoAmortizacao
    : null;
}

/** Dívida líquida = dívida bruta (CP + LP) − caixa − aplicações financeiras, em R$. */
export function dividaLiquidaDe(f: FundamentosPeriodo): number | null {
  if (!finito(f.dividaBrutaCp) && !finito(f.dividaBrutaLp)) return null;
  if (!finito(f.caixa)) return null;
  const bruta = (f.dividaBrutaCp ?? 0) + (f.dividaBrutaLp ?? 0);
  return bruta - f.caixa - (finito(f.aplicacoesFinanceiras) ? f.aplicacoesFinanceiras : 0);
}

/** FCL/CAPEX = (FCO − CAPEX) ÷ CAPEX (CAPEX = saída positiva; nunca o campo fcf). */
export function fclCapexDe(f: FundamentosPeriodo): number | null {
  if (!finito(f.fco) || !finito(f.capex) || f.capex <= 0) return null;
  return (f.fco - f.capex) / f.capex;
}

/** Colunas do Essencial que cada critério do D4 tira da financeira (religado por params). */
const COLUNAS_DO_CRITERIO_FINANCEIRA: Partial<Record<IdCriterio, readonly string[]>> = {
  ebitda: ['ebitda'],
  dl: ['dl', 'dlEbitda'],
  fcl: ['fclCapex'],
};

/** Colunas 'não se aplica' da financeira pelos ids de naoSeAplica (v2: nenhuma). */
export function colunasNaoSeAplicaFinanceira(ids: readonly IdCriterio[]): Set<string> {
  return new Set(ids.flatMap((id) => COLUNAS_DO_CRITERIO_FINANCEIRA[id] ?? []));
}

/** '—' do Essencial v2.5 com o tooltip 'sem dado nas demonstrações'. */
function semDadoEssencial(): Estado<number> {
  return semDado(TE.tooltips.semDado);
}

/**
 * Colunas derivadas do demonstrativo (v2.4): EBITDA, dívida líquida, Dív. líq./EBITDA e FCL/CAPEX
 * em R$ bi / ×. EBITDA ≤ 0 ⇒ Dív. líq./EBITDA sem número, com o motivo. v2.5: só as colunas em
 * `naoSeAplica` (financeira com o D4 religado por params) saem 'não se aplica'; o resto é calculado
 * e, sem dado, '—' com o tooltip.
 */
function derivadasDoPeriodo(
  f: FundamentosPeriodo,
  naoSeAplica: ReadonlySet<string>,
): Record<'ebitda' | 'dl' | 'dlEbitda' | 'fclCapex', Estado<number>> {
  const ebitda = ebitdaDe(f);
  const dl = dividaLiquidaDe(f);
  let dlEbitda: Estado<number>;
  if (ebitda === null || dl === null) dlEbitda = semDadoEssencial();
  else if (ebitda <= 0) dlEbitda = ausenteCom('ebitda_nao_positivo', TE.ebitdaNaoPositivo);
  else dlEbitda = ok(dl / ebitda);
  const valores = {
    ebitda: estadoDe(emBilhoes(ebitda), TE.tooltips.semDado),
    dl: estadoDe(emBilhoes(dl), TE.tooltips.semDado),
    dlEbitda,
    fclCapex: estadoDe(fclCapexDe(f), TE.tooltips.semDado),
  };
  for (const c of Object.keys(valores) as Array<keyof typeof valores>) {
    if (naoSeAplica.has(c)) valores[c] = naoSeAplicaCom('financeira');
  }
  return valores;
}

/** Receita ≤ 0 ou marcada 'não se aplica' na ingestão (holding sem receita própria, ex.: BBSE3). */
function receitaNaoPositiva(f: Pick<FundamentosPeriodo, 'receita' | 'naoSeAplica'>): boolean {
  return finito(f.receita) && (f.receita <= 0 || f.naoSeAplica.includes('receita'));
}

/**
 * Receita do ano em R$ bi; ≤ 0 = '—' com o tooltip 'sem dado nas demonstrações' (v2.5; a spec não
 * dá número para receita inexistente), nunca "R$ 0,0 bi" nem 'não se aplica'.
 */
function receitaDe(f: Pick<FundamentosPeriodo, 'receita' | 'naoSeAplica'>): Estado<number> {
  if (receitaNaoPositiva(f)) return semDadoEssencial();
  return estadoDe(emBilhoes(f.receita), TE.tooltips.semDado);
}

/**
 * Margem do ano (v2.5: 'Margem descontada'): o múltiplo gravado (só quando o numerador é o lucro
 * líquido); sem ele, lucro ÷ receita (receita > 0). Receita ≤ lucro (holding / banco no individual)
 * segue criterios.margem.receitaMenorQueLucro: 'valor' (literal da spec, margem > 100%) ou
 * 'sem_dado' ('—').
 */
function margemDe(
  pct: number | null | undefined,
  lucro: Estado<number>,
  receita: number | null,
  receitaMenorQueLucro: 'valor' | 'sem_dado',
): Estado<number> {
  if (finito(pct)) return ok(pct);
  if (lucro.estado === 'ok' && finito(receita) && receita > 0) {
    const lucroReais = lucro.valor * 1e9;
    if (receita <= lucroReais && receitaMenorQueLucro === 'sem_dado') return semDadoEssencial();
    return ok((lucroReais / receita) * 100);
  }
  return semDadoEssencial();
}

/** Anos (de série anual de proventos por ação) marcados como 'em conferência'. */
export function anosProventoSuspeito(
  perShare: ReadonlyArray<{
    anoFiscal: number;
    dpa: number | null;
    payout?: number | null;
    /** F2: fim do exercício (critério 'dtFim') */
    dtFim?: string | null;
  }>,
  hoje: string,
  criterio: CriterioAnoFechado = 'ano',
): Set<number> {
  const serie: PontoSerieAnual[] = anosFechados(
    perShare.map((p) => ({ ano: p.anoFiscal, valor: p.dpa, dtFim: p.dtFim })),
    hoje,
    { criterio },
  ).map(({ ano, valor }) => ({ ano, valor }));
  const payoutPorAno = Object.fromEntries(perShare.map((p) => [p.anoFiscal, p.payout ?? null]));
  return new Set(detectarSaltoProvento(serie, { payoutPorAno }).anosSuspeitos);
}

/** Coluna do Essencial de ações (v2.4): rótulos de textosAtivo (D2: 'Lucro líq. ⓘ'). */
function colunaAcao(codigo: keyof typeof TE.colunas, formato: FormatoAnalise): ColunaFundamentos {
  return { codigo, rotulo: TE.colunas[codigo], formato, fonteCvmAviso: false };
}

/** Ordem do HTML do Pedro (§3.2 bloco 5), em R$ bi. */
const COLUNAS_ACAO: ColunaFundamentos[] = [
  colunaAcao('receita', 'numero'),
  colunaAcao('ebitda', 'numero'),
  colunaAcao('lucro', 'numero'),
  colunaAcao('margem', 'pct'),
  colunaAcao('dl', 'numero'),
  colunaAcao('dlEbitda', 'multiplo'),
  colunaAcao('fclCapex', 'multiplo'),
  colunaAcao('roe', 'pct'),
  colunaAcao('lpa', 'numero2'),
  colunaAcao('dpa', 'numero2'),
  colunaAcao('payout', 'pct'),
  colunaAcao('pl', 'numero'),
  colunaAcao('pvp', 'numero2'),
  colunaAcao('dy', 'pct'),
];

/** Layout legado (base do Raio-X): R$ mi, colunas de antes da v2.4. */
const COLUNAS_ACAO_LEGADO: ColunaFundamentos[] = [
  coluna('receita', 'moedaMi'),
  coluna('lucro', 'moedaMi'),
  coluna('margem', 'pct'),
  coluna('roe', 'pct'),
  coluna('lpa', 'numero2'),
  coluna('dpa', 'numero2'),
  coluna('payout', 'pct'),
  coluna('pl', 'numero'),
  coluna('pvp', 'numero2'),
  coluna('dy', 'pct'),
];

/** 'v24' = Essencial da página (ordem nova, R$ bi); ausente = legado (base do Raio-X). */
export interface OpcoesFundamentosAcao {
  layout?: 'v24';
  /** F2: ANALISE_ATIVOS_ESSENCIAL_V2_HABILITADO (só leitura); ausente = como hoje */
  essencialV2?: boolean;
  /** F2: payout.regra da scoring VIGENTE (tooltip do payout); ausente = 'dmpl_dpa' (hoje) */
  regraPayout?: RegraPayout;
}

/** 'L' (prejuízo no período) — Estado ausente com rotuloCurto (F2, só com essencialV2). */
export function prejuizoComL(): Estado<number> {
  return {
    estado: 'ausente',
    motivo: MOTIVO_PREJUIZO,
    texto: TE2.tooltipPrejuizo,
    rotuloCurto: ROTULO_CURTO_PREJUIZO,
  };
}

/** FY por ano fiscal (o de dtFim mais recente: regra 19). */
function fyPorAnoDe(fys: readonly FundamentosPeriodo[]): Map<number, FundamentosPeriodo> {
  const out = new Map<number, FundamentosPeriodo>();
  for (const f of fys) {
    const atual = out.get(f.anoFiscal);
    if (!atual || f.dtFim > atual.dtFim) out.set(f.anoFiscal, f);
  }
  return out;
}

/** Anos fechados do Essencial (até MAX_ANOS_ESSENCIAL), pelo critério (F2). */
function anosDoEssencial(
  fyPorAno: ReadonlyMap<number, FundamentosPeriodo>,
  hoje: string,
  criterio: CriterioAnoFechado,
): number[] {
  return anosFechados(
    [...fyPorAno.entries()].map(([ano, f]) => ({ ano, dtFim: f.dtFim })),
    hoje,
    { criterio },
  )
    .slice(-MAX_ANOS_ESSENCIAL)
    .map((p) => p.ano);
}

/** Nota 'exercício encerrado em {mes}' (F2), quando algum ano exibido fecha fora de dezembro. */
export function notaExercicio(dtFims: ReadonlyArray<string | null | undefined>): string | null {
  const fora = [...dtFims].reverse().find((d) => exercicioForaDeDezembro(d));
  return fora ? formatarTexto(TE2.notaExercicio, { mes: mesPorExtenso(fora) }) : null;
}

/** Ano, rótulo e (com a chave) dtFim de uma linha de ano fechado. */
function cabecalhoAno(
  ano: number,
  f: FundamentosPeriodo,
  v2: boolean,
): Pick<LinhaFundamentos, 'rotulo' | 'ano' | 'dtFim'> {
  return v2
    ? { rotulo: rotuloExercicio(ano, f.dtFim), ano, dtFim: f.dtFim }
    : { rotulo: String(ano), ano };
}

/**
 * Colunas com as regras da F2: com a chave, 'Lucro líquido'/'Margem líquida' (A4.e) com a
 * explicação do lucro líquido (no lugar da do descontado); payout com o que ele mede quando a
 * scoring vigente usa 'dfc' (nunca pela chave). Sem chave e com 'dmpl_dpa' = as colunas de hoje.
 */
export function colunasComRegras(
  colunas: readonly ColunaFundamentos[],
  essencialV2: boolean,
  regraPayout: RegraPayout | undefined,
): ColunaFundamentos[] {
  return colunas.map((c) => {
    if (essencialV2 && (c.codigo === 'lucro' || c.codigo === 'margem')) {
      return { ...c, rotulo: TE2.colunas[c.codigo], tooltip: TE2.tooltips[c.codigo] };
    }
    if (c.codigo === 'payout' && regraPayout === 'dfc') {
      return { ...c, tooltip: TEXTOS_ATIVO.payoutRegra.dfc };
    }
    return c;
  });
}

/**
 * Anos com salto de provento (Div./ação) do Essencial: hoje pelo payoutDmplPct e anos por 'ano';
 * F2 (chave): pelo payoutPct do ano (o da scoring que calculou) e anos por dtFim.
 */
function anosProventoSuspeitoDe(
  e: Pick<EntradaFundamentosAcao, 'perShare' | 'hoje'>,
  fyPorAno: ReadonlyMap<number, FundamentosPeriodo>,
  mPorAno: ReadonlyMap<number, MultiplosAnoAcao>,
  v2: boolean,
): Set<number> {
  if (!v2) {
    return anosProventoSuspeito(
      e.perShare.map((p) => ({
        anoFiscal: p.anoFiscal,
        dpa: p.dpaAjHoje,
        payout: p.payoutDmplPct,
      })),
      e.hoje,
    );
  }
  return anosProventoSuspeito(
    e.perShare.map((p) => ({
      anoFiscal: p.anoFiscal,
      dpa: p.dpaAjHoje,
      payout: mPorAno.get(p.anoFiscal)?.payoutPct ?? null,
      dtFim: fyPorAno.get(p.anoFiscal)?.dtFim ?? null,
    })),
    e.hoje,
    'dtFim',
  );
}

export function textoPadrao(escopo: string | null, padrao: string | null): string | null {
  if (!escopo || !padrao) return null;
  const e = (TF.escopo as Record<string, string>)[escopo] ?? escopo;
  const p = (TF.padrao as Record<string, string>)[padrao] ?? padrao;
  return `${e} ${p}`;
}

export function montarFundamentosAcao(
  e: EntradaFundamentosAcao,
  opts: OpcoesFundamentosAcao = {},
): FundamentosResposta {
  const v24 = opts.layout === 'v24';
  if (e.template) return montarFundamentosFinanceira({ ...e, template: e.template }, v24, opts);
  const v2 = opts.essencialV2 === true;
  const criterio: CriterioAnoFechado = v2 ? 'dtFim' : 'ano';
  const escala = v24 ? 1e9 : 1e6;
  const naFin = naoSeAplicaCom('financeira');
  const regras = e.regras ?? regrasEssencialDe(CRITERIA_PARAMS_CODIGO);
  const naColunas = e.financeira
    ? colunasNaoSeAplicaFinanceira(regras.naoSeAplicaFinanceira)
    : new Set<string>();
  const fontesUsadas = new Set<IdFonte>(['cvm']);
  let algumIncompleto = false;

  /**
   * v2.5: lucro e margem DESCONTADOS da célula — o net_income_adjusted do ano (provedor) quando
   * existe; senão o lucro líquido (`lucroLiquido`) com a marca fallback.
   */
  const lucroEMargem = (
    f: FundamentosPeriodo,
    lucroLiquido: Estado<number>,
    margemPct: number | null | undefined,
    ano: number | null,
  ): {
    valores: Record<'lucro' | 'margem', Estado<number>>;
    marcas: LinhaFundamentos['marcas'];
  } => {
    const semReceita = receitaNaoPositiva(f);
    if (v2) {
      // F2 (A4.e): um lucro líquido só — sem descontado e sem a marca de fallback. A margem sai do
      // MESMO lucro da coluna (atribuído aos controladores) ÷ receita, como o 'mg' dos critérios;
      // a margemLiquidaPct do yearly é sobre o lucro consolidado (inclui não controladores).
      return {
        valores: {
          lucro: lucroLiquido,
          margem: semReceita
            ? semDadoEssencial()
            : margemDe(null, lucroLiquido, f.receita, regras.receitaMenorQueLucro),
        },
        marcas: undefined,
      };
    }
    const desc = ano === null ? undefined : e.descontado?.valores[ano];
    const origem = ano === null ? undefined : e.descontado?.origens?.[ano];
    if (origem?.incompleto) algumIncompleto = true;
    if (finito(desc)) {
      const lucro = ok((desc * 1e6) / escala);
      const fonte = origem?.fonte;
      if (fonte) fontesUsadas.add(fonte);
      const marca: MarcaCelulaEssencial = fonte ? { fonte } : {};
      return {
        valores: {
          lucro,
          margem: semReceita
            ? semDadoEssencial()
            : margemDe(null, lucro, f.receita, regras.receitaMenorQueLucro),
        },
        marcas: { lucro: marca, margem: marca },
      };
    }
    const margem = semReceita
      ? semDadoEssencial()
      : margemDe(margemPct, lucroLiquido, f.receita, regras.receitaMenorQueLucro);
    const marcaFallback = (v: Estado<number>): MarcaCelulaEssencial | undefined =>
      v.estado === 'ok' || origem?.incompleto
        ? { fallback: true, ...(origem?.incompleto ? { incompleto: true } : {}) }
        : undefined;
    const marcas: NonNullable<LinhaFundamentos['marcas']> = {};
    const ml = marcaFallback(lucroLiquido);
    const mm = marcaFallback(margem);
    if (ml) marcas.lucro = ml;
    if (mm) marcas.margem = mm;
    return { valores: { lucro: lucroLiquido, margem }, marcas };
  };

  /** receita, (v2.4) as colunas derivadas do período e (v2.5) lucro/margem descontados */
  const colunasDoPeriodo = (
    f: FundamentosPeriodo,
    lucro: Estado<number>,
    margemPct: number | null | undefined,
    ano: number | null,
  ): { valores: Record<string, Estado<number>>; marcas?: LinhaFundamentos['marcas'] } => {
    if (!v24) {
      // F2 (A4.e) no Raio-X: com a chave, a margem sai do mesmo lucro da linha (controladores),
      // como no Essencial v24; margemDe espera o lucro em R$ bi.
      const margemV2 = (): Estado<number> =>
        receitaNaoPositiva(f)
          ? semDadoEssencial()
          : margemDe(
              null,
              lucro.estado === 'ok' ? ok((lucro.valor * escala) / 1e9) : lucro,
              f.receita,
              regras.receitaMenorQueLucro,
            );
      return {
        valores: {
          receita: e.financeira ? naFin : estadoDe(emMilhoes(f.receita)),
          margem: e.financeira ? naFin : v2 ? margemV2() : estadoDe(margemPct),
          lucro,
        },
      };
    }
    const lm = lucroEMargem(f, lucro, margemPct, ano);
    return {
      valores: {
        receita: receitaDe(f),
        ...derivadasDoPeriodo(f, naColunas),
        ...lm.valores,
      },
      marcas: lm.marcas && Object.keys(lm.marcas).length > 0 ? lm.marcas : undefined,
    };
  };
  // F2: 'L' (prejuízo no período) só com a chave; sem ela, o '—' com o motivo de hoje
  const prejuizo = v2 ? prejuizoComL() : ausenteCom('prejuizo', TF.prejuizoNoAno);
  const fyPorAno = fyPorAnoDe(e.fys);
  const anos = anosDoEssencial(fyPorAno, e.hoje, criterio);
  const psPorAno = new Map(e.perShare.map((p) => [p.anoFiscal, p]));
  const mPorAno = new Map(e.multiplos.map((m) => [m.anoFiscal, m]));
  const suspeitos = anosProventoSuspeitoDe(e, fyPorAno, mPorAno, v2);

  const linhas: LinhaFundamentos[] = anos.map((ano, i) => {
    const f = fyPorAno.get(ano)!;
    const ps = psPorAno.get(ano);
    const m = mPorAno.get(ano);
    const lucro = lucroEstado(f, escala);
    const emPrejuizo = lucro.estado === 'ok' && (v2 ? lucro.valor <= 0 : lucro.valor < 0);
    const suspeito = suspeitos.has(ano);
    const periodo = colunasDoPeriodo(f, lucro, m?.margemLiquidaPct, ano);
    const linha: LinhaFundamentos = {
      ...cabecalhoAno(ano, f, v2),
      ultimoAno: i === anos.length - 1,
      valores: {
        ...periodo.valores,
        roe: estadoDe(m?.roePct),
        lpa: estadoDe(ps?.lpaAjHoje),
        dpa: estadoDe(ps?.dpaAjHoje),
        payout: emPrejuizo ? prejuizo : estadoDe(m?.payoutPct),
        pl: emPrejuizo ? prejuizo : estadoDe(m?.pl),
        pvp: estadoDe(m?.pvp),
        dy: estadoDe(m?.dyPct),
      },
      selos: suspeito ? [SELO_CONF] : [],
    };
    if (periodo.marcas) linha.marcas = periodo.marcas;
    return linha;
  });

  const ultimoFy = anos.length ? fyPorAno.get(anos[anos.length - 1])! : null;
  const ttm = e.ttm;
  if (ttm && (!ultimoFy || ttm.dtFim > ultimoFy.dtFim) && anoDe(ttm.dtFim) <= anoDe(e.hoje)) {
    const a = e.atual;
    const lucro = lucroEstado(ttm, escala);
    const emPrejuizo =
      (lucro.estado === 'ok' && (v2 ? lucro.valor <= 0 : lucro.valor < 0)) ||
      (a?.lpaTtm != null && a.lpaTtm < 0);
    const conf = e.proventosEmConferencia;
    const prov = (n: number | null | undefined) =>
      conf && n == null ? semDado(TEXTOS_TELA.ausentesPorCampo.dyEmConferencia) : estadoDe(n);
    // Últ. 12m: a fonte entrega o descontado por ano fiscal ⇒ aqui sempre o lucro líquido
    const periodo = colunasDoPeriodo(ttm, lucro, a?.margemLiquidaPct, null);
    const linha: LinhaFundamentos = {
      rotulo: TEXTOS_TELA.ativo.ult12mTabela,
      ano: null,
      ultimoAno: false,
      valores: {
        ...periodo.valores,
        roe: estadoDe(a?.roePct),
        lpa: estadoDe(a?.lpaTtm),
        dpa: prov(a?.dpa12m),
        payout: emPrejuizo ? prejuizo : prov(a?.payoutPct),
        pl: emPrejuizo
          ? v2
            ? prejuizoComL()
            : ausenteCom('prejuizo', TEXTOS_TELA.ausentesPorCampo.plPrejuizo)
          : estadoDe(a?.pl),
        pvp: estadoDe(a?.pvp),
        dy: prov(a?.dy12mPct),
      },
      selos: conf ? [SELO_CONF] : [],
    };
    if (periodo.marcas) linha.marcas = periodo.marcas;
    linhas.push(linha);
  }
  const notaEx = v2 ? notaExercicio(anos.map((a) => fyPorAno.get(a)?.dtFim)) : null;

  const padraoContabil = ultimoFy?.padraoContabil ?? null;
  const escopo = ultimoFy?.escopo ?? null;
  const notas: string[] = [v24 ? TE.unidadeAcaoSemFonte : TEXTOS_TELA.ativo.unidadeFundamentos];
  if (e.financeira && (v24 ? regras.notaFinanceira : true)) {
    notas.push(v24 ? TE.notaFinanceira : TF.notaFinanceira);
  }
  if (padraoContabil === 'BRGAAP' || escopo === 'ind') {
    const t = textoPadrao(escopo, padraoContabil);
    if (t) notas.push(formatarTexto(TF.notaPadraoContabil, { valor: t }));
  }
  notas.push(TF.notaLpaAjustado);
  if (notaEx) notas.push(notaEx);
  if (linhas.some((l) => l.ano !== null && l.selos.includes(SELO_CONF))) {
    notas.push(TF.notaProventosConferencia);
  }

  const perShareConf = anosPerShareEmConferencia(e.perShare, e.multiplos, { mediana: true });
  const linhasConf = linhas.map((l) =>
    conferirPerShare(conferirLinha(l, 'acao', e.conferencia), COLUNAS_PER_SHARE.acao, perShareConf),
  );
  const colunasBase = colunasComRegras(
    v24 ? COLUNAS_ACAO : COLUNAS_ACAO_LEGADO,
    v2,
    opts.regraPayout,
  );
  const resposta: FundamentosResposta = {
    nivel: 'essencial',
    unidade: v24 ? 'R$ bi' : 'R$ mi',
    fonte: 'CVM',
    padraoContabil,
    escopo,
    variante: 'acao',
    colunas: semColunasNaoAplicaveis(colunasBase, linhasConf),
    linhas: linhasConf,
    observacoes: notas,
  };
  if (v24) {
    resposta.textoFonte = textoNotaFonte('acao', [...fontesUsadas], e.rotulosFontes);
    if (algumIncompleto) resposta.dadosIncompletos = true;
  }
  return resposta;
}

// ---------------------------------------------------------------------------
// Financeiras (A6, fatia B): templates de banco e seguradora
// ---------------------------------------------------------------------------

const TFIN = TEXTOS_FINANCEIRAS;

/** Texto do motivo de uma célula de template sem número. */
export function textoMotivoTemplate(m: MotivoTemplate): string {
  switch (m) {
    case 'sem_dva':
      return TFIN.banco.motivos.semDva;
    case 'lucro_nao_positivo':
      return TFIN.banco.motivos.lucroNaoPositivo;
    case 'ifrs17':
      return TFIN.seguradora.motivos.ifrs17;
    case 'equivalencia_nao_se_aplica':
      return TFIN.seguradora.motivos.equivalenciaNaoSeAplica;
    case 'holding_sem_operacao':
      return TFIN.seguradora.motivos.holdingSemOperacao;
    case 'margem_sem_leitura':
      return TFIN.seguradora.motivos.margemSemLeitura;
    default:
      return TE.tooltips.semDado;
  }
}

/** ValorTemplate → Estado (`escala` = divisor dos valores em R$; 1 nas razões). */
export function estadoTemplate(x: ValorTemplate, escala = 1): Estado<number> {
  if ('valor' in x) return ok(x.valor / escala);
  return ausenteCom(x.motivo, textoMotivoTemplate(x.motivo));
}

function colunaFin(
  codigo: string,
  rotulo: string,
  formato: FormatoAnalise,
  tooltip?: string,
): ColunaFundamentos {
  const c: ColunaFundamentos = { codigo, rotulo, formato, fonteCvmAviso: false };
  if (tooltip) c.tooltip = tooltip;
  return c;
}

/** Colunas do Essencial 'banco' (COLUNAS_ESSENCIAL_BANCO), no layout pedido. */
export function colunasBanco(v24: boolean, essencialV2 = false): ColunaFundamentos[] {
  const r = TFIN.banco.colunas;
  // F2 (A5): PDD ÷ lucro em % (tooltip próprio) só com ANALISE_ATIVOS_ESSENCIAL_V2_HABILITADO
  const t = essencialV2
    ? { ...TFIN.banco.tooltips, ...TFIN.banco.tooltipsV2 }
    : TFIN.banco.tooltips;
  const m: FormatoAnalise = v24 ? 'numero' : 'moedaMi';
  const formatos: Record<CodigoColunaBanco, FormatoAnalise> = {
    receitaIntermediacao: m,
    pdd: m,
    lucroLiquido: m,
    margemBancaria: 'pct',
    pddLucro: essencialV2 ? 'pct' : 'multiplo',
    ativoTotal: m,
    patrimonio: m,
    roe: 'pct',
    divJcp: m,
    payout: 'pct',
    dy: 'pct',
    pl: 'numero',
    pvp: 'numero2',
  };
  return COLUNAS_ESSENCIAL_BANCO.map((c) =>
    colunaFin(c, r[c], formatos[c], (t as Partial<Record<string, string>>)[c]),
  );
}

/** Colunas do Essencial 'seguradora' (COLUNAS_ESSENCIAL_SEGURADORA); tooltip da receita pela origem. */
export function colunasSeguradora(
  v24: boolean,
  tooltipReceita: string | undefined,
): ColunaFundamentos[] {
  const r = TFIN.seguradora.colunas;
  const t = TFIN.seguradora.tooltips;
  const m: FormatoAnalise = v24 ? 'numero2' : 'moedaMi';
  const formatos: Record<CodigoColunaSeguradora, FormatoAnalise> = {
    receitaOperacional: m,
    equivalencia: m,
    resultadoFinanceiro: m,
    lucroLiquido: m,
    margemLiquida: 'pct',
    roe: 'pct',
    patrimonio: m,
    divJcp: m,
    payout: 'pct',
    dy: 'pct',
  };
  const tooltips: Partial<Record<CodigoColunaSeguradora, string>> = {
    receitaOperacional: tooltipReceita,
    equivalencia: t.equivalencia,
    margemLiquida: t.margem,
  };
  return COLUNAS_ESSENCIAL_SEGURADORA.map((c) => colunaFin(c, r[c], formatos[c], tooltips[c]));
}

/** Lucro do período em R$ (o mesmo da célula de lucro) para as razões; null sem número. */
function lucroReais(f: FundamentosPeriodo): number | null {
  const l = lucroParaSequencia(f);
  return l.estado === 'ok' ? l.valor : null;
}

/** Origens da receita da seguradora → texto 'receita usada' (um regime ou os dois). */
function receitaUsadaDe(origens: ReadonlyArray<OrigemReceitaSeguradora>): string | null {
  const unicas = [...new Set(origens)];
  if (unicas.length === 0) return null;
  const ru = TFIN.seguradora.receitaUsada;
  if (unicas.length === 1) return ru[unicas[0]];
  if (unicas.includes('premios_ganhos') && unicas.includes('receita_seguro')) {
    return formatarTexto(TFIN.seguradora.receitaUsadaRegimes, {
      ate: ru.premios_ganhos,
      desde: ru.receita_seguro,
    });
  }
  return unicas.map((o) => ru[o]).join(' · ');
}

/**
 * Essencial de banco/seguradora (A6). Mesmos anos fechados + 'Últ. 12m', mesmos múltiplos anuais
 * (ROE, payout, DY, P/L, P/VP) e a mesma conferência (Bloco C e decisão 1) do template de hoje; só as
 * colunas e as notas mudam. `escala` 1e9 (v24, R$ bi) ou 1e6 (legado, R$ mi: base do Raio-X).
 */
function montarFundamentosFinanceira(
  e: EntradaFundamentosAcao & { template: TemplateFinanceira },
  v24: boolean,
  opts: OpcoesFundamentosAcao = {},
): FundamentosResposta {
  const v2 = opts.essencialV2 === true;
  const escala = v24 ? 1e9 : 1e6;
  const banco = e.template === 'banco';
  const fyPorAno = fyPorAnoDe(e.fys);
  const anos = anosDoEssencial(fyPorAno, e.hoje, v2 ? 'dtFim' : 'ano');
  const mPorAno = new Map(e.multiplos.map((m) => [m.anoFiscal, m]));
  const holding = !banco && emissorEhHoldingSeguradora([...e.fys, ...(e.ttm ? [e.ttm] : [])]);
  const prejuizo = v2 ? prejuizoComL() : ausenteCom('prejuizo', TF.prejuizoNoAno);
  const origens: OrigemReceitaSeguradora[] = [];
  let algumLucroNaoPositivo = false;
  let algumaMargemSemLeitura = false;
  const suspeitos = anosProventoSuspeitoDe(e, fyPorAno, mPorAno, v2);

  const doPeriodo = (f: FundamentosPeriodo, ano: number): Record<string, Estado<number>> => {
    const lucro = lucroEstado(f, escala);
    const lr = lucroReais(f);
    if (banco) {
      const b = valoresBanco(f, lr);
      if ('motivo' in b.pddLucro && b.pddLucro.motivo === 'lucro_nao_positivo') {
        algumLucroNaoPositivo = true;
      }
      return {
        receitaIntermediacao: estadoTemplate(b.receitaIntermediacao, escala),
        pdd: estadoTemplate(b.pdd, escala),
        lucroLiquido: lucro,
        margemBancaria: estadoTemplate(b.margemBancariaPct),
        // F2 (A5): PDD ÷ lucro em % com a chave; sem ela, em × (hoje)
        pddLucro: estadoTemplate(v2 ? pddLucroPctDe(b) : b.pddLucro),
        ativoTotal: estadoTemplate(b.ativoTotal, escala),
        patrimonio: estadoTemplate(b.patrimonio, escala),
        divJcp: estadoTemplate(b.divJcp, escala),
      };
    }
    const s = valoresSeguradora(f, ano, lr, holding);
    if (s.origem) origens.push(s.origem);
    if ('motivo' in s.margemPct && s.margemPct.motivo === 'margem_sem_leitura') {
      algumaMargemSemLeitura = true;
    }
    return {
      receitaOperacional: estadoTemplate(s.receitaOperacional, escala),
      equivalencia: estadoTemplate(s.equivalencia, escala),
      resultadoFinanceiro: estadoTemplate(s.resultadoFinanceiro, escala),
      lucroLiquido: lucro,
      margemLiquida: estadoTemplate(s.margemPct),
      patrimonio: estadoTemplate(s.patrimonio, escala),
      divJcp: estadoTemplate(s.divJcp, escala),
    };
  };

  const linhas: LinhaFundamentos[] = anos.map((ano, i) => {
    const f = fyPorAno.get(ano)!;
    const m = mPorAno.get(ano);
    const lucro = lucroEstado(f, escala);
    const emPrejuizo = lucro.estado === 'ok' && (v2 ? lucro.valor <= 0 : lucro.valor < 0);
    const valores: Record<string, Estado<number>> = {
      ...doPeriodo(f, ano),
      roe: estadoDe(m?.roePct),
      payout: emPrejuizo ? prejuizo : estadoDe(m?.payoutPct),
      dy: estadoDe(m?.dyPct),
    };
    if (banco) {
      valores.pl = emPrejuizo ? prejuizo : estadoDe(m?.pl);
      valores.pvp = estadoDe(m?.pvp);
    }
    return {
      ...cabecalhoAno(ano, f, v2),
      ultimoAno: i === anos.length - 1,
      valores,
      selos: suspeitos.has(ano) ? [SELO_CONF] : [],
    };
  });

  const ultimoFy = anos.length ? fyPorAno.get(anos[anos.length - 1])! : null;
  const ttm = e.ttm;
  if (ttm && (!ultimoFy || ttm.dtFim > ultimoFy.dtFim) && anoDe(ttm.dtFim) <= anoDe(e.hoje)) {
    const a = e.atual;
    const lucro = lucroEstado(ttm, escala);
    const emPrejuizo =
      (lucro.estado === 'ok' && (v2 ? lucro.valor <= 0 : lucro.valor < 0)) ||
      (a?.lpaTtm != null && a.lpaTtm < 0);
    const conf = e.proventosEmConferencia;
    const prov = (n: number | null | undefined) =>
      conf && n == null ? semDado(TEXTOS_TELA.ausentesPorCampo.dyEmConferencia) : estadoDe(n);
    const valores: Record<string, Estado<number>> = {
      ...doPeriodo(ttm, anoDe(ttm.dtFim)),
      roe: estadoDe(a?.roePct),
      payout: emPrejuizo ? prejuizo : prov(a?.payoutPct),
      dy: prov(a?.dy12mPct),
    };
    if (banco) {
      valores.pl = emPrejuizo
        ? v2
          ? prejuizoComL()
          : ausenteCom('prejuizo', TEXTOS_TELA.ausentesPorCampo.plPrejuizo)
        : estadoDe(a?.pl);
      valores.pvp = estadoDe(a?.pvp);
    }
    linhas.push({
      rotulo: TEXTOS_TELA.ativo.ult12mTabela,
      ano: null,
      ultimoAno: false,
      valores,
      selos: conf ? [SELO_CONF] : [],
    });
  }

  const padraoContabil = ultimoFy?.padraoContabil ?? null;
  const escopo = ultimoFy?.escopo ?? null;
  const notas: string[] = [];
  let colunas: ColunaFundamentos[];
  if (banco) {
    notas.push(TFIN.banco.unidade, TFIN.banco.observacoes.basileia);
    const t = textoPadrao(escopo, padraoContabil);
    if (t) notas.push(formatarTexto(TFIN.banco.observacoes.padraoContabil, { valor: t }));
    if (algumLucroNaoPositivo) notas.push(TFIN.banco.observacoes.pddLucro);
    colunas = colunasBanco(v24, v2);
  } else {
    const ultimaOrigem = [...origens].pop();
    const receitaUsada = receitaUsadaDe(origens);
    notas.push(
      receitaUsada
        ? formatarTexto(TFIN.seguradora.unidade, { valor: receitaUsada })
        : TFIN.seguradora.unidadeSemReceita,
    );
    if (holding) {
      notas.push(TFIN.seguradora.observacoes.holdings);
      if (algumaMargemSemLeitura) notas.push(TFIN.seguradora.observacoes.margemHolding);
    } else {
      notas.push(TFIN.seguradora.observacoes.equivalenciaOperacional);
    }
    const ts = TFIN.seguradora.tooltips.receita;
    const tooltipReceita =
      [...new Set(origens)].length > 1
        ? [...new Set(origens)].map((o) => ts[o]).join(' ')
        : ultimaOrigem
          ? ts[ultimaOrigem]
          : undefined;
    colunas = colunasSeguradora(v24, tooltipReceita);
  }
  const notaEx = v2 ? notaExercicio(anos.map((a) => fyPorAno.get(a)?.dtFim)) : null;
  if (notaEx) notas.push(notaEx);
  if (linhas.some((l) => l.ano !== null && l.selos.includes(SELO_CONF))) {
    notas.push(TF.notaProventosConferencia);
  }

  const perShareConf = anosPerShareEmConferencia(e.perShare, e.multiplos, { mediana: true });
  const linhasConf = linhas.map((l) =>
    conferirPerShare(conferirLinha(l, 'acao', e.conferencia), COLUNAS_PER_SHARE.acao, perShareConf),
  );
  const resposta: FundamentosResposta = {
    nivel: 'essencial',
    unidade: v24 ? 'R$ bi' : 'R$ mi',
    fonte: 'CVM',
    padraoContabil,
    escopo,
    variante: 'acao',
    colunas: colunasComRegras(colunas, false, opts.regraPayout),
    linhas: linhasConf,
    observacoes: notas,
    template: e.template,
  };
  if (v24) resposta.textoFonte = textoNotaFonte('acao', ['cvm'], e.rotulosFontes);
  return resposta;
}

// ---------------------------------------------------------------------------
// FIIs
// ---------------------------------------------------------------------------

export interface TrimestreFii {
  /** último dia do trimestre (AAAA-MM-DD) */
  refQuarter: string;
  receitaAluguel: number | null;
  resultadoTrimestral: number | null;
  vacanciaFisicaCvmPct: number | null;
  nImoveisRenda: number | null;
  nImoveisOutros: number | null;
  areaM2: number | null;
  nCri: number | null;
  maiorCriPct: number | null;
  flags: string[];
}

export interface PerShareAnoFii {
  anoFiscal: number;
  rendCota: number | null;
  vpCotaFim: number | null;
  /** decisão 1: salto_acoes_sem_evento / dados_incompletos */
  flags?: string[] | null;
}

export interface MultiplosAnoFii {
  anoFiscal: number;
  pvp: number | null;
  dyPct: number | null;
  vacanciaFisicaCvmPct: number | null;
  nImoveisCvm: number | null;
  flags?: string[] | null;
}

export interface MultiplosAtuaisFii {
  pvp: number | null;
  dy12mPct: number | null;
  vpCota: number | null;
  rend12m: number | null;
}

export interface EntradaFundamentosFii {
  hoje: string;
  fiiTipo: FiiTipoTela | null;
  trimestres: TrimestreFii[];
  perShare: PerShareAnoFii[];
  multiplos: MultiplosAnoFii[];
  atual: MultiplosAtuaisFii | null;
  /** meses com desdobramento de cotas (fii_monthly.fatorDesdobramento) */
  desdobramentos: Array<{ refMonth: string; fator: number }>;
  proventosEmConferencia: boolean;
  /**
   * Casamento ticker↔CNPJ não conferido (flag cnpj_em_conferencia): o informe CVM pode ser de
   * outro fundo ⇒ receita, resultado, VP/cota, P/VP, vacância, imóveis, área e CRIs saem 'em
   * conferência'. Rendimento/cota e DY (proventos da B3 sobre a cotação) continuam.
   */
  cnpjEmConferencia?: boolean;
  /** bloco C: flags 'conf:' e motivos da linha; ausente = como hoje */
  conferencia?: ConferenciaEntrada;
  /** episódios de vacância liberados pela curadoria ('regra|chave'; saneamentoVacancia) */
  vacanciaLiberadas?: string[];
}

/** Colunas do FII que vêm do informe CVM do CNPJ. */
const COLUNAS_INFORME_FII: ReadonlySet<string> = new Set([
  'receita',
  'resultado',
  'vpCota',
  'pvp',
  'vacancia',
  'nImoveis',
  'area',
  'nCri',
  'maiorCri',
]);

function semInformeConferido(
  valores: Record<string, Estado<number>>,
): Record<string, Estado<number>> {
  const em = ausenteCom('cnpj_em_conferencia', TEXTOS_TELA.ausentesPorCampo.cnpjEmConferencia);
  return Object.fromEntries(
    Object.entries(valores).map(([k, v]) => [k, COLUNAS_INFORME_FII.has(k) ? em : v]),
  );
}

const COLUNAS_FII_BASE: ColunaFundamentos[] = [
  coluna('receita', 'numero'),
  coluna('resultado', 'numero'),
  coluna('rendCota', 'numero2'),
  coluna('dy', 'pct'),
  coluna('vpCota', 'numero2'),
  coluna('pvp', 'numero2'),
];
const COLUNAS_FII_TIJOLO: ColunaFundamentos[] = [
  ...COLUNAS_FII_BASE,
  coluna('vacancia', 'pct', true),
  coluna('nImoveis', 'inteiro', true),
  // rec. 7: 'Área (CVM)' no lugar de ABL (a área informada à CVM não é a ABL do gestor)
  { codigo: 'area', rotulo: TE.areaFii, formato: 'inteiro', fonteCvmAviso: true },
];
const COLUNAS_FII_PAPEL: ColunaFundamentos[] = [
  ...COLUNAS_FII_BASE,
  coluna('nCri', 'inteiro', true),
  coluna('maiorCri', 'pct', true),
];

export function somaTrimestres(
  trimestres: TrimestreFii[],
  campo: 'receitaAluguel' | 'resultadoTrimestral',
): Estado<number> {
  if (trimestres.length < 4) {
    return ausenteCom('ano_incompleto', TEXTOS_TELA.ativo.anoIncompletoFii);
  }
  const valores = trimestres.map((t) => t[campo]);
  if (valores.some((v) => typeof v !== 'number' || !Number.isFinite(v))) return semDado();
  return ok((valores as number[]).reduce((a, b) => a + b, 0) / 1e6);
}

/** Papel: sem aluguel informado (nulo ou zero) ⇒ 'não se aplica' (a coluna sai se for assim sempre). */
function receitaPapel(ts: TrimestreFii[], soma: Estado<number>): Estado<number> {
  const semAluguel = ts.every((t) => t.receitaAluguel === null || t.receitaAluguel === 0);
  return semAluguel ? naoSeAplicaCom('papel_sem_imoveis') : soma;
}

function nImoveis(t: TrimestreFii | undefined): number | null {
  if (!t || t.nImoveisRenda == null) return null;
  return t.nImoveisRenda + (t.nImoveisOutros ?? 0);
}

/**
 * Vacância do trimestre (4º do ano ou o mais recente). Trimestre com a vacância em conferência pela
 * série (A4 do backtest: ocupação no campo de vacância, salto brusco) = '—' + chip, o número do
 * informe só no "Por quê?" — a mesma política do grupo 'fii_vacancia' no Quadro.
 */
function vacanciaDe(
  t: TrimestreFii | undefined,
  anual: number | null | undefined,
  emConf: ReadonlyMap<string, VacanciaEmConferencia>,
): { estado: Estado<number>; conferencia: boolean } {
  if (t?.flags.includes('nsa:vacanciaFisicaCvmPct')) {
    return { estado: naoSeAplicaCom('papel_sem_imoveis'), conferencia: false };
  }
  const estado = estadoDe(t?.vacanciaFisicaCvmPct ?? anual);
  const c = t ? emConf.get(t.refQuarter) : undefined;
  if (!c) return { estado, conferencia: false };
  const flag = formatarFlagConf({ grupo: 'fii_vacancia', regra: c.regra, chave: c.chave });
  const r = aplicarConferenciaCampo(estado, [flag], [], 'vacanciaCvm', 'fii', { pagina: true });
  return { estado: r.estado, conferencia: r.conf !== null };
}

export function montarFundamentosFii(e: EntradaFundamentosFii): FundamentosResposta {
  const papel = e.fiiTipo === 'papel';
  const colunas = papel ? COLUNAS_FII_PAPEL : COLUNAS_FII_TIJOLO;
  const anoAtual = anoDe(e.hoje);
  const cnpjConf = e.cnpjEmConferencia === true;
  const desdobramentos = cnpjConf ? [] : e.desdobramentos;
  const trimestres = (cnpjConf ? [] : [...e.trimestres]).sort((a, b) =>
    a.refQuarter.localeCompare(b.refQuarter),
  );
  const trimPorAno = new Map<number, TrimestreFii[]>();
  for (const t of trimestres) {
    const ano = anoDe(t.refQuarter);
    trimPorAno.set(ano, [...(trimPorAno.get(ano) ?? []), t]);
  }
  const psPorAno = new Map(e.perShare.map((p) => [p.anoFiscal, p]));
  const mPorAno = new Map(e.multiplos.map((m) => [m.anoFiscal, m]));
  const vacConf = papel
    ? new Map<string, VacanciaEmConferencia>()
    : conferirVacancia(
        trimestres.map((t) => ({
          refQuarter: t.refQuarter,
          vacanciaPct: t.flags.includes('nsa:vacanciaFisicaCvmPct') ? null : t.vacanciaFisicaCvmPct,
          receitaAluguel: t.receitaAluguel,
        })),
        SCORING_PARAMS_V1.sanidade.fii,
        liberadaPor(e.vacanciaLiberadas),
      );
  // Anos com dado anual (per-share/múltiplos); só trimestres soltos (ex.: o 4T do ano de estreia)
  // não abrem linha. Sem dado anual nenhum, valem os anos com informe trimestral.
  const candidatos = new Set<number>([
    ...e.perShare.map((p) => p.anoFiscal),
    ...e.multiplos.map((m) => m.anoFiscal),
  ]);
  if (candidatos.size === 0) for (const ano of trimPorAno.keys()) candidatos.add(ano);
  const anos = anosFechados(
    [...candidatos].map((ano) => ({ ano })),
    e.hoje,
  )
    .slice(-MAX_ANOS_ESSENCIAL)
    .map((p) => p.ano);

  const fator = (ano: number) => fatorCotasApos(`${ano}-12-31`, desdobramentos);
  const serieRend = anosFechados(
    e.perShare.map((p) => ({ ano: p.anoFiscal, valor: dividir(p.rendCota, fator(p.anoFiscal)) })),
    e.hoje,
  );
  const suspeitos = new Set(detectarSaltoProvento(serieRend).anosSuspeitos);

  let algumIncompleto = false;
  const linhas: LinhaFundamentos[] = anos.map((ano, i) => {
    const ts = trimPorAno.get(ano) ?? [];
    const q4 = ts.find((t) => t.refQuarter.slice(5, 7) === '12');
    const ps = psPorAno.get(ano);
    const m = mPorAno.get(ano);
    const f = fator(ano);
    const receita = somaTrimestres(ts, 'receitaAluguel');
    if (!cnpjConf && receita.estado === 'ausente' && receita.motivo === 'ano_incompleto') {
      algumIncompleto = true;
    }
    let vacEmConf = false;
    const valores: Record<string, Estado<number>> = {
      receita: papel ? receitaPapel(ts, receita) : receita,
      resultado: somaTrimestres(ts, 'resultadoTrimestral'),
      rendCota: estadoDe(dividir(ps?.rendCota, f)),
      dy: estadoDe(m?.dyPct),
      vpCota: estadoDe(dividir(ps?.vpCotaFim, f)),
      pvp: estadoDe(m?.pvp),
    };
    if (papel) {
      valores.nCri = estadoDe(q4?.nCri);
      valores.maiorCri = estadoDe(q4?.maiorCriPct);
    } else {
      const vac = vacanciaDe(q4, m?.vacanciaFisicaCvmPct, vacConf);
      valores.vacancia = vac.estado;
      vacEmConf = vac.conferencia;
      valores.nImoveis = estadoDe(nImoveis(q4) ?? m?.nImoveisCvm);
      valores.area = estadoDe(q4?.areaM2);
    }
    const selos: TipoSeloEstado[] = suspeitos.has(ano) ? [SELO_CONF] : [];
    if (vacEmConf && !cnpjConf) selos.push(SELO_CONF_BLOCO_C);
    return {
      rotulo: String(ano),
      ano,
      ultimoAno: i === anos.length - 1,
      valores: cnpjConf ? semInformeConferido(valores) : valores,
      selos,
    };
  });

  // Últ. 12m: os 4 últimos trimestres, se o mais recente é posterior ao último ano fechado.
  // Informe em conferência: a linha sai só com os proventos de 12 meses (B3), se houver.
  const ultimos4 = trimestres.slice(-4);
  const ultimo = ultimos4[ultimos4.length - 1];
  const ultimoAnoFechado = anos[anos.length - 1] ?? anoAtual - 1;
  const ult12mSoProventos =
    cnpjConf && e.atual !== null && (e.atual.rend12m != null || e.atual.dy12mPct != null);
  if (ult12mSoProventos) {
    const a = e.atual;
    const conf = e.proventosEmConferencia;
    const textoConf = conf ? TEXTOS_TELA.ausentesPorCampo.dyEmConferencia : undefined;
    const base: Record<string, Estado<number>> = {
      rendCota: estadoDe(a?.rend12m, textoConf),
      dy: estadoDe(a?.dy12mPct, textoConf),
    };
    for (const c of colunas) if (!(c.codigo in base)) base[c.codigo] = semDado();
    linhas.push({
      rotulo: TEXTOS_TELA.ativo.ult12mTabela,
      ano: null,
      ultimoAno: false,
      valores: semInformeConferido(base),
      selos: conf ? [SELO_CONF] : [],
    });
  } else if (ultimo && anoDe(ultimo.refQuarter) > ultimoAnoFechado) {
    const a = e.atual;
    const conf = e.proventosEmConferencia;
    const valores: Record<string, Estado<number>> = {
      receita: somaTrimestres(ultimos4, 'receitaAluguel'),
      resultado: somaTrimestres(ultimos4, 'resultadoTrimestral'),
      rendCota: estadoDe(
        a?.rend12m,
        conf ? TEXTOS_TELA.ausentesPorCampo.dyEmConferencia : undefined,
      ),
      dy: estadoDe(a?.dy12mPct, conf ? TEXTOS_TELA.ausentesPorCampo.dyEmConferencia : undefined),
      vpCota: estadoDe(a?.vpCota),
      pvp: estadoDe(a?.pvp),
    };
    if (papel) valores.receita = receitaPapel(ultimos4, valores.receita);
    let vacEmConf = false;
    if (papel) {
      valores.nCri = estadoDe(ultimo.nCri);
      valores.maiorCri = estadoDe(ultimo.maiorCriPct);
    } else {
      // a linha do Quadro já traz o grupo (motor de sanidade, v2): conferirLinha aplica abaixo
      const doQuadro = (e.conferencia?.flags ?? []).some((f) => f.startsWith('conf:fii_vacancia:'));
      const vac = vacanciaDe(ultimo, null, doQuadro ? new Map() : vacConf);
      valores.vacancia = vac.estado;
      vacEmConf = vac.conferencia;
      valores.nImoveis = estadoDe(nImoveis(ultimo));
      valores.area = estadoDe(ultimo.areaM2);
    }
    const selos: TipoSeloEstado[] = conf ? [SELO_CONF] : [];
    if (vacEmConf) selos.push(SELO_CONF_BLOCO_C);
    linhas.push({
      rotulo: TEXTOS_TELA.ativo.ult12mTabela,
      ano: null,
      ultimoAno: false,
      valores,
      selos,
    });
  }

  const notas: string[] = [TF.unidadeFii];
  if (algumIncompleto) notas.push(`— ${TEXTOS_TELA.ativo.anoIncompletoFii}`);
  if (linhas.some((l) => l.ano === null)) notas.push(TF.notaUlt12m);
  if (cnpjConf) notas.push(`— ${TEXTOS_TELA.ausentesPorCampo.cnpjEmConferencia}`);
  else if (!papel) notas.push(TF.notaCvmGestor);
  if (linhas.some((l) => l.ano !== null && l.selos.includes(SELO_CONF))) {
    notas.push(TF.notaProventosConferencia);
  }

  // decisão 1 (só as flags do ano: emissões de cotas mudam o nº de cotas sem erro de base)
  const perShareConf = anosPerShareEmConferencia(e.perShare, e.multiplos, { mediana: false });
  const linhasConf = linhas.map((l) =>
    conferirPerShare(conferirLinha(l, 'fii', e.conferencia), COLUNAS_PER_SHARE.fii, perShareConf),
  );
  return {
    nivel: 'essencial',
    unidade: 'R$ mi',
    fonte: 'CVM',
    padraoContabil: null,
    escopo: null,
    variante: papel ? 'fii_papel' : 'fii_tijolo',
    colunas: semColunasNaoAplicaveis(colunas, linhasConf),
    linhas: linhasConf,
    observacoes: notas,
  };
}

// ---------------------------------------------------------------------------
// Leitura do banco
// ---------------------------------------------------------------------------

const cache = getTtlCache<FundamentosResposta>('analiseAtivosFundamentos');

/** Só para testes. */
export function _limparCacheFundamentos(ticker: string, versao: string): void {
  cache.del(`${ticker}:${versao}`);
}

export interface ResultadoLeitura<T> {
  dados: T;
  /** true quando veio do cache em memória */
  cache: boolean;
}

/** Ano inicial das leituras: 10 anos fechados + folga para o CAGR/salto. */
export function anoInicioLeitura(hoje: string): number {
  return anoDe(hoje) - MAX_ANOS_ESSENCIAL - 2;
}

/** criteria_params vigentes (cache do Quadro); falha = os do código (o Essencial nunca quebra). */
async function lerParamsEssencial(): Promise<CriteriaParams> {
  try {
    return await obterCriteriaParamsQuadro();
  } catch {
    return CRITERIA_PARAMS_CODIGO;
  }
}

/**
 * Pontos aprovados do lucro descontado (net_income_adjusted) do ticker, de qualquer fonte (a
 * prioridade do params decide no resolverSeries). Falha de leitura = nenhum ponto (fallback).
 */
async function lerDescontado(
  symbol: string,
  desdeAno: number,
): ReturnType<typeof lerPontosVigentes> {
  try {
    return await lerPontosVigentes(prisma, [symbol], ['net_income_adjusted'], desdeAno);
  } catch {
    return [];
  }
}

/** Cache curto da regra proventos.jcpLiquido da scoring vigente (próximos proventos no topo). */
const cacheJcpLiquido = getTtlCache<boolean>('analiseAtivosRegraJcpLiquido');

/** proventos.jcpLiquido da scoring_params VIGENTE. Falha de leitura = false (o de hoje). */
export async function jcpLiquidoVigente(): Promise<boolean> {
  const emCache = cacheJcpLiquido.get('vigente');
  if (emCache !== undefined) return emCache;
  let ligado = false;
  try {
    ligado = regrasCalculoDe((await obterScoringParams(prisma)).params).jcpLiquido;
  } catch {
    ligado = false;
  }
  cacheJcpLiquido.set('vigente', ligado, 5 * 60_000);
  return ligado;
}

/** Cache curto da payout.regra da scoring vigente (o sub-rótulo segue o número, F2). */
const cacheRegra = getTtlCache<RegraPayout>('analiseAtivosRegraPayout');

/**
 * payout.regra da scoring_params VIGENTE (F2, A4.a): decide o que o payout mede no Essencial e no
 * Raio-X, nunca a chave de tela. Falha de leitura = 'dmpl_dpa' (o de hoje).
 */
export async function regraPayoutVigente(): Promise<RegraPayout> {
  const emCache = cacheRegra.get('vigente');
  if (emCache) return emCache;
  let regra: RegraPayout = 'dmpl_dpa';
  try {
    regra = regrasCalculoDe((await obterScoringParams(prisma)).params).payoutRegra;
  } catch {
    regra = 'dmpl_dpa';
  }
  cacheRegra.set('vigente', regra, 5 * 60_000);
  return regra;
}

/** null = ticker fora da área (a rota responde 404). */
export async function obterFundamentosEssencial(
  ticker: string,
  hoje: string = hojeSaoPaulo(),
): Promise<ResultadoLeitura<FundamentosResposta> | null> {
  const symbol = ticker.toUpperCase();
  const linha = await obterLinhaQuadro(symbol);
  if (!linha) return null;
  const versao = await versaoQuadro();
  // F2: a chave de tela e a regra do payout entram na chave do cache (mudam a resposta)
  const essencialV2 = analiseAtivosEssencialV2Habilitado();
  const chave = `${symbol}:${versao}${essencialV2 ? ':v2' : ''}`;
  const emCache = cache.get(chave);
  if (emCache) return { dados: emCache, cache: true };

  const desdeAno = anoInicioLeitura(hoje);
  const desde = `${desdeAno}-01-01`;
  const conf = proventosEmConferencia(linha.flags, linha.motivosIncompleto);

  let dados: FundamentosResposta;
  if (linha.classe === 'fii') {
    // ticker↔CNPJ não conferido: o informe do CNPJ pode ser de outro fundo (nem é lido)
    const cnpjEmConferencia = linha.flags.includes(FLAG_CNPJ_EM_CONFERENCIA);
    const [trim, ps, my, mc, desd, vacLib] = await Promise.all([
      cnpjEmConferencia
        ? Promise.resolve([])
        : prisma.fiiQuarterly.findMany({
            where: { cnpj: linha.cnpj, refQuarter: { gte: new Date(`${desde}T00:00:00Z`) } },
            orderBy: { refQuarter: 'asc' },
            select: {
              refQuarter: true,
              receitaAluguel: true,
              resultadoTrimestral: true,
              vacanciaFisicaCvmPct: true,
              nImoveisRenda: true,
              nImoveisOutros: true,
              areaM2: true,
              nCri: true,
              maiorCriPct: true,
              flags: true,
            },
          }),
      prisma.assetPerShareYearly.findMany({
        where: { symbol, anoFiscal: { gte: desdeAno } },
        select: { anoFiscal: true, rendCota: true, vpCotaFim: true, flags: true },
      }),
      prisma.assetMultiplesYearly.findMany({
        where: { symbol, anoFiscal: { gte: desdeAno } },
        select: {
          anoFiscal: true,
          pvp: true,
          dyPct: true,
          vacanciaFisicaCvmPct: true,
          nImoveisCvm: true,
          flags: true,
        },
      }),
      prisma.assetMultiplesCurrent.findUnique({
        where: { symbol },
        select: { pvp: true, dy12mPct: true, vpCota: true, rend12m: true },
      }),
      cnpjEmConferencia
        ? Promise.resolve([])
        : prisma.fiiMonthly.findMany({
            where: { cnpj: linha.cnpj, fatorDesdobramento: { not: null } },
            select: { refMonth: true, fatorDesdobramento: true },
          }),
      cnpjEmConferencia
        ? Promise.resolve(new Map<string, string[]>())
        : liberacoesVacancia(prisma, [symbol]),
    ]);
    dados = montarFundamentosFii({
      hoje,
      fiiTipo: (linha.fiiTipo as FiiTipoTela | null) ?? null,
      trimestres: trim.map((t) => ({
        ...t,
        refQuarter: paraData(t.refQuarter),
        receitaAluguel: paraNumero(t.receitaAluguel),
        resultadoTrimestral: paraNumero(t.resultadoTrimestral),
      })),
      perShare: ps,
      multiplos: my,
      atual: mc,
      desdobramentos: desd.map((d) => ({
        refMonth: paraData(d.refMonth),
        fator: d.fatorDesdobramento as number,
      })),
      proventosEmConferencia: conf,
      cnpjEmConferencia,
      conferencia: { flags: linha.flags, motivos: linha.motivosIncompleto },
      vacanciaLiberadas: vacLib.get(symbol.toUpperCase()),
    });
  } else {
    // A6: o template de financeira sai do segmento B3 do emissor (só com a chave)
    const emissores = analiseAtivosTemplatesFinanceirasHabilitado()
      ? await listarEmissores(prisma, [linha.cnpj])
      : undefined;
    const template = emissores?.[0] ? templateDoEmissor(emissores[0]) : null;
    const [periodos, ps, my, mc, params, pontosDescontado] = await Promise.all([
      fundamentosVigentes(prisma, [linha.cnpj], {
        tipos: ['FY', 'TTM'],
        desde,
        ...(emissores ? { emissores } : {}),
      }),
      prisma.assetPerShareYearly.findMany({
        where: { symbol, anoFiscal: { gte: desdeAno } },
        select: {
          anoFiscal: true,
          lpaAjHoje: true,
          dpaAjHoje: true,
          payoutDmplPct: true,
          acoesFim: true,
          flags: true,
        },
      }),
      prisma.assetMultiplesYearly.findMany({
        where: { symbol, anoFiscal: { gte: desdeAno } },
        select: {
          anoFiscal: true,
          pl: true,
          pvp: true,
          dyPct: true,
          roePct: true,
          margemLiquidaPct: true,
          payoutPct: true,
          flags: true,
        },
      }),
      prisma.assetMultiplesCurrent.findUnique({
        where: { symbol },
        select: {
          pl: true,
          pvp: true,
          dy12mPct: true,
          roePct: true,
          margemLiquidaPct: true,
          payoutPct: true,
          lpaTtm: true,
          dpa12m: true,
        },
      }),
      lerParamsEssencial(),
      // F2: com a chave, um lucro líquido só (o descontado nem é lido)
      essencialV2 ? Promise.resolve([]) : lerDescontado(symbol, desdeAno),
    ]);
    const regraPayout = await regraPayoutVigente();
    const descontado = resolverSeries({
      pontos: pontosDescontado,
      series: ['net_income_adjusted'],
      fontes: fontesEfetivas(params),
    });
    const ttms = periodos
      .filter((p) => p.tipoPeriodo === 'TTM')
      .sort((a, b) => a.dtFim.localeCompare(b.dtFim));
    dados = montarFundamentosAcao(
      {
        hoje,
        financeira: linha.regua === 'acao_financeira',
        fys: periodos.filter((p) => p.tipoPeriodo === 'FY'),
        ttm: ttms[ttms.length - 1] ?? null,
        perShare: ps.map((p) => ({ ...p, acoesFim: paraNumero(p.acoesFim) })),
        multiplos: my,
        atual: mc,
        proventosEmConferencia: conf,
        conferencia: {
          flags: [...linha.flags, ...flagsAnuaisConf(my)],
          motivos: linha.motivosIncompleto,
        },
        regras: regrasEssencialDe(params),
        descontado: {
          valores: descontado.series.net_income_adjusted ?? {},
          origens: descontado.origens.net_income_adjusted,
        },
        rotulosFontes: rotulosFontes(),
        ...(template ? { template } : {}),
      },
      { layout: 'v24', ...(essencialV2 ? { essencialV2 } : {}), regraPayout },
    );
  }
  cache.set(chave, dados, TTL_ANALISE_MS);
  return { dados, cache: false };
}
