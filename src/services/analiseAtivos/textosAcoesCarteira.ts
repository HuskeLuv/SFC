/**
 * Textos da linha de ações do cabeçalho, dos 4 modais da Carteira e do card "Na sua carteira" (base
 * da aba). STUB da fatia 0 — dono: fatia C1 (preenche; BlocoNaCarteira e BarraPesoAlvo passam a
 * importar daqui e deixam o quantoFalta/faltam do textosTela, que a F apaga).
 *
 * TEXTOS_OPERACAO fica SEPARADO: rótulos de tipo de operação ('Compra'/'Venda') varridos pela lista
 * própria de linguagemV2 (encontrarProibidasOperacao); o resto passa pela lista padrão. O
 * vocabulário de desvio compartilhado está em TEXTOS_CRITERIOS.desvio.
 */
export const TEXTOS_OPERACAO = {
  compra: 'Compra',
  venda: 'Venda',
} as const;

export const TEXTOS_ACOES_CARTEIRA = {} as const;
