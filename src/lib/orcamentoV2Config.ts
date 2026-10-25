/**
 * Flags do Orçamento v2 (ticket 86e3v8p3u, docs/orcamento-v8/desenho-tecnico.md §8). Mesmo regime
 * do MOVER_CAIXA_RF_HABILITADO: env lida em RUNTIME no servidor, sem NEXT_PUBLIC; desligar = mudar
 * a env + restart, sem PR.
 *
 *  - ORCAMENTO_V2_HABILITADO="true"      liga o Orçamento v2. Desligado: rotas
 *                                        /api/cashflow/orcamento/v2/* respondem 404 (exceto /acesso,
 *                                        que diz 'desligada') e a tela é a de hoje para todos.
 *  - ORCAMENTO_V2_ACESSO="beta"|"todos"  quem entra com a flag ligada (padrão 'beta': só a lista
 *                                        feature_beta_users, recurso 'orcamento-v2'; admin NÃO
 *                                        entra automático. 'todos' só na E5, com OK do Wellington).
 *
 * No CLIENTE devolve sempre false/'beta' (a env não é NEXT_PUBLIC). A UI decide pelo
 * GET /api/cashflow/orcamento/v2/acesso.
 */
export type AcessoOrcamentoV2 = 'beta' | 'todos';

export function orcamentoV2Habilitado(): boolean {
  if (typeof process === 'undefined' || !process.env) return false;
  return process.env.ORCAMENTO_V2_HABILITADO === 'true';
}

export function orcamentoV2Acesso(): AcessoOrcamentoV2 {
  if (typeof process === 'undefined' || !process.env) return 'beta';
  return process.env.ORCAMENTO_V2_ACESSO === 'todos' ? 'todos' : 'beta';
}
