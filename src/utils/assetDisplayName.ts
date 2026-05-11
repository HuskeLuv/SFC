/**
 * Sanitiza títulos exibidos em cards/headers de ativos, defendendo contra:
 *   1. asset.symbol legado tipo "-{timestamp}-{uuid}" gerado antes do fix do
 *      bug #08 (faltava branch pra renda-fixa-hibrida → baseSymbol vinha vazio).
 *   2. asset.name começando com ` - R$X - data` (mesma origem — baseName vazio).
 *   3. Concatenações que deixam "— -" visível ao usuário.
 *
 * Retorna `{ ticker, nome }` saneados; idempotente: nomes/tickers já corretos
 * passam intactos.
 */
export interface AssetDisplayParts {
  ticker: string;
  nome?: string | null;
}

const SYNTHETIC_SYMBOL_PREFIXES = [
  'RENDA-FIXA',
  'RESERVA-EMERG',
  'RESERVA-OPORT',
  'PERSONALIZADO',
  'CONTA-CORRENTE',
  'POUPANCA',
];

/** Símbolos sintéticos (gerados pelo backend pra ativos manuais) não devem ser exibidos como ticker. */
const isSyntheticSymbol = (symbol: string): boolean => {
  if (!symbol) return false;
  const upper = symbol.toUpperCase();
  if (SYNTHETIC_SYMBOL_PREFIXES.some((p) => upper.startsWith(p))) return true;
  // Legado (bug #08): "-{timestamp}-{uuid}" — começa com hífen e tem timestamp de 12+ dígitos.
  if (/^-\d{12,}-[a-z0-9]+$/i.test(symbol)) return true;
  return false;
};

/** Remove sequências iniciais/terminais de hífen + espaço/em-dash que sobram em concatenações. */
const stripBoundaryNoise = (s: string): string => {
  return s.replace(/^[\s\-–—]+/, '').replace(/[\s\-–—]+$/, '');
};

/**
 * Retorna o título a exibir como cabeçalho/card do ativo.
 * Regras:
 *   - Se ticker é sintético, oculta-o (o usuário não criou esse identificador).
 *   - Se nome é vazio/só ruído, usa fallback razoável.
 *   - Se nome === ticker, mostra só uma vez.
 */
export const formatAssetDisplayTitle = (
  parts: AssetDisplayParts,
  fallback = 'Ativo',
): { ticker: string; nome: string; full: string } => {
  const rawTicker = (parts.ticker || '').trim();
  const rawNome = (parts.nome || '').trim();

  const hideTicker = isSyntheticSymbol(rawTicker);
  const cleanNome = stripBoundaryNoise(rawNome);
  const ticker = hideTicker ? '' : rawTicker;
  const nome = cleanNome || (hideTicker ? fallback : '');

  let full: string;
  if (ticker && nome && nome !== ticker) {
    full = `${ticker} — ${nome}`;
  } else if (ticker) {
    full = ticker;
  } else {
    full = nome || fallback;
  }

  return { ticker, nome, full };
};
