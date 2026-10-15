/**
 * CONTRATOS da camada de fontes de fundamentos — Análise de Ativos v2.5 (fatia 0, "Contratos").
 *
 * Fonte: docs/analise-ativos/v25-regras-pedro/desenho.json (final.camada_fontes) + spec do Pedro
 * §5 (modelo de dados) e §6 (pipeline: proveniência por linha, point-in-time, review_status, nada
 * 'pending' na tela, sanidade, o app nunca chama terceiros na renderização).
 *
 * Congelados: a fatia A (registro, FonteCvm, fonteExemplo, sanidade, ingestão, curadoria) e a B
 * (Essencial, card) programam contra estes tipos. Mudança aqui = PR na fatia 0.
 *
 * Regras que os tipos carregam:
 * - SERIES_FUNDAMENTO é um catálogo FECHADO com os nomes da spec. O banco guarda `serie` como texto
 *   (série nova = entrada aqui, sem migration); campo de conector fora do catálogo é descartado e só
 *   conta no log da ingestão.
 * - Sem nota proprietária: nenhuma série nem campo casa /score|rating|nota|indice/ (teste
 *   contratoSemNota). Um provedor que entregue rating/score tem o campo descartado.
 * - Valor de PontoSerie na UNIDADE DO CATÁLOGO: BRL em reais (não em milhões), pct em pontos
 *   percentuais (10 = 10%), x em vezes, contagem inteira, BRL_por_cota em reais por cota. A conversão
 *   para a unidade dos critérios (R$ mi) é do resolverSeries (ESCALA_CRITERIO).
 * - Só 'approved' chega à tela (repositorio/fontesFundamentos.ts e resolverSeries); 'pending' e
 *   'rejected' nunca aparecem.
 *
 * Mapa de donos: 0 = este arquivo, resolverSeries.ts (puro), repositorio/fontesFundamentos.ts
 * (leitura approved). A = fontes/fundamentos/{registro,fonteCvm,fonteExemplo,sanidadeFonte,
 * ingerirFontes}.ts, repositorio/fontesFundamentosEscrita.ts, job 'fontes-fundamentos', curadoria
 * 'fonte_externa'. B = leitura no Essencial e no card (nota de fonte e selo 'dados incompletos').
 */
import type { PrismaClient } from '@prisma/client';
import type { ClasseQuadro } from '@/types/analiseAtivosApi';

// ===========================================================================
// Catálogo de séries (nomes da spec §4.1/§5)
// ===========================================================================

export const SERIES_FUNDAMENTO = [
  // ações (fundamentals_period)
  'revenue',
  'net_income',
  'net_income_adjusted',
  'ebitda',
  'net_margin',
  'net_debt',
  'net_debt_ebitda',
  'free_cash_flow',
  'capex',
  // FII (fundamentals FII / multiples_yearly)
  'income_per_share',
  'nav_per_share',
  'vacancy_physical',
  'vacancy_financial',
  'leverage_pct',
  'months_with_income',
  'ffo',
  'properties_count',
  'gla_m2',
  'cap_rate',
  // FII (fii_property_quality)
  'default_pct',
  'ltv_avg',
] as const;
export type SerieFundamento = (typeof SERIES_FUNDAMENTO)[number];

export function ehSerieFundamento(v: unknown): v is SerieFundamento {
  return typeof v === 'string' && (SERIES_FUNDAMENTO as readonly string[]).includes(v);
}

/** Unidade do valor GRAVADO (asset_fundamentals_serie.unidade). */
export const UNIDADES_SERIE = ['BRL', 'BRL_por_cota', 'pct', 'x', 'contagem'] as const;
export type UnidadeSerie = (typeof UNIDADES_SERIE)[number];

/** Periodicidade de um ponto (asset_fundamentals_serie.tipoPeriodo). */
export const PERIODICIDADES_SERIE = ['FY', 'Q', 'M'] as const;
export type PeriodicidadeSerie = (typeof PERIODICIDADES_SERIE)[number];

/** Mercado de uma fonte/série. Stocks e REITs ficam só no tipo (fora do escopo da v2.5). */
export const MERCADOS_FONTE = ['br_acoes', 'br_fii', 'us_stocks', 'us_reits'] as const;
export type MercadoFonte = (typeof MERCADOS_FONTE)[number];

/** Mercado da classe com tela (acao → br_acoes; fii → br_fii). */
export const MERCADO_DA_CLASSE: Record<ClasseQuadro, MercadoFonte> = {
  acao: 'br_acoes',
  fii: 'br_fii',
};

export interface DefSerieFundamento {
  unidade: UnidadeSerie;
  mercados: readonly MercadoFonte[];
  /** periodicidade nativa (o que a CVM/provedor publica); FY dispensa agregação */
  periodicidade: PeriodicidadeSerie;
}

