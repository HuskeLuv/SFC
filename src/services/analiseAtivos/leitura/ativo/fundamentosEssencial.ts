/**
 * Fundamentos · Essencial da página do ativo (fatia C). Só o banco: nenhuma fonte externa.
 *
 * - Até 10 anos FECHADOS (o ano corrente fica fora, series.anosFechados) + a linha 'Últ. 12m'
 *   quando há período mais recente que o último ano fechado. O último ano fechado vem destacado.
 * - Ações: Ano | Receita | Lucro líquido | Margem | ROE | LPA | Div./ação | Payout | P/L | P/VP | DY.
 *   Lucro = atribuível à controladora (consolidado com 'controladora_zero' ⇒ o do individual, regra
 *   12; sem individual ⇒ '—' com o motivo). Div./ação dos anos marcados por detectarSaltoProvento
 *   (DPA > 2× o ano anterior) leva o selo 'proventos em conferência'. Bancos/financeiras: receita e
 *   margem não se aplicam (as colunas saem) e a nota diz o padrão contábil (individual BR GAAP).
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
 */
import { prisma } from '@/lib/prisma';
import { getTtlCache } from '@/lib/simpleTtlCache';
import { fundamentosVigentes } from '@/services/analiseAtivos/repositorio/acoes';
import { paraData, paraNumero } from '@/services/analiseAtivos/repositorio/conversao';
import { lucroParaSequencia } from '@/services/analiseAtivos/regras/calculo/sequencias';
import { proventosEmConferencia } from '@/services/analiseAtivos/regras/calculo/plausibilidadeProventos';
import { obterLinhaQuadro, versaoQuadro } from '@/services/analiseAtivos/leitura/linhasQuadro';
import {
  CAMPO_COLUNA_FUNDAMENTOS,
  flagsAnuaisConf,
} from '@/services/analiseAtivos/leitura/ativo/conferenciasAtivo';
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
} from '@/services/analiseAtivos/leitura/ativo/series';
import {
  TEXTOS_TELA,
  formatarTexto,
  textoMotivo,
  textoNaoSeAplica,
} from '@/services/analiseAtivos/textosTela';
import type { FundamentosPeriodo } from '@/services/analiseAtivos/tipos';
import type {
  ColunaFundamentos,
  Estado,
  FiiTipoTela,
  FormatoAnalise,
  FundamentosResposta,
  LinhaFundamentos,
  PontoSerieAnual,
  TipoSeloEstado,
} from '@/types/analiseAtivosApi';

export const TTL_ANALISE_MS = 30 * 60_000;
export const MAX_ANOS_ESSENCIAL = 10;

const TF = TEXTOS_TELA.analise.fundamentos;
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

/**
 * Fator de desdobramento de cotas de FII depois de `data` (Π dos fatores dos meses posteriores):
 * valor por cota da data ÷ fator = valor na base de cotas de hoje.
 */
export function fatorCotasApos(
  data: string,
  desdobramentos: ReadonlyArray<{ refMonth: string; fator: number }>,
): number {
  return desdobramentos
    .filter((d) => d.refMonth > data && Number.isFinite(d.fator) && d.fator > 0)
    .reduce((acc, d) => acc * d.fator, 1);
}

function dividir(n: number | null | undefined, fator: number): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n / fator : null;
}

function emMilhoes(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n / 1e6 : null;
}

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
}

/** Lucro do período em Estado (regra 12: controladora_zero ⇒ individual; senão motivo). */
export function lucroEstado(f: FundamentosPeriodo): Estado<number> {
  const v = lucroParaSequencia(f);
  if (v.estado === 'ok') return ok(v.valor / 1e6);
  return ausenteCom(v.motivo, textoMotivo(v.motivo));
}

/** Anos (de série anual de proventos por ação) marcados como 'em conferência'. */
export function anosProventoSuspeito(
  perShare: ReadonlyArray<{ anoFiscal: number; dpa: number | null; payout?: number | null }>,
  hoje: string,
): Set<number> {
  const serie: PontoSerieAnual[] = anosFechados(
    perShare.map((p) => ({ ano: p.anoFiscal, valor: p.dpa })),
    hoje,
  );
  const payoutPorAno = Object.fromEntries(perShare.map((p) => [p.anoFiscal, p.payout ?? null]));
  return new Set(detectarSaltoProvento(serie, { payoutPorAno }).anosSuspeitos);
}

