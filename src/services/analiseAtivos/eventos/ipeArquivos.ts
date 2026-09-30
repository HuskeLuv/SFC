/**
 * Arquivo do IPE (Informações Periódicas e Eventuais) da CVM: URL, entrada do zip, layout exigido e
 * limites de download. ~1,7 MB zipado / ~15 MB de texto por ano (medido na Fase A).
 */
import type { EspecCsv } from '@/services/analiseAtivos/fontes/csvStream';
import {
  CATEGORIA_ASSEMBLEIA,
  IPE_COLUNAS_OBRIGATORIAS,
} from '@/services/analiseAtivos/regras/eventos/ipe';

export const BASE_URL_IPE = 'https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/IPE/DADOS';

/** jobsComum.limitesDownload da spec */
export const MAX_BYTES_ZIP_CVM = 150_000_000;
export const TIMEOUT_MS_CRON = 90_000;
export const TIMEOUT_MS_BACKFILL = 600_000;

export function nomeArquivoIpe(ano: number): string {
  return `ipe_cia_aberta_${ano}.zip`;
}

export function urlIpe(ano: number): string {
  return `${BASE_URL_IPE}/${nomeArquivoIpe(ano)}`;
}

export function nomeEntradaIpe(ano: number): string {
  return `ipe_cia_aberta_${ano}.csv`;
}

const MARCA_ASSEMBLEIA = `;${CATEGORIA_ASSEMBLEIA};`;

export function especCsvIpe(ano: number): EspecCsv {
  return {
    separador: ';',
    obrigatorias: IPE_COLUNAS_OBRIGATORIAS,
    arquivo: nomeEntradaIpe(ano),
    // descarta cedo as ~80% de linhas de outras categorias (Fato Relevante, Reunião da Adm. …)
    preFiltro: (bruta) => bruta.includes(MARCA_ASSEMBLEIA),
  };
}