const ACOES: readonly MercadoFonte[] = ['br_acoes', 'us_stocks'];
const FII: readonly MercadoFonte[] = ['br_fii', 'us_reits'];

/** Catálogo fechado: unidade, mercado e periodicidade nativa de cada série. */
export const CATALOGO_SERIES: Record<SerieFundamento, DefSerieFundamento> = {
  revenue: { unidade: 'BRL', mercados: ACOES, periodicidade: 'FY' },
  net_income: { unidade: 'BRL', mercados: ACOES, periodicidade: 'FY' },
  net_income_adjusted: { unidade: 'BRL', mercados: ACOES, periodicidade: 'FY' },
  ebitda: { unidade: 'BRL', mercados: ACOES, periodicidade: 'FY' },
  net_margin: { unidade: 'pct', mercados: ACOES, periodicidade: 'FY' },
  net_debt: { unidade: 'BRL', mercados: ACOES, periodicidade: 'FY' },
  net_debt_ebitda: { unidade: 'x', mercados: ACOES, periodicidade: 'FY' },
  free_cash_flow: { unidade: 'BRL', mercados: ACOES, periodicidade: 'FY' },
  capex: { unidade: 'BRL', mercados: ACOES, periodicidade: 'FY' },
  income_per_share: { unidade: 'BRL_por_cota', mercados: FII, periodicidade: 'FY' },
  nav_per_share: { unidade: 'BRL_por_cota', mercados: FII, periodicidade: 'FY' },
  vacancy_physical: { unidade: 'pct', mercados: FII, periodicidade: 'Q' },
  vacancy_financial: { unidade: 'pct', mercados: FII, periodicidade: 'Q' },
  leverage_pct: { unidade: 'pct', mercados: FII, periodicidade: 'FY' },
  months_with_income: { unidade: 'contagem', mercados: FII, periodicidade: 'FY' },
  ffo: { unidade: 'BRL', mercados: FII, periodicidade: 'FY' },
  properties_count: { unidade: 'contagem', mercados: FII, periodicidade: 'Q' },
  gla_m2: { unidade: 'contagem', mercados: FII, periodicidade: 'Q' },
  cap_rate: { unidade: 'pct', mercados: FII, periodicidade: 'FY' },
  default_pct: { unidade: 'pct', mercados: FII, periodicidade: 'M' },
  ltv_avg: { unidade: 'pct', mercados: FII, periodicidade: 'M' },
};

// ===========================================================================
// Fontes
// ===========================================================================

/**
 * Id de uma fonte: 'cvm' (leitura local das tabelas já ingeridas), 'exemplo' (fake determinístico,
 * recusado com NODE_ENV=production pelo registro da fatia A) ou o id de um conector registrado
 * (minúsculas, dígitos e '_', 2–32 caracteres; ver RE_ID_FONTE).
 */
export const IDS_FONTE_CONHECIDOS = ['cvm', 'exemplo'] as const;
export type IdFonte = (typeof IDS_FONTE_CONHECIDOS)[number] | (string & {});
export const RE_ID_FONTE = /^[a-z][a-z0-9_]{1,31}$/;

/** Camada da sanidade (§6): a CVM ou qualquer provedor externo. */
export type CamadaFonte = 'cvm' | 'provedor';

export function camadaDaFonte(id: IdFonte): CamadaFonte {
  return id === 'cvm' ? 'cvm' : 'provedor';
}

export type ModoFonte = 'leitura_local' | 'ingestao';

export const REVIEW_STATUS = ['approved', 'pending', 'rejected'] as const;
export type ReviewStatus = (typeof REVIEW_STATUS)[number];

export const EXTRACTED_BY = ['api', 'manual', 'llm'] as const;
export type ExtractedBy = (typeof EXTRACTED_BY)[number];

/** Agregação de séries mensais/trimestrais no valor do ano (decisão 4 do Wellington: 'ultimo'). */
export type AgregacaoAnual = 'ultimo' | 'media';

/** Ativo pedido a uma fonte. */
export interface AtivoFonte {
  symbol: string;
  /** CNPJ (CVM) ou null quando não conferido */
  emissorId: string | null;
  classe: ClasseQuadro;
  mercado: MercadoFonte;
}

/** Ponto de uma série como o CONECTOR entrega (antes da sanidade e da gravação). */
export interface PontoSerie {
  symbol: string;
  emissorId?: string | null;
  classe: ClasseQuadro;
  serie: SerieFundamento;
  tipoPeriodo: PeriodicidadeSerie;
  anoFiscal: number;
  /** fim do período, 'AAAA-MM-DD' */
  dtFim: string;
  /** na unidade do catálogo; null = a fonte informou o período sem o valor */
  valor: number | null;
  sourceUrl?: string | null;
  sourceRef?: string | null;
  extractedBy: ExtractedBy;
  /** 0–1; só extração (llm/manual) */
  confianca?: number | null;
  sourcePdfUrl?: string | null;
  sourcePage?: number | null;
}

