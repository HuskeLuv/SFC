/**
 * F2.2 — Parser do arquivo B3 COTAHIST (Séries Históricas).
 *
 * O COTAHIST é o registro oficial e gratuito da B3 com cotações diárias do
 * mercado à vista (ações, FIIs, ETFs, BDRs) desde 1986. O formato é
 * fixed-width (245 chars por linha) e cada ZIP cobre um ano fechado.
 *
 * URL por ano: https://bvmf.bmfbovespa.com.br/InstDados/SerHist/COTAHIST_A{ANO}.ZIP
 *
 * Layout (1-indexed, conforme especificação publicada pela B3):
 *   1-2     TIPREG  — tipo do registro: 00 header, 01 cotação, 99 trailer
 *   3-10    DATPRE  — data AAAAMMDD
 *   11-12   CODBDI  — código BDI: 02 lote-padrão à vista, 12 FII, 14 ETF
 *   13-24   CODNEG  — ticker (12 chars right-padded com espaços)
 *   25-27   TPMERC  — tipo de mercado: 010 = à vista (filtrado)
 *   28-39   NOMRES  — nome resumido da empresa
 *   40-49   ESPECI  — especificação do papel
 *   50-52   PRAZOT  — prazo (termo)
 *   53-56   MODREF  — moeda referência
 *   57-69   PREABE  — preço abertura (11 inteiros + 2 decimais sem ponto)
 *   70-82   PREMAX
 *   83-95   PREMIN
 *   96-108  PREMED
 *   109-121 PREULT  — preço fechamento (esse é o que importa)
 *   122-134 PREOFC
 *   135-147 PREOFV
 *   148-152 TOTNEG  — número de negócios
 *   153-170 QUATOT  — quantidade negociada (na verdade VOLTOT começa em 171)
 *   171-188 VOLTOT  — volume total
 *   ... outros até 245
 *
 * Encoding: ISO-8859-1 (latin1), mesma família dos arquivos CVM.
 *
 * Spec PDF: https://www.b3.com.br/data/files/33/67/B9/50/D84057102C784E47AC094EA8/SeriesHistoricas_Layout.pdf
 */

/**
 * Representação de uma linha de cotação relevante. Campos descartados (PREABE,
 * PREMAX, PREMIN, volume, etc.) ficam de fora porque hoje só persistimos o
 * fechamento em AssetPriceHistory.
 */
export interface CotahistRecord {
  /** Data do pregão (UTC midnight, normalizada como YYYY-MM-DD 00:00:00Z). */
  date: Date;
  /** Ticker já trimado (ex.: "PETR4"). */
  symbol: string;
  /** Preço de fechamento já convertido (PREULT / 100). */
  closePrice: number;
  /** Código BDI (02 lote-padrão, 12 FII, 14 ETF) — útil pra debugging. */
  codBdi: string;
  /** Tipo de mercado (sempre "010" pós-filtro). */
  tpmerc: string;
}

/**
 * CODBDI permitidos:
 *   - 02 = LOTE-PADRÃO À VISTA (ações ON/PN, units)
 *   - 12 = FUNDOS IMOBILIÁRIOS
 *   - 14 = CERT. INVEST/TIT.DIV.PUBLICA — usado também para ETFs
 *
 * Outros códigos comuns que NÃO queremos:
 *   - 05/06 = concordata/recuperação
 *   - 07/08 = direitos de subscrição
 *   - 10    = opções
 *   - 13    = bonus/subscrição
 *   - 17    = leilão de prejudicada
 *   - 18    = obrigações
 *   - 22    = termo
 *   - 32    = exercício de opções de compra
 *   - 38    = exercício de opções de venda
 *   - 42    = leilão
 *   - 70    = aluguel
 *   - 81    = mercado a futuro
 *   - 99    = índice
 */
const ALLOWED_CODBDI = new Set(['02', '12', '14']);

/** Tipo de mercado à vista. Ignoramos opções/termo/futuros aqui. */
const SPOT_TPMERC = '010';

/**
 * Parseia uma linha COTAHIST de 245 chars. Retorna `null` para header (TIPREG=00),
 * trailer (TIPREG=99), linhas curtas (corrompidas) e linhas filtradas por CODBDI
 * ou TPMERC. O caller é responsável por iterar.
 *
 * Não joga exceções: linhas inválidas viram `null` pra não derrubar o backfill
 * inteiro caso um pregão tenha um registro estranho.
 */
export function parseCotahistLine(line: string): CotahistRecord | null {
  // Linhas válidas têm exatamente 245 chars. Aceitamos com folga porque alguns
  // anos antigos vêm com trailing whitespace ou \r adicional.
  if (!line || line.length < 245) return null;

  const tipreg = line.substring(0, 2);
  if (tipreg !== '01') return null; // header (00) ou trailer (99)

  const tpmerc = line.substring(24, 27);
  if (tpmerc !== SPOT_TPMERC) return null;

  const codBdi = line.substring(10, 12);
  if (!ALLOWED_CODBDI.has(codBdi)) return null;

  // DATPRE: AAAAMMDD (sem separadores). Usar UTC pra evitar drift por TZ.
  const dateStr = line.substring(2, 10);
  const year = Number(dateStr.substring(0, 4));
  const month = Number(dateStr.substring(4, 6));
  const day = Number(dateStr.substring(6, 8));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (year < 1986 || year > 2100) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return null;

  // CODNEG: 12 chars right-padded com espaços.
  const symbol = line.substring(12, 24).trim();
  if (!symbol) return null;

  // PREULT: 13 chars (11 inteiros + 2 decimais sem ponto), ex.: "0000000123456" = R$ 1234.56
  const preultRaw = line.substring(108, 121);
  const preultInt = Number(preultRaw);
  if (!Number.isFinite(preultInt) || preultInt <= 0) return null;
  const closePrice = preultInt / 100;

  return {
    date,
    symbol,
    closePrice,
    codBdi,
    tpmerc,
  };
}
