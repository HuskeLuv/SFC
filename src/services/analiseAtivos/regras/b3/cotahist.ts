/**
 * Parser do COTAHIST da B3 para a Análise de Ativos (regra 28 do relatório da Fase A) — funções puras.
 *
 * Parser NOVO: não altera `services/pricing/cotahistB3Parser.ts` (que segue alimentando
 * asset_price_history). Diferenças: guarda preço CRU dividido por FATCOT, volume financeiro (VOLTOT),
 * quantidade (QUATOT), nº de negócios (TOTNEG) e ESPECI; filtra só TPMERC 010 com CODBDI 02/12
 * (BDI 14 = ETFs/FIAGRO/FI-Infra fica de fora; fracionário TPMERC 020 também).
 *
 * Layout (posições 1-indexadas do "SeriesHistoricas_Layout.pdf" da B3; linhas de 245 caracteres):
 *   1-2 TIPREG · 3-10 DATPRE · 11-12 CODBDI · 13-24 CODNEG · 25-27 TPMERC · 28-39 NOMRES ·
 *   40-49 ESPECI · 109-121 PREULT (2 decimais) · 148-152 TOTNEG · 153-170 QUATOT ·
 *   171-188 VOLTOT (2 decimais) · 211-217 FATCOT
 * Header: TIPREG 00 + 'COTAHIST.AAAA' + 'BOVESPA ' + data de geração (AAAAMMDD).
 * Trailer: TIPREG 99 + mesmo prefixo + data + total de registros (11 dígitos, inclui header e trailer).
 */
import { ErroLayoutFonte } from '@/services/analiseAtivos/fontes/erros';

export const TAMANHO_LINHA_COTAHIST = 245;
export const TPMERC_VISTA = '010';
export const CODBDI_ANALISE: readonly string[] = ['02', '12'];

export interface RegistroCotahist {
  /** DATPRE em 'AAAA-MM-DD' */
  data: string;
  codBdi: string;
  symbol: string;
  tpMerc: string;
  nomeRes: string;
  /** ESPECI (ON, PN, UNT, CI…) — null quando vazio */
  especi: string | null;
  /** PREULT inteiro (centavos da cotação, antes de FATCOT) — para gravar Decimal exato */
  preultCentavos: number;
  /** FATCOT (1, 100, 1000…): PREULT é o preço de FATCOT ações */
  fatCot: number;
  /** PREULT / 100 / FATCOT — cru, sem ajuste por eventos */
  closeRaw: number;
  /** VOLTOT / 100 (R$) */
  volumeFin: number;
  /** VOLTOT em centavos, como texto (18 dígitos cabem mal em number) */
  voltotCentavos: string;
  /** QUATOT */
  quantidade: bigint;
  /** TOTNEG */
  negocios: number;
}

const RE_DIGITOS = /^\d+$/;
const RE_CABECALHO = /^00COTAHIST\.(\d{4})BOVESPA (\d{8})/;
const RE_TRAILER = /^99COTAHIST\.(\d{4})BOVESPA (\d{8})(\d{11})/;

function inteiro(s: string): number | null {
  const t = s.trim();
  if (!RE_DIGITOS.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) ? n : null;
}

function dataIso(aaaammdd: string): string | null {
  if (!/^\d{8}$/.test(aaaammdd)) return null;
  const iso = `${aaaammdd.slice(0, 4)}-${aaaammdd.slice(4, 6)}-${aaaammdd.slice(6, 8)}`;
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) return null;
  return iso;
}

/**
 * Linha TIPREG 01 → registro. Devolve TODOS os mercados/BDIs (o chamador filtra com
 * `filtrarRegistro`). null para header/trailer, linha curta ou campo numérico inválido (conta como
 * rejeitada no job).
 */
export function parseLinhaCotahist(linha: string): RegistroCotahist | null {
  if (linha.length < TAMANHO_LINHA_COTAHIST || !linha.startsWith('01')) return null;
  const data = dataIso(linha.slice(2, 10));
  const symbol = linha.slice(12, 24).trim();
  const preult = inteiro(linha.slice(108, 121));
  const totneg = inteiro(linha.slice(147, 152));
  const quatotTxt = linha.slice(152, 170).trim();
  const voltotTxt = linha.slice(170, 188).trim();
  const fatCot = inteiro(linha.slice(210, 217));
  if (
    !data ||
    !symbol ||
    preult === null ||
    totneg === null ||
    fatCot === null ||
    fatCot <= 0 ||
    !RE_DIGITOS.test(quatotTxt) ||
    !RE_DIGITOS.test(voltotTxt)
  ) {
    return null;
  }
  const voltotCentavos = voltotTxt.replace(/^0+(?=\d)/, '');
  const especi = linha.slice(39, 49).trim().replace(/\s+/g, ' ');
  return {
    data,
    codBdi: linha.slice(10, 12),
    symbol,
    tpMerc: linha.slice(24, 27),
    nomeRes: linha.slice(27, 39).trim(),
    especi: especi.length > 0 ? especi : null,
    preultCentavos: preult,
    fatCot,
    closeRaw: preult / 100 / fatCot,
    volumeFin: Number(voltotCentavos) / 100,
    voltotCentavos,
    quantidade: BigInt(quatotTxt),
    negocios: totneg,
  };
}

/** Só mercado à vista (TPMERC 010) nos BDIs 02 (lote-padrão) e 12 (fundos imobiliários). */
export function filtrarRegistro(r: RegistroCotahist): boolean {
  return r.tpMerc === TPMERC_VISTA && CODBDI_ANALISE.includes(r.codBdi) && r.preultCentavos > 0;
}

/**
 * Header TIPREG 00. Layout diferente ⇒ ErroLayoutFonte (falha alto em vez de gravar vazio).
 * `dataGeracao` em 'AAAA-MM-DD'.
 */
export function validarCabecalhoCotahist(
  linha: string,
  arquivo = 'COTAHIST',
): { nomeArquivo: string; dataGeracao: string } {
  const m = RE_CABECALHO.exec(linha);
  const dataGeracao = m ? dataIso(m[2]) : null;
  if (!m || !dataGeracao || linha.length < TAMANHO_LINHA_COTAHIST) {
    throw new ErroLayoutFonte(arquivo, ['header 00COTAHIST.AAAABOVESPA AAAAMMDD (245 posições)']);
  }
  return { nomeArquivo: `COTAHIST.${m[1]}`, dataGeracao };
}

/** Trailer TIPREG 99: total de registros declarado (inclui header e trailer). null se não for trailer. */
export function lerTrailerCotahist(linha: string): { totalRegistros: number } | null {
  const m = RE_TRAILER.exec(linha);
  if (!m) return null;
  return { totalRegistros: Number(m[3]) };
}

/** 'AAAA-MM-DD' → 'DDMMAAAA' (nome do arquivo diário COTAHIST_D{DDMMAAAA}.ZIP). */
export function dataParaDdmmaaaa(data: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  if (!m) throw new Error(`Data inválida (AAAA-MM-DD): ${data}`);
  return `${m[3]}${m[2]}${m[1]}`;
}