/**
 * Ponto VIGENTE lido para a tela/motor: maior versão de (symbol, serie, tipoPeriodo, dtFim, fonte),
 * sempre 'approved' (a CVM via lerLocal é approved por definição). `incompleto` = campo obrigatório
 * ausente na ingestão (§6): conta como ausente e acende o selo 'dados incompletos'.
 */
export interface PontoSerieVigente {
  symbol: string;
  serie: SerieFundamento;
  tipoPeriodo: PeriodicidadeSerie;
  anoFiscal: number;
  dtFim: string;
  valor: number | null;
  fonte: IdFonte;
  versao: number;
  incompleto: boolean;
}

/** Qualidade da carteira de FII (§5 fii_property_quality) como o conector entrega. */
export interface QualidadeFii {
  tipo: 'qualidade_fii';
  symbol: string;
  cnpj: string;
  /** fim do período de referência, 'AAAA-MM-DD' */
  periodo: string;
  padAaaPct?: number | null;
  padAaPct?: number | null;
  padAPct?: number | null;
  tenantsCount?: number | null;
  topTenantPct?: number | null;
  atypicalPct?: number | null;
  avgLeaseYears?: number | null;
  criCount?: number | null;
  indexMix?: Partial<Record<'ipca' | 'cdi' | 'igpm' | 'pre' | 'outros', number>> | null;
  avgRate?: number | null;
  ltvAvg?: number | null;
  defaultPct?: number | null;
  highYieldPct?: number | null;
  durationYears?: number | null;
  sourceUrl?: string | null;
  sourcePdfUrl?: string | null;
  /** página de origem por campo */
  sourcePage?: Partial<Record<string, number>> | null;
  extractedBy: ExtractedBy;
  /** confiança por campo (0–1) */
  confianca?: Partial<Record<string, number>> | null;
}

/** Linha vigente de fii_property_quality (approved, maior versão por cnpj × período × fonte). */
export interface QualidadeFiiVigente extends Omit<QualidadeFii, 'tipo' | 'extractedBy'> {
  fonte: IdFonte;
  versao: number;
  incompleto: boolean;
}

/**
 * Origem do valor de uma série num ano (ou numa janela, para o critério): fonte que venceu pela
 * prioridade, série usada (a principal ou a serieFallback), se houve fallback e se a fonte marcou o
 * ponto como incompleto.
 */
export interface OrigemSerie {
  fonte: IdFonte;
  serieUsada: SerieFundamento;
  fallback: boolean;
  incompleto: boolean;
}

/** Contexto do buscar() de um conector (só no job da fatia A; nunca na requisição). */
export interface ContextoBuscaFonte {
  agora: Date;
  /** log estruturado da ingestão (sem segredo) */
  log: (mensagem: string, dados?: Record<string, unknown>) => void;
  signal?: AbortSignal;
  /** credenciais lidas de ANALISE_FONTE_<ID>_* (app.env); nunca logadas */
  credenciais: Readonly<Record<string, string>>;
}

/**
 * Uma fonte de fundamentos. A CVM é 'leitura_local' (lê as tabelas que já existem e devolve pontos
 * vigentes); um provedor é 'ingestao' (buscar() roda SÓ no job 'fontes-fundamentos' e grava em
 * asset_fundamentals_serie / fii_property_quality, point-in-time).
 */
export interface FonteFundamentos {
  id: IdFonte;
  /** nome curto exibido na nota de fonte ('DFP/ITR (CVM)', 'Provedor X') */
  rotulo: string;
  mercados: readonly MercadoFonte[];
  seriesOferecidas: readonly SerieFundamento[];
  modo: ModoFonte;
  lerLocal?: (
    prisma: PrismaClient,
    ativos: readonly AtivoFonte[],
    desdeAno: number,
  ) => Promise<PontoSerieVigente[]>;
  buscar?: (
    ctx: ContextoBuscaFonte,
    ativos: readonly AtivoFonte[],
    desde: Date,
  ) => AsyncIterable<PontoSerie | QualidadeFii>;
}

/** Variável de ambiente que habilita conectores (lista separada por vírgula; vazio = nenhum). */
export const ENV_FONTES_INGESTAO = 'ANALISE_FONTES_INGESTAO';
/** Prefixo das credenciais de um conector: ANALISE_FONTE_<ID>_* (só no app.env). */
export const PREFIXO_ENV_CREDENCIAIS_FONTE = 'ANALISE_FONTE_';

/** Grupo do caso de curadoria aberto para pontos 'pending' de provedor (fatia A). */
export const GRUPO_CURADORIA_FONTE_EXTERNA = 'fonte_externa';
