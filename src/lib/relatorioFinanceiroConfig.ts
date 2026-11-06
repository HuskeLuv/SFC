/**
 * Chave do Relatório financeiro (ticket 86e3yg90z), no mesmo regime da COMUNIDADE_HABILITADA.
 * Desligada (padrão), a página /relatorios/financeiro e a API respondem 404 e o subitem do menu
 * some. Ligada no CI/e2e e no dev local; em prod só depois da medição de tempo e do QA.
 *
 * Edge-safe: só lê process.env.
 *
 *  - RELATORIO_FINANCEIRO_HABILITADO="true"   liga o relatório
 */
export function relatorioFinanceiroHabilitado(): boolean {
  return process.env.RELATORIO_FINANCEIRO_HABILITADO === 'true';
}
