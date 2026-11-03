/**
 * Blocos de caixa/investimento da Planilha do Fluxo de Caixa que ficam fora da tela (pedido do
 * Pedro, ticket 86e3vxd5r, 03/11/2026): "Saldo Conta Corrente mês anterior", o grupo "Conta
 * Corrente", o grupo "Aporte/Resgate" (Investimentos, automático da carteira) e a linha "Fluxo de
 * Caixa livre".
 *
 * É só exibição (desktop, grade do ano e visão do mês no celular): nenhum dado é apagado e as
 * séries continuam sendo calculadas — Evolução do Patrimônio, Índice de Poupança, Caixa para
 * Investir e o carry de dezembro seguem iguais. Voltar a mostrar = trocar para `true`.
 */
export const MOSTRAR_BLOCOS_CAIXA_NA_PLANILHA = false;
