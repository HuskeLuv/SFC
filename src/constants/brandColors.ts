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

/**
 * Tons derivados da paleta, já usados no app e oficializados no bloco 1 da Análise de Ativos
 * (docs/analise-ativos/bloco1-salvos/desenho.json): fundo de estado selecionado/ligado ("Salvo ✓",
 * faixas de aviso, chips marcados; ~20 arquivos usavam #EDF2F8 solto) e a borda que o acompanha.
 * Só no tema claro; no escuro, use bg-white/5 e bordas cinza do app.
 */
export const MYFINANCE_TONS = {
  /** #EDF2F8 — fundo selecionado (patrimônio clareado) */
  fundoSelecionado: '#EDF2F8',
  /** #DCE6F2 — borda do selecionado */
  bordaSelecionada: '#DCE6F2',
} as const;
