/**
 * CONTRATOS da feature Stocks e REITs (EUA) na Análise de Ativos — fatia 0 ("Contratos EUA +
 * isolamento dos gravadores", bloqueante).
 *
 * Fonte: docs/analise-ativos/stocks-reits/desenho.json (final.escopo_mvp/criterios/pipeline_dados/
 * schema_prisma/apis/fatias) + decisoes_wellington_17out, que PREVALECEM:
 *  1. Análise EUA SEM preço/múltiplos/Meus cenários atrás de ANALISE_ATIVOS_EUA_PRECO_HABILITADO
 *     (desligada); a Carteira fica como está;
 *  2. Stocks e REITs juntos, com os critérios substitutos dos REITs (n de 6; ocup inativa sem dado);
 *  3. UNIVERSO: stocks com free float ≥ US$ 2 bi (sai abaixo de US$ 1,6 bi); REITs de patrimônio
 *     ≥ US$ 2 bi (UNIVERSO_EUA_PADRAO, também gravado na criteria_params v3);
 *  4. resto = recomendações do desenho.
 *
 * Congelados: as fatias A (dados SEC + preço), B (motor/Quadro EUA), C (telas/APIs de leitura) e D
 * (Carteira/Salvos) programam contra estes tipos SEM arquivo em comum. Mudança aqui = PR na fatia 0.
 *
 * Regras que os tipos carregam:
 * - Nada de nome de índice de mercado (licença): nenhuma chave, tag, filtro, contador ou texto cita
 *   índice — o universo é descrito pela REGRA (bolsa + 10-K + free float de capa).
 * - O ticker vem SEMPRE do arquivo da SEC (company_tickers_exchange.json); o override por CIK só
 *   classifica ou inclui o CIK, nunca fixa ticker (caso medido: CIK 906107 do EQR aparece como VMRK).
 * - Ticker EUA não tem dígito (AAPL, BRK.B); o da B3 sempre tem (PETR4, BDR AAPL34). Assim as chaves
 *   AnaliseQuadroLinha.symbol (@id) e CriteriaEval(symbol, janela) não colidem entre mercados — e os
 *   gravadores ainda checam a colisão (gerarQuadro.gravarLinhasQuadro / repositorio/criterios).
 * - Os gravadores deletam POR CLASSE: o job BR passa CLASSES_BR e o EUA, CLASSES_EUA.
 */
import { CLASSES_EUA, type ClasseEua, type ClasseQuadro } from '@/types/analiseAtivosApi';
import { MERCADO_DA_CLASSE, type MercadoFonte } from '@/types/analiseAtivosFontes';

export { CLASSES_EUA };
export type { ClasseEua };

// ===========================================================================
// Classe → mercado, moeda e família de dados
// ===========================================================================

export type MoedaClasse = 'BRL' | 'USD';

/** Moeda dos valores da classe (BR = BRL; EUA = USD, exibição em US$ mi/bi). */
export function moedaDaClasse(classe: ClasseQuadro): MoedaClasse {
  return classe === 'stock' || classe === 'reit' ? 'USD' : 'BRL';
}

/** Mercado da classe (MERCADO_DA_CLASSE): br_acoes | br_fii | us_stocks | us_reits. */
export function mercadoDaClasse(classe: ClasseQuadro): MercadoFonte {
  return MERCADO_DA_CLASSE[classe];
}

/**
 * De onde vêm os fundamentos da classe:
 * - 'cvm_acao': DFP/ITR da CVM (acao);
 * - 'cvm_fii': informes mensais/trimestrais dos FIIs na CVM (fii);
 * - 'sec': companyfacts XBRL do 10-K (stock e reit — REIT é empresa com demonstrações, não fundo).
 * Use no lugar dos ramos binários `classe === 'fii'` quando a pergunta é "qual fonte/forma de dado".
 */
export type FamiliaDados = 'cvm_acao' | 'cvm_fii' | 'sec';

export function familiaDados(classe: ClasseQuadro): FamiliaDados {
  if (classe === 'acao') return 'cvm_acao';
  if (classe === 'fii') return 'cvm_fii';
  return 'sec';
}

/** Classe imobiliária (FII ou REIT): rendimento/dividendo, segmento de imóveis. */
export function ehClasseImobiliaria(classe: ClasseQuadro): boolean {
  return classe === 'fii' || classe === 'reit';
}