const COLUNAS_ACAO: ColunaFundamentos[] = [
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

export function textoPadrao(escopo: string | null, padrao: string | null): string | null {
  if (!escopo || !padrao) return null;
  const e = (TF.escopo as Record<string, string>)[escopo] ?? escopo;
  const p = (TF.padrao as Record<string, string>)[padrao] ?? padrao;
  return `${e} ${p}`;
}

export function montarFundamentosAcao(e: EntradaFundamentosAcao): FundamentosResposta {
  const prejuizo = ausenteCom('prejuizo', TF.prejuizoNoAno);
  const fyPorAno = new Map<number, FundamentosPeriodo>();
  for (const f of e.fys) {
    const atual = fyPorAno.get(f.anoFiscal);
    if (!atual || f.dtFim > atual.dtFim) fyPorAno.set(f.anoFiscal, f);
  }
  const anos = anosFechados(
    [...fyPorAno.keys()].map((ano) => ({ ano })),
    e.hoje,
  )
    .slice(-MAX_ANOS_ESSENCIAL)
    .map((p) => p.ano);
  const psPorAno = new Map(e.perShare.map((p) => [p.anoFiscal, p]));
  const mPorAno = new Map(e.multiplos.map((m) => [m.anoFiscal, m]));
  const suspeitos = anosProventoSuspeito(
    e.perShare.map((p) => ({ anoFiscal: p.anoFiscal, dpa: p.dpaAjHoje, payout: p.payoutDmplPct })),
    e.hoje,
  );
  const naFin = naoSeAplicaCom('financeira');

  const linhas: LinhaFundamentos[] = anos.map((ano, i) => {
    const f = fyPorAno.get(ano)!;
    const ps = psPorAno.get(ano);
    const m = mPorAno.get(ano);
    const lucro = lucroEstado(f);
    const emPrejuizo = lucro.estado === 'ok' && lucro.valor < 0;
    const suspeito = suspeitos.has(ano);
    return {
      rotulo: String(ano),
      ano,
      destaque: i === anos.length - 1,
      valores: {
        receita: e.financeira ? naFin : estadoDe(emMilhoes(f.receita)),
        lucro,
        margem: e.financeira ? naFin : estadoDe(m?.margemLiquidaPct),
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
  });

  const ultimoFy = anos.length ? fyPorAno.get(anos[anos.length - 1])! : null;
  const ttm = e.ttm;
  if (ttm && (!ultimoFy || ttm.dtFim > ultimoFy.dtFim) && anoDe(ttm.dtFim) <= anoDe(e.hoje)) {
    const a = e.atual;
    const lucro = lucroEstado(ttm);
    const emPrejuizo =
      (lucro.estado === 'ok' && lucro.valor < 0) || (a?.lpaTtm != null && a.lpaTtm < 0);
    const conf = e.proventosEmConferencia;
    const prov = (n: number | null | undefined) =>
      conf && n == null ? semDado(TEXTOS_TELA.ausentesPorCampo.dyEmConferencia) : estadoDe(n);
    linhas.push({
      rotulo: TEXTOS_TELA.ativo.ult12mTabela,
      ano: null,
      destaque: false,
      valores: {
        receita: e.financeira ? naFin : estadoDe(emMilhoes(ttm.receita)),
        lucro,
        margem: e.financeira ? naFin : estadoDe(a?.margemLiquidaPct),
        roe: estadoDe(a?.roePct),
        lpa: estadoDe(a?.lpaTtm),
        dpa: prov(a?.dpa12m),
        payout: emPrejuizo ? prejuizo : prov(a?.payoutPct),
        pl: emPrejuizo
          ? ausenteCom('prejuizo', TEXTOS_TELA.ausentesPorCampo.plPrejuizo)
          : estadoDe(a?.pl),
        pvp: estadoDe(a?.pvp),
        dy: prov(a?.dy12mPct),
      },
      selos: conf ? [SELO_CONF] : [],
    });
  }

  const padraoContabil = ultimoFy?.padraoContabil ?? null;
  const escopo = ultimoFy?.escopo ?? null;
  const notas: string[] = [TEXTOS_TELA.ativo.unidadeFundamentos];
  if (e.financeira) notas.push(TF.notaFinanceira);
  if (padraoContabil === 'BRGAAP' || escopo === 'ind') {
    const t = textoPadrao(escopo, padraoContabil);
    if (t) notas.push(formatarTexto(TF.notaPadraoContabil, { valor: t }));
  }
  notas.push(TF.notaLpaAjustado);
  if (linhas.some((l) => l.ano !== null && l.selos.includes(SELO_CONF))) {
    notas.push(TF.notaProventosConferencia);
  }

  const perShareConf = anosPerShareEmConferencia(e.perShare, e.multiplos, { mediana: true });
  const linhasConf = linhas.map((l) =>
    conferirPerShare(conferirLinha(l, 'acao', e.conferencia), COLUNAS_PER_SHARE.acao, perShareConf),
  );
  return {
    nivel: 'essencial',
    unidade: 'R$ mi',
    fonte: 'CVM',
    padraoContabil,
    escopo,
    variante: 'acao',
    colunas: semColunasNaoAplicaveis(COLUNAS_ACAO, linhasConf),
    linhas: linhasConf,
    notas,
  };
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
  coluna('area', 'inteiro', true),
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

function vacanciaDe(t: TrimestreFii | undefined, anual: number | null | undefined) {
  if (t?.flags.includes('nsa:vacanciaFisicaCvmPct')) return naoSeAplicaCom('papel_sem_imoveis');
  return estadoDe(t?.vacanciaFisicaCvmPct ?? anual);
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
      valores.vacancia = vacanciaDe(q4, m?.vacanciaFisicaCvmPct);
      valores.nImoveis = estadoDe(nImoveis(q4) ?? m?.nImoveisCvm);
      valores.area = estadoDe(q4?.areaM2);
    }
    return {
      rotulo: String(ano),
      ano,
      destaque: i === anos.length - 1,
      valores: cnpjConf ? semInformeConferido(valores) : valores,
      selos: suspeitos.has(ano) ? [SELO_CONF] : [],
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
      destaque: false,
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
    if (papel) {
      valores.nCri = estadoDe(ultimo.nCri);
      valores.maiorCri = estadoDe(ultimo.maiorCriPct);
    } else {
      valores.vacancia = vacanciaDe(ultimo, null);
      valores.nImoveis = estadoDe(nImoveis(ultimo));
      valores.area = estadoDe(ultimo.areaM2);
    }
    linhas.push({
      rotulo: TEXTOS_TELA.ativo.ult12mTabela,
      ano: null,
      destaque: false,
      valores,
      selos: conf ? [SELO_CONF] : [],
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
    notas,
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

/** null = ticker fora da área (a rota responde 404). */
export async function obterFundamentosEssencial(
  ticker: string,
  hoje: string = hojeSaoPaulo(),
): Promise<ResultadoLeitura<FundamentosResposta> | null> {
  const symbol = ticker.toUpperCase();
  const linha = await obterLinhaQuadro(symbol);
  if (!linha) return null;
  const versao = await versaoQuadro();
  const chave = `${symbol}:${versao}`;
  const emCache = cache.get(chave);
  if (emCache) return { dados: emCache, cache: true };

  const desdeAno = anoInicioLeitura(hoje);
  const desde = `${desdeAno}-01-01`;
  const conf = proventosEmConferencia(linha.flags, linha.motivosIncompleto);

  let dados: FundamentosResposta;
  if (linha.classe === 'fii') {
    // ticker↔CNPJ não conferido: o informe do CNPJ pode ser de outro fundo (nem é lido)
    const cnpjEmConferencia = linha.flags.includes(FLAG_CNPJ_EM_CONFERENCIA);
    const [trim, ps, my, mc, desd] = await Promise.all([
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
    });
  } else {
    const [periodos, ps, my, mc] = await Promise.all([
      fundamentosVigentes(prisma, [linha.cnpj], { tipos: ['FY', 'TTM'], desde }),
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
    ]);
    const ttms = periodos
      .filter((p) => p.tipoPeriodo === 'TTM')
      .sort((a, b) => a.dtFim.localeCompare(b.dtFim));
    dados = montarFundamentosAcao({
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
    });
  }
  cache.set(chave, dados, TTL_ANALISE_MS);
  return { dados, cache: false };
}
