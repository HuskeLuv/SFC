/**
 * Paleta oficial My Finance (manual de identidade, PDF "MY_FINANCE_INST" p.5).
 * Nomes conforme o manual. Aplicada aos gráficos da carteira/Análise no
 * ticket 20/08/2026 — usar estas cores (não inventar tons) onde a marca couber.
 */
export const MYFINANCE_BRAND = {
  /** #2D2D2D — quase-preto */
  potencia: '#2D2D2D',
  /** #314666 — azul-marinho escuro */
  seguranca: '#314666',
  /** #396CAA — azul médio */
  patrimonio: '#396CAA',
  /** #0079F2 — azul vivo (cor-assinatura) */
  outside: '#0079F2',
  /** #6E9DC4 — azul suave */
  tranquilidade: '#6E9DC4',
  /** #CCCCCC — cinza claro */
  transparencia: '#CCCCCC',
  /** #EAEAEA — cinza mais claro */
  escolha: '#EAEAEA',
} as const;

/**
 * Fundo padrão dos cabeçalhos de tabela do app (ticket 25/08/2026: era o oliva
 * #9E8A58 da planilha-base; texto sempre branco por cima).
 */
export const TABLE_HEADER_BG = MYFINANCE_BRAND.seguranca;