// ===========================================================================
// SEC — acesso (fatia A)
// ===========================================================================

/** User-Agent exigido pela SEC (fair access). Fixo; nunca muda por env. */
export const SEC_USER_AGENT = 'MyFinance suporte@appmyfinance.com.br';
/** Limite de taxa: ≤ 4 req/s (o limite público da SEC é 10; folga deliberada). */
export const SEC_MAX_REQ_POR_SEGUNDO = 4;
export const SEC_URLS = {
  tickersBolsa: 'https://www.sec.gov/files/company_tickers_exchange.json',
  submissions: 'https://data.sec.gov/submissions/CIK{cik}.json',
  companyfacts: 'https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json',
  frames: 'https://data.sec.gov/api/xbrl/frames/{taxonomia}/{conceito}/{unidade}/{periodo}.json',
  /** índice diário: form.AAAAMMDD.idx (incremental do sec-fundamentos) */
  indiceDiario:
    'https://www.sec.gov/Archives/edgar/daily-index/{ano}/QTR{trimestre}/form.{data}.idx',
  /** link "Ver os 10-K na SEC" da página do ativo */
  documentos10k:
    'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}&type=10-K&dateb=&owner=include&count=40',
} as const;

/** Formulários anuais aceitos na extração FY (20-F/40-F ficam de fora: ADRs sem float de capa). */
export const FORMULARIOS_ANUAIS_SEC = ['10-K', '10-K/A', '10-KT'] as const;
export type FormularioAnualSec = (typeof FORMULARIOS_ANUAIS_SEC)[number];

// ===========================================================================
// CIK e emissorId
// ===========================================================================

/** Prefixo do emissorId SEC em AssetFundamentalsPeriod / CriteriaEval.cnpj / AnaliseQuadroLinha.cnpj. */
export const PREFIXO_EMISSOR_SEC = 'CIK:';
const RE_CIK = /^\d{1,10}$/;

/** CIK com 10 dígitos (zeros à esquerda). Lança com entrada que não é CIK. */
export function normalizarCik(cik: string | number): string {
  const s = String(cik)
    .trim()
    .replace(/^CIK:?/i, '');
  if (!RE_CIK.test(s)) throw new Error(`CIK inválido: ${cik}`);
  return s.padStart(10, '0');
}

/** 'CIK:##########' (emissorId SEC). */
export function emissorIdSec(cik: string | number): string {
  return `${PREFIXO_EMISSOR_SEC}${normalizarCik(cik)}`;
}

export function ehEmissorIdSec(emissorId: string): boolean {
  return /^CIK:\d{10}$/.test(emissorId);
}

/** CIK de 10 dígitos de um emissorId 'CIK:…' (ou null). */
export function cikDoEmissorId(emissorId: string): string | null {
  return ehEmissorIdSec(emissorId) ? emissorId.slice(PREFIXO_EMISSOR_SEC.length) : null;
}

// ===========================================================================
// Ticker EUA (A grava, B/C/D leem — helper ÚNICO, sem cópia por fatia)
// ===========================================================================

/**
 * Ticker EUA na forma da ANÁLISE (URL, AnaliseQuadroLinha.symbol, criteria_eval.symbol, Salvos,
 * busca): 1–5 letras + classe opcional com ponto (BRK.B). A rota da página aceita também o hífen
 * da SEC (BRK-B) e redireciona para a forma com ponto.
 */
export const RE_TICKER_EUA = /^[A-Z]{1,5}([.-][A-Z])?$/;

export function ehTickerEua(ticker: string): boolean {
  return RE_TICKER_EUA.test(ticker);
}

/** Forma da Análise a partir da forma da SEC ('BRK-B' → 'BRK.B'; 'AAPL' → 'AAPL'). */
export function symbolAnaliseDaSec(symbolSec: string): string {
  return symbolSec.trim().toUpperCase().replace('-', '.');
}

/** Forma da SEC a partir da forma da Análise ('BRK.B' → 'BRK-B'). */
export function symbolSecDaAnalise(symbol: string): string {
  return symbol.trim().toUpperCase().replace('.', '-');
}

/**
 * Normalização sem pontuação (SecCompanyTicker.symbolNorm; casa com os Assets manuais da Carteira,
 * cujo safeSymbol tira '-' e '.'): 'BRK-B', 'BRK.B' e 'brkb' → 'BRKB'.
 */
