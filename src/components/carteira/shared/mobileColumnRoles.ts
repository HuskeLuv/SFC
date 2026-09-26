/**
 * Papel de cada coluna das abas da carteira no CARTÃO do celular (PWA fase 1).
 *
 * O cartão fechado é fixo (protótipo `fase1-prototipo.html`, tela c): título (ticker/nome),
 * subtítulo (nome · quantidade), valor atualizado + rentabilidade à direita e a linha do
 * Quanto Falta / Objetivo / % da aba. O cartão ABERTO mostra as colunas `detail` numa grade
 * 3×3 (o excedente vira linhas dt/dd), as colunas `edit` como linha "rótulo + Editar" e o link
 * para a página do ativo.
 *
 * Papéis:
 * - `primary` / `value` / `subtitle`: já cobertos pelo cabeçalho do cartão (não repetem na grade);
 * - `detail`: grade do cartão aberto;
 * - `edit`: linha própria no cartão aberto, com o `render` da coluna (as células editáveis
 *   mostram "valor + Editar" abaixo de lg);
 * - `hidden`: fora do cartão.
 * Sem `mobile` explícito vale `DEFAULT_MOBILE_ROLE_BY_KEY[key]` e, na falta, `detail`.
 */
export type AssetMobileRole =
  | 'primary'
  | 'value'
  | 'subtitle'
  | 'field'
  | 'detail'
  | 'edit'
  | 'hidden';

export const DEFAULT_MOBILE_ROLE_BY_KEY: Readonly<Record<string, AssetMobileRole>> = {
  nome: 'primary',
  valorAtualizado: 'value',
  // Já estão no cabeçalho do cartão (pílula do Quanto Falta, "Obj. · atual" e a rentabilidade
  // sob o valor).
  quantoFalta: 'hidden',
  rentabilidade: 'hidden',
  objetivo: 'edit',
};

/** Rótulos curtos para o cartão (o cabeçalho da tabela é longo ou é ReactNode). */
export const DEFAULT_MOBILE_LABEL_BY_KEY: Readonly<Record<string, string>> = {
  quantidade: 'Quantidade',
  precoAquisicao: 'Preço médio',
  cotacaoAtual: 'Cotação',
  valorTotal: 'Aplicado',
  valorInicialAplicado: 'Aplicado',
  valorAtualizado: 'Valor atualizado',
  percentualCarteira: '% da aba',
  riscoPorAtivo: 'Risco cart.',
  proventos: 'Proventos',
  necessidadeAporte: 'Nec. aporte',
  objetivo: 'Objetivo',
  quantoFalta: 'Quanto falta',
  rentabilidade: 'Rentabilidade',
  cotizacaoResgate: 'Cotização',
  liquidacaoResgate: 'Liquidação',
};

/**
 * Ordem da grade do cartão aberto (a do protótipo): quantidade, preço médio, cotação,
 * aplicado, % da aba, proventos, nec. aporte — e depois as demais na ordem da tabela.
 */
export const DETAIL_PRIORITY: readonly string[] = [
  'quantidade',
  'precoAquisicao',
  'cotacaoAtual',
  'valorTotal',
  'valorInicialAplicado',
  'percentualCarteira',
  'proventos',
  'necessidadeAporte',
];

/**
 * Ativo PLANEJADO (sem posição, 16/09/2026): só as colunas de planejamento mostram valor
 * (na tabela as demais viram traço; no cartão, nem aparecem).
 */
export const COLUNAS_VISIVEIS_PLANEJADO: ReadonlySet<string> = new Set([
  'cotacaoAtual',
  'percentualCarteira',
  'objetivo',
  'quantoFalta',
  'necessidadeAporte',
]);

/** Máximo de células na grade 3×3; o excedente vira linhas dt/dd. */
export const MAX_DETAIL_GRID = 9;

interface MobileColumnLike {
  key: string;
  header: unknown;
  mobile?: AssetMobileRole;
  mobileLabel?: string;
}

export function resolveAssetMobileRole(col: MobileColumnLike): AssetMobileRole {
  return col.mobile ?? DEFAULT_MOBILE_ROLE_BY_KEY[col.key] ?? 'detail';
}

export function resolveAssetMobileLabel(col: MobileColumnLike): string {
  if (col.mobileLabel) return col.mobileLabel;
  if (DEFAULT_MOBILE_LABEL_BY_KEY[col.key]) return DEFAULT_MOBILE_LABEL_BY_KEY[col.key];
  if (typeof col.header === 'string') return col.header;
  return col.key;
}

/** Colunas `detail` na ordem do protótipo (prioridade) e depois na da tabela. */
export function orderDetailColumns<T extends MobileColumnLike>(cols: T[]): T[] {
  const rank = (c: T) => {
    const i = DETAIL_PRIORITY.indexOf(c.key);
    return i === -1 ? DETAIL_PRIORITY.length : i;
  };
  return cols
    .map((col, index) => ({ col, index }))
    .sort((a, b) => rank(a.col) - rank(b.col) || a.index - b.index)
    .map(({ col }) => col);
}
