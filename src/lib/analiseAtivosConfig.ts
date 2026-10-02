/**
 * Flags da Análise de Ativos. Mesmo regime do COMUNIDADE_HABILITADA: desligadas por padrão.
 * Edge-safe (só lê process.env).
 *
 *  - ANALISE_ATIVOS_HABILITADA="true"    liga a área /analise-ativos (Fase 1) e as datas de
 *                                        resultado/assembleias na Agenda. Desligada: página e API 404.
 *  - ANALISE_ATIVOS_ACESSO="beta"|"todos" quem entra com a flag ligada (padrão 'beta': só a lista
 *                                        feature_beta_users + admins; 'todos' abre para todo mundo)
 *  - ANALISE_ATIVOS_NOVO_ATE=AAAA-MM-DD  até quando o menu mostra o selo NOVO (padrão 2026-12-31)
 *  - ANALISE_ATIVOS_ALERTA_ADMIN="true"  alertas dos jobs viram Notification para admins (só em prod)
 */
export function analiseAtivosHabilitada(): boolean {
  return process.env.ANALISE_ATIVOS_HABILITADA === 'true';
}

export function analiseAtivosAlertaAdmin(): boolean {
  return process.env.ANALISE_ATIVOS_ALERTA_ADMIN === 'true';
}

export type AcessoAnaliseAtivos = 'beta' | 'todos';

/** 'todos' só com o valor exato; qualquer outra coisa (inclusive vazio) = 'beta'. */
export function analiseAtivosAcesso(): AcessoAnaliseAtivos {
  return process.env.ANALISE_ATIVOS_ACESSO === 'todos' ? 'todos' : 'beta';
}

export const NOVO_ATE_PADRAO = '2026-12-31';

/** Data (AAAA-MM-DD) até a qual o selo NOVO aparece; valor inválido cai no padrão. */
export function analiseAtivosNovoAte(): string {
  const v = process.env.ANALISE_ATIVOS_NOVO_ATE?.trim();
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : NOVO_ATE_PADRAO;
}