export function normalizarTickerEua(ticker: string): string {
  return ticker
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

// ===========================================================================
// Universo (sec-cadastro, fatia A) — decisão do Wellington de 17/10
// ===========================================================================

export interface CorteFloatEua {
  /** entra no universo com free float ≥ este valor (US$) */
  floatEntradaUsd: number;
  /** sai do universo com free float < este valor (US$; histerese de 80%) */
  floatSaidaUsd: number;
}

export interface UniversoEuaParams {
  stock: CorteFloatEua;
  /** só REITs de patrimônio (equity); hipotecários ficam fora */
  reit: CorteFloatEua;
  /** float fora da sanidade → alerta + exclusão (foraMotivo 'float_suspeito') */
  sanidadeFloat: {
    /** float > maxUsd = erro de escala (casos medidos: US$ 603,6 bi e 270 bi suspeitos) */
    maxUsd: number;
    /** float ÷ ações em circulação fora de [min, max] = preço implícito absurdo */
    precoImplicitoMinUsd: number;
    precoImplicitoMaxUsd: number;
  };
}

/**
 * Universo PADRÃO (código). A criteria_params v3 grava o mesmo objeto (universoEua); versões sem o
 * bloco usam este (universoEuaDe). Stocks ≥ US$ 2 bi (≈ 1.400), saída < US$ 1,6 bi; REITs ≥ US$ 2 bi.
 */
export const UNIVERSO_EUA_PADRAO: UniversoEuaParams = {
  stock: { floatEntradaUsd: 2e9, floatSaidaUsd: 1.6e9 },
  reit: { floatEntradaUsd: 2e9, floatSaidaUsd: 1.6e9 },
  sanidadeFloat: { maxUsd: 1e12, precoImplicitoMinUsd: 0.5, precoImplicitoMaxUsd: 100_000 },
};

/** SIC dos REITs (real estate investment trusts). */
export const SIC_REIT = 6798;
/** SIC das financeiras (perfil stock_financeira): 6000–6799, EXCETO 6798 (REIT). */
export const FAIXA_SIC_FINANCEIRA = { de: 6000, ate: 6799 } as const;

export function ehSicFinanceira(sic: number | null | undefined): boolean {
  return (
    typeof sic === 'number' &&
    sic >= FAIXA_SIC_FINANCEIRA.de &&
    sic <= FAIXA_SIC_FINANCEIRA.ate &&
    sic !== SIC_REIT
  );
}

/** Bolsas do universo (company_tickers_exchange.json; o resto fica fora: 'sem_bolsa'). */
export const BOLSAS_EUA = ['NYSE', 'Nasdaq'] as const;
export type BolsaEua = (typeof BOLSAS_EUA)[number];

/** SecCompany.floatSanidade */
export const SANIDADES_FLOAT = ['ok', 'escala_suspeita', 'preco_implicito_absurdo'] as const;
export type SanidadeFloat = (typeof SANIDADES_FLOAT)[number];

/** SecCompany.foraMotivo (por que o CIK não está no universo) */
export const FORA_MOTIVOS_EUA = [
  'float_abaixo',
  'sem_10k',
  'hipotecario',
  'override',
  'sem_bolsa',
  'float_suspeito',
] as const;
export type ForaMotivoEua = (typeof FORA_MOTIVOS_EUA)[number];

/** SecCompany.reitTipo */
export const TIPOS_REIT = ['equity', 'mortgage'] as const;
export type TipoReit = (typeof TIPOS_REIT)[number];

/** SecCompany.origem */
export type OrigemCadastroEua = 'regra' | 'override';

/**
 * Segmento curado dos REITs de patrimônio (SecCompany.segmento guarda a CHAVE; o rótulo PT está em
 * TEXTOS_EUA.segmentosReit). A lista curada por CIK é de overridesEua.ts (fatia A).
 */
export const SEGMENTOS_REIT = [
  'varejo',
  'industrial',
  'residencial',
  'escritorios',
  'saude',
  'data_center',
  'torres',
  'self_storage',
  'net_lease',
  'hotelaria',
  'diversificado',
  'especial',
  'florestal',
] as const;
export type SegmentoReit = (typeof SEGMENTOS_REIT)[number];

/** Override por CIK (overridesEua.ts, fatia A). Nunca fixa ticker. */
export interface OverrideCikEua {
  cik: string;
  acao: 'incluir' | 'excluir' | 'classificar';
  classe?: ClasseEua;
  reitTipo?: TipoReit;
  segmento?: SegmentoReit;
  ehFinanceira?: boolean;
  /** CIK que tem o histórico de 10-K (XOM → 0000034088) */
  cikHistorico?: string;
  motivo: string;
}

// ===========================================================================
// Fundamentos SEC (AssetFundamentalsPeriod source 'SEC') — A grava, B lê
// ===========================================================================

export const FONTE_PERIODO_SEC = 'SEC';
export const PADRAO_CONTABIL_SEC = 'USGAAP';
export const MOEDA_SEC = 'USD';

/** AssetFundamentalsPeriod.dpaOrigem */
export const ORIGENS_DPA = ['cash_paid', 'declared', 'derivado'] as const;
export type OrigemDpa = (typeof ORIGENS_DPA)[number];

/**
 * Flags das linhas SEC (AssetFundamentalsPeriod.flags):
 * - ebitda_pre_ir: EBITDA pelo 2º degrau (lucro antes do IR + juros + D&A);
 * - ebitda_lucro: pelo 3º degrau (lucro líquido + IR + juros + D&A);
 * - dpa_derivado: DPA = dividendos pagos ÷ média diluída (selo "calculado");
 * - declared_suspeito: |pagos ÷ ações − DPA declarado| > 10% (PLD = 0,01);
 * - troca_conceito: a série mudou de conceito XBRL (alerta informativo).
 */
export const FLAGS_FUNDAMENTO_SEC = [
  'ebitda_pre_ir',
  'ebitda_lucro',
  'dpa_derivado',
  'declared_suspeito',
  'troca_conceito',
] as const;
export type FlagFundamentoSec = (typeof FLAGS_FUNDAMENTO_SEC)[number];

// ===========================================================================
// Quadro EUA (B grava analise_quadro_linhas; C lê)
// ===========================================================================

/**
 * Como uma linha stock/reit de AnaliseQuadroLinha é preenchida (gerarQuadroEua, fatia B) — C lê
 * exatamente isto:
 * - symbol = forma da Análise (symbolAnaliseDaSec); classe 'stock' | 'reit'; cnpj = emissorIdSec(cik);
 * - noQuadro = SecCompany.noUniverso; foraDoQuadroMotivo = null (fora do universo = sem linha);
 * - temScore = false; estadoIndice = 'sem_score' (não há indicador antigo para EUA);
 * - setor = rótulo PT da divisão SIC (TEXTOS_EUA.setorDoSic); segmento = rótulo PT do segmento REIT
 *   (TEXTOS_EUA.segmentosReit) ou null; subsetor/segmentoListagem/fiiTipo/segmentoCvm = null;
 * - moeda = 'USD'; bolsa = 'NYSE' | 'Nasdaq' (colunas novas, nulas no BR);
 * - preco/precoData/variacaoDiaPct/pl/pvp/dy12mPct = null SEM ANALISE_ATIVOS_EUA_PRECO_HABILITADO
 *   (com a chave, de AssetQuoteDailyUs);
 * - roePct, margemLiquidaPct, divLiqEbitda, payoutPct, anosLucroConsecutivos, anosDividendo,
 *   serie10a (lucro líquido em US$ mi) e as colunas novas dpa (US$/ação), fcoPorAcao (US$/ação) e
 *   dividendosFcoPct (%) = último FY fechado da SEC;
 * - criterios/perfilCriterios/paramsVersion = cópia compacta de criteria_eval (lerCompactosPorSimbolo
 *   com CLASSES_EUA); flags = flags SEC relevantes.
 */
export const MOEDA_LINHA_EUA = 'USD' as const;

/** Colunas do Essencial EUA que não têm fonte no XBRL (a UI esconde, com a observação da fase 2). */
export const COLUNAS_PENDENTES_EUA = ['ffo', 'affo', 'ocupacao', 'imoveis'] as const;
export type ColunaPendenteEua = (typeof COLUNAS_PENDENTES_EUA)[number];

/** Por que a Análise EUA não mostra cotação: 'licenca' = sem ANALISE_ATIVOS_EUA_PRECO_HABILITADO. */
export type MotivoSemPrecoEua = 'licenca' | 'sem_cotacao';

/**
 * Bloco EUA do topo da página do ativo (AtivoTopoResposta.eua, fatia C). Ausente = ativo BR.
 * Sem tag de índice; 'FY termina em {mes}' sai de exercicioFimMmdd.
 */
export interface TopoEuaApi {
  cik: string;
  bolsa: BolsaEua | null;
  moeda: 'USD';
  /** MMDD do fim do exercício ('0927' AAPL) */
  exercicioFimMmdd: string | null;
  /** null quando a cotação aparece (euaPreco) */
  motivoSemPreco: MotivoSemPrecoEua | null;
  /** link dos 10-K na SEC (SEC_URLS.documentos10k) */
  linkDocumentos: string;
  /** data do free float de capa usado no corte do universo ('AAAA-MM-DD') */
  publicFloatData: string | null;
  segmento: SegmentoReit | null;
}

// ===========================================================================
// Preço EUA (fatia A; só com ANALISE_ATIVOS_EUA_PRECO_HABILITADO)
// ===========================================================================

/** Provedor da cotação EUA (AssetQuoteDailyUs.source), escolhido por ANALISE_EUA_PRECO_FONTE. */
export const FONTES_PRECO_EUA = ['brapi', 'eodhd', 'twelvedata'] as const;
export type FontePrecoEuaId = (typeof FONTES_PRECO_EUA)[number];
export const ENV_FONTE_PRECO_EUA = 'ANALISE_EUA_PRECO_FONTE';

// ===========================================================================
// Jobs (um módulo por job, cada um com UMA fatia dona) — catálogo em jobs/catalogoJobs.ts
// ===========================================================================

export const NOMES_JOBS_EUA = [
  'sec-cadastro',
  'sec-fundamentos',
  'cotacoes-eua',
  'criterios-eua',
  'quadro-eua',
  'eua-diario',
] as const;
export type NomeJobEua = (typeof NOMES_JOBS_EUA)[number];

/**
 * Dono e módulo de cada job (criado como stub na fatia 0, preenchido pela fatia dona). euaDiario encadeia
 * sec-fundamentos → criterios-eua → quadro-eua importando os módulos abaixo (um AnaliseJobRun por
 * etapa; falha numa etapa não impede as seguintes).
 */
export const MODULOS_JOBS_EUA: Record<NomeJobEua, { fatia: 'A' | 'B'; modulo: string }> = {
  'sec-cadastro': { fatia: 'A', modulo: 'src/services/analiseAtivos/eua/jobs/secCadastro.ts' },
  'sec-fundamentos': {
    fatia: 'A',
    modulo: 'src/services/analiseAtivos/eua/jobs/secFundamentos.ts',
  },
  'cotacoes-eua': { fatia: 'A', modulo: 'src/services/analiseAtivos/eua/jobs/cotacoesEua.ts' },
  'criterios-eua': { fatia: 'B', modulo: 'src/services/analiseAtivos/eua/jobs/criteriosEua.ts' },
  'quadro-eua': { fatia: 'B', modulo: 'src/services/analiseAtivos/eua/jobs/quadroEua.ts' },
  'eua-diario': { fatia: 'B', modulo: 'src/services/analiseAtivos/eua/jobs/euaDiario.ts' },
};

/**
 * Cron PROPOSTO (runbook; NÃO aplicado — o template do Lightsail é da fatia A, linhas comentadas
 * até a carga): todos pelo myfinance-job.sh (processo próprio, timeout 600 s, RSS < 300 MB medido
 * pelo rodar-job.ts com NODE_OPTIONS=--max-old-space-size=256 e MALLOC_ARENA_MAX=2).
 */
export const CRON_PROPOSTO_EUA: Record<
  Exclude<NomeJobEua, 'sec-fundamentos' | 'criterios-eua' | 'quadro-eua'>,
  string
> = {
  // 08:25 BRT, depois do alertas-salvos das 11:10 UTC
  'eua-diario': '25 11 * * *',
  // domingo 03:30 UTC, incremental
  'sec-cadastro': '30 3 * * 0',
  // seg–sex 22:30 UTC, só com a chave de preço (comentado)
  'cotacoes-eua': '30 22 * * 1-5',
};
