/**
 * Carteira EUA em US$ (out/2026): o único teste que separa ativo em dólar de ação BR,
 * e a unidade (R$ ou US$) em que posição e transação estão GRAVADAS.
 *
 * Regra (docs/carteira-eua-dolar/desenho.json, regra_de_moeda):
 *  - `isAtivoEmDolar` serve SÓ de guarda/filtro. Nunca decide conversão sozinho.
 *  - Toda conversão decide pela unidade gravada: `posicaoEmDolar` (Portfolio) e
 *    `unidadeDaTransacao` (StockTransaction). Stock legado em R$ (sem marcador e sem
 *    moedaRegistro) nunca é convertido; REIT sempre foi gravado em US$.
 *  - ETF americano (nov/2026, docs/carteira-eua-dolar/etf/desenho.json): Asset etf com
 *    currency 'USD' (ramo manual ETF-MANUAL). Segue o REIT no fallback (TIPOS_SEMPRE_EM_DOLAR):
 *    não existe legado de ETF em US$ gravado em R$, e todo criador grava o marcador. O fallback
 *    só protege transação/posição sem marcador (ex.: o stub do Desfazer antes do recálculo).
 *  - ETF da B3 (IVVB11, BOVA11…) vem do catálogo com currency 'BRL' e fica em R$, mesmo com
 *    regiaoEtf 'estados_unidos'. Região ou seção NUNCA decidem moeda.
 *  - Ações BR, BDR, crypto, moedas, ETF BRL e etf-cvm devolvem sempre 'BRL'/false aqui.
 *
 * ATENÇÃO, criadores futuros de Asset etf/reit em 'USD': por causa do fallback, TODA transação
 * TEM de gravar `notes.operation = marcadorOperacaoUsd(...)` e TODA posição `moedaRegistro`
 * ('USD' ou 'BRL'). Sem isso, valores em R$ seriam lidos como US$.
 *
 * Puro (sem prisma): importável do cliente e do edge.
 */

/** Unidade em que um valor está gravado. */
export type UnidadeValor = 'BRL' | 'USD';

/** Valor de `Portfolio.moedaRegistro` quando avgPrice/totalInvested estão em US$. */
export const MOEDA_REGISTRO_USD = 'USD' as const;

/** Tipos de Asset que podem estar em dólar (sempre com currency 'USD'). */
export const TIPOS_ATIVO_EM_DOLAR: ReadonlySet<string> = new Set(['stock', 'reit', 'etf']);

/**
 * Tipos em dólar que, sem marcador (transação) ou sem moedaRegistro (posição), estão em US$.
 * Só o stock tem legado em R$; REIT e ETF sempre foram gravados em US$.
 */
export const TIPOS_SEMPRE_EM_DOLAR: ReadonlySet<string> = new Set(['reit', 'etf']);

/** Sentinela do assetId do ETF americano manual (wizard → POST /api/carteira/operacao). */
export const ETF_MANUAL_ASSET_ID = 'ETF-MANUAL' as const;

/** Recorte mínimo do Asset que o teste precisa. */
export interface AtivoMoedaRef {
  type?: string | null;
  currency?: string | null;
}

/** Recorte mínimo do Portfolio que o teste precisa. */
export interface PosicaoMoedaRef {
  moedaRegistro?: string | null;
}

/** Recorte mínimo da StockTransaction: `notes` cru (string JSON) ou já parseado. */
export interface TransacaoMoedaRef {
  notes?: unknown;
}

/**
 * Marcador gravado em `notes.operation` de toda transação de ativo em dólar.
 * `unidade` é a fonte da verdade da conversão; `moeda` já existia (escolha do usuário)
 * e NÃO indica a unidade dos valores em transações legadas.
 */
export interface MarcadorOperacaoUsd {
  moeda: 'USD';
  unidade: 'USD';
  cotacaoMoeda: number | null;
}

/** Monta o marcador de `notes.operation` para uma transação gravada em US$. */
export const marcadorOperacaoUsd = (cotacaoMoeda?: number | null): MarcadorOperacaoUsd => ({
  moeda: 'USD',
  unidade: 'USD',
  cotacaoMoeda:
    typeof cotacaoMoeda === 'number' && Number.isFinite(cotacaoMoeda) && cotacaoMoeda > 0
      ? cotacaoMoeda
      : null,
});

/** Stock EUA, REIT ou ETF com currency 'USD'. Só guarda: a conversão usa as funções abaixo. */
export const isAtivoEmDolar = (asset: AtivoMoedaRef | null | undefined): boolean =>
  !!asset && TIPOS_ATIVO_EM_DOLAR.has(asset.type ?? '') && asset.currency === 'USD';

/**
 * Lê `notes` (string JSON ou objeto) sem lançar. Notes ilegível, vazio ou não-objeto = null.
 */
export const lerNotesTransacao = (notes: unknown): Record<string, unknown> | null => {
  let valor: unknown = notes;
  if (typeof notes === 'string') {
    if (!notes.trim()) return null;
    try {
      valor = JSON.parse(notes);
    } catch {
      return null;
    }
  }
  return valor && typeof valor === 'object' && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null;
};

const unidadeValida = (v: unknown): UnidadeValor | null => (v === 'USD' || v === 'BRL' ? v : null);

/**
 * Unidade em que price/total da transação estão gravados.
 *  - Ativo que não está em dólar: sempre 'BRL'.
 *  - Com marcador `notes.operation.unidade`: o marcador.
 *  - Sem marcador (ou notes ilegível): REIT/ETF = 'USD' (sempre gravados em US$); stock = 'BRL'
 *    (legado).
 * `fees` é sempre R$, em qualquer unidade.
 */
export const unidadeDaTransacao = (
  tx: TransacaoMoedaRef | null | undefined,
  asset: AtivoMoedaRef | null | undefined,
): UnidadeValor => {
  if (!isAtivoEmDolar(asset)) return 'BRL';
  const operation = lerNotesTransacao(tx?.notes)?.operation;
  const marcador =
    operation && typeof operation === 'object'
      ? unidadeValida((operation as Record<string, unknown>).unidade)
      : null;
  if (marcador) return marcador;
  return TIPOS_SEMPRE_EM_DOLAR.has(asset?.type ?? '') ? 'USD' : 'BRL';
};

/**
 * Posição (Portfolio.avgPrice/totalInvested) gravada em US$?
 *  - moedaRegistro 'USD' em ativo em dólar: sim;
 *  - moedaRegistro null: REIT/ETF sim (sempre US$), stock não (legado em R$);
 *  - ativo que não está em dólar: nunca.
 */
export const posicaoEmDolar = (
  portfolio: PosicaoMoedaRef | null | undefined,
  asset: AtivoMoedaRef | null | undefined,
): boolean => {
  if (!isAtivoEmDolar(asset)) return false;
  const moedaRegistro = portfolio?.moedaRegistro ?? null;
  if (moedaRegistro === MOEDA_REGISTRO_USD) return true;
  return moedaRegistro == null && TIPOS_SEMPRE_EM_DOLAR.has(asset?.type ?? '');
};
