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
