/**
 * Arquivos de companhias abertas da CVM (Dados Abertos) usados pela fatia A: URLs, entradas lidas de
 * cada zip e colunas obrigatórias por CSV (layout mudou em 2021 e em ago/2025: se sumir uma coluna, o
 * job falha alto com ErroLayoutFonte em vez de gravar vazio).
 *
 *   DFP (anual) e ITR (trimestral): índice + DRE, BPA, BPP, DFC_MI (+ DMPL só no DFP) e
 *   composicao_capital. DVA, DRA, parecer e DFC_MD não são lidos.
 *   FCA: geral (cadastro) + valor_mobiliario (tickers). FRE: informacao_financeira (item f, até FY2021).
 */
import type { Escopo } from '@/services/analiseAtivos/tipos';

export type DocCvm = 'dfp' | 'itr' | 'fca' | 'fre';
export type EntradaDemonstrativo = 'DRE' | 'BPA' | 'BPP' | 'DFC_MI' | 'DMPL';

export const BASE_CVM = 'https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC';

export function nomeArquivoCvm(doc: DocCvm, ano: number): string {
  return `${doc}_cia_aberta_${ano}.zip`;
}

export function urlArquivoCvm(doc: DocCvm, ano: number): string {
  return `${BASE_CVM}/${doc.toUpperCase()}/DADOS/${nomeArquivoCvm(doc, ano)}`;
}

export function entradaIndice(doc: DocCvm, ano: number): string {
  return `${doc}_cia_aberta_${ano}.csv`;
}

export function entradaDemonstrativo(
  doc: 'dfp' | 'itr',
  dem: EntradaDemonstrativo,
  escopo: Escopo,
  ano: number,
): string {
  return `${doc}_cia_aberta_${dem}_${escopo}_${ano}.csv`;
}

export function entradaComposicao(doc: 'dfp' | 'itr', ano: number): string {
  return `${doc}_cia_aberta_composicao_capital_${ano}.csv`;
}

export function entradaFca(parte: 'geral' | 'valor_mobiliario', ano: number): string {
  return `fca_cia_aberta_${parte}_${ano}.csv`;
}

export function entradaFreInformacaoFinanceira(ano: number): string {
  return `fre_cia_aberta_informacao_financeira_${ano}.csv`;
}

/** Ordem de leitura: DRE primeiro (decide layout financeiro e escopos das linhas do Raio-X). */
export const DEMONSTRATIVOS_POR_DOC: Record<'dfp' | 'itr', EntradaDemonstrativo[]> = {
  dfp: ['DRE', 'BPA', 'BPP', 'DFC_MI', 'DMPL'],
  itr: ['DRE', 'BPA', 'BPP', 'DFC_MI'],
};

// ---------------------------------------------------------------- colunas obrigatórias

export const COLUNAS_INDICE = ['CNPJ_CIA', 'DT_REFER', 'VERSAO', 'CD_CVM', 'ID_DOC', 'DT_RECEB'];

const BASE_DEMONSTRATIVO = [
  'CNPJ_CIA',
  'DT_REFER',
  'VERSAO',
  'ESCALA_MOEDA',
  'ORDEM_EXERC',
  'DT_FIM_EXERC',
  'CD_CONTA',
  'DS_CONTA',
  'VL_CONTA',
  'ST_CONTA_FIXA',
];

export const COLUNAS_DEMONSTRATIVO: Record<EntradaDemonstrativo, string[]> = {
  DRE: [...BASE_DEMONSTRATIVO, 'DT_INI_EXERC'],
  DFC_MI: [...BASE_DEMONSTRATIVO, 'DT_INI_EXERC'],
  DMPL: [...BASE_DEMONSTRATIVO, 'DT_INI_EXERC', 'COLUNA_DF'],
  BPA: BASE_DEMONSTRATIVO,
  BPP: BASE_DEMONSTRATIVO,
};

export const COLUNAS_COMPOSICAO = [
  'CNPJ_CIA',
  'DT_REFER',
  'VERSAO',
  'QT_ACAO_ORDIN_CAP_INTEGR',
  'QT_ACAO_PREF_CAP_INTEGR',
  'QT_ACAO_ORDIN_TESOURO',
  'QT_ACAO_PREF_TESOURO',
];

export const COLUNAS_FCA_GERAL = [
  'CNPJ_Companhia',
  'Data_Referencia',
  'Versao',
  'Nome_Empresarial',
  'Codigo_CVM',
  'Situacao_Registro_CVM',
  'Setor_Atividade',
  'Mes_Encerramento_Exercicio_Social',
];

export const COLUNAS_FCA_VALOR_MOBILIARIO = [
  'CNPJ_Companhia',
  'Data_Referencia',
  'Versao',
  'Valor_Mobiliario',
  'Codigo_Negociacao',
  'Composicao_BDR_Unit',
  'Mercado',
  'Data_Inicio_Negociacao',
  'Data_Fim_Negociacao',
];

export const COLUNAS_FRE_INFORMACAO_FINANCEIRA = [
  'CNPJ_Companhia',
  'Data_Referencia',
  'Versao',
  'Data_Fim_Exercicio_Social',
  'Codigo_Conta',
  'Valor',
];

// ---------------------------------------------------------------- limites (jobsComum.limitesDownload)

export const MAX_BYTES_ZIP_CVM = 150_000_000;
export const TIMEOUT_DOWNLOAD_MS = 90_000;
export const TIMEOUT_DOWNLOAD_BACKFILL_MS = 600_000;

/** FRE item f ("Número de Ações, Ex-Tesouraria") existe até o FRE entregue em 2022 (FY2021). */
export const ULTIMO_ANO_FRE_ITEM_F = 2022;

/**
 * Subconjunto do DEV (backfill.subconjuntoDev): fora de produção, AssetStatementLine só destas 40
 * companhias — senão um teste local do cron DFP poria ~700 companhias × 2 anos no Neon (~140 MB).
 */
export const SUBCONJUNTO_DEV_STATEMENT_LINES = [
  'WEGE3',
  'PETR4',
  'VALE3',
  'ITUB4',
  'BBAS3',
  'BBDC4',
  'SANB11',
  'ITSA4',
  'BBSE3',
  'PSSA3',
  'TAEE11',
  'EGIE3',
  'CMIG4',
  'CPLE6',
  'ELET3',
  'EQTL3',
  'SBSP3',
  'VIVT3',
  'TIMS3',
  'ABEV3',
  'RADL3',
  'LREN3',
  'MGLU3',
  'CYRE3',
  'SLCE3',
  'KLBN11',
  'SUZB3',
  'GGBR4',
  'PRIO3',
  'UGPA3',
  'CSAN3',
  'RAIL3',
  'RENT3',
  'B3SA3',
  'EMBR3',
  'TOTS3',
  'HYPE3',
  'FLRY3',
  'MULT3',
  'AZUL4',
] as const;

/** Janela de arquivos do cron: dfp {ano−1, ano}; itr {ano} ∪ {ano−1 se mês ≤ 3}; fca {ano}. */
export function janelaArquivos(doc: 'dfp' | 'itr' | 'fca', hoje: string): number[] {
  const ano = Number(hoje.slice(0, 4));
  const mes = Number(hoje.slice(5, 7));
  if (doc === 'dfp') return [ano - 1, ano];
  if (doc === 'itr') return mes <= 3 ? [ano - 1, ano] : [ano];
  return [ano];
}
