/**
 * Precedência de fonte de dados de mercado: **B3 (oficial) → BRAPI → Yahoo**.
 *
 * `AssetPriceHistory`/`AssetDividendHistory`/`AssetCorporateAction` têm uma linha
 * por chave (ex.: `[symbol, date]`) e um campo `source`. Historicamente o runtime
 * ignorava `source` e usava a última linha gravada, qualquer que fosse a origem.
 * Este módulo dá o ranking canônico para que uma fonte de MENOR prioridade nunca
 * sobrescreva o dado de uma de MAIOR prioridade (ex.: a sync diária da BRAPI não
 * pisa numa cotação oficial da B3 já gravada).
 *
 * Casing: as fontes foram gravadas com casing inconsistente no histórico
 * (`'brapi'`, `'BRAPI'`, `'B3_COTAHIST'`, `'YAHOO_FINANCE'`...). A normalização é
 * sempre uppercase, então `'brapi'` e `'BRAPI'` são equivalentes.
 */

/** Rank canônico: MENOR número = MAIOR prioridade. */
const RANK: Record<string, number> = {
  MANUAL: 0, // override do usuário — nunca sobrescrever automaticamente
  B3_COTAHIST: 1, // B3 oficial (COTAHIST) — fonte primária de renda variável
  COINGECKO: 1, // autoritativa pra cripto (domínio próprio, não colide com B3/BRAPI)
  TESOURO_DIRETO: 1, // autoritativa pra Tesouro Direto (tabela própria)
  CVM: 1, // autoritativa pra fundos (cota oficial)
  BRAPI: 2, // fonte secundária — preenche o que a B3 não cobre
  YAHOO_FINANCE: 3, // fallback
  YAHOO: 3, // fallback (dividendos/índices)
};

/** Fonte desconhecida empata com a BRAPI (não derruba B3, mas pode dar refresh). */
const DEFAULT_RANK = 2;

export const normalizeSource = (s: string | null | undefined): string =>
  (s ?? '').trim().toUpperCase();

/** Rank de prioridade da fonte (menor = mais prioritária). */
export const sourceRank = (s: string | null | undefined): number => {
  const key = normalizeSource(s);
  return key in RANK ? RANK[key] : DEFAULT_RANK;
};

/**
 * Uma gravação da fonte `incoming` pode sobrescrever a linha existente da fonte
 * `existing`?
 *
 * - Linha inexistente (`existing` vazio) → sempre grava.
 * - `incoming` de prioridade IGUAL ou MAIOR (rank ≤) → sobrescreve. Empates permitem
 *   refresh (ex.: BRAPI atualiza a própria cotação do dia).
 * - `incoming` de prioridade MENOR (rank >) → NÃO sobrescreve. Ex.: B3_COTAHIST (1)
 *   já gravou o dia, BRAPI (2) tenta gravar → bloqueado, a B3 permanece.
 */
export const canOverwrite = (existing: string | null | undefined, incoming: string): boolean => {
  if (existing == null || normalizeSource(existing) === '') return true;
  return sourceRank(incoming) <= sourceRank(existing);
};

/**
 * Fontes que gravam preço CRU (como negociado no dia), NÃO split-adjusted.
 * O COTAHIST da B3 registra o preço da época: um split posterior NÃO reescreve
 * o histórico (MXRF11 R$95→R$9 aparece como degrau real na série). Já a BRAPI
 * entrega a série re-ajustada a cada evento. Consumidores que convertem entre
 * escala crua ↔ ajustada (price-at, splitAdjustRawRows) precisam ramificar por
 * fonte — tratar linha crua como ajustada dobra o ajuste (ticket 24/08: PRIO3
 * 02/06/2020 cru R$33,59 virava sugestão de R$167,95 = 33,59 × split 5:1).
 */
const RAW_PRICE_SOURCES = new Set(['B3_COTAHIST']);

/** A linha de preço desta fonte está em escala CRUA (não split-adjusted)? */
export const isRawPriceSource = (s: string | null | undefined): boolean =>
  RAW_PRICE_SOURCES.has(normalizeSource(s));
