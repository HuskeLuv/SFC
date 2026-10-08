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
 *  - ANALISE_ATIVOS_REPORTE_HABILITADO="true"  bloco C: botão "Reportar dado incorreto", Meus
 *                                        relatos e as APIs de relato (sem ela: item escondido e
 *                                        APIs 404). Só vale com a área liberada para o usuário. A
 *                                        fila do curador (/admin/curadoria) e os avisos aos admins
 *                                        também dependem dela (não de ALERTA_ADMIN; decisão 14).
 *
 *  Bloco D (docs/analise-ativos/blocoD/decisoes.md, decisão 15): uma flag por recurso, todas
 *  desligadas por padrão e válidas SÓ com a área liberada para o usuário (recursosLiberados em
 *  acessoAnalise.ts). Desligada: a UI fica idêntica à de hoje e a rota do recurso responde 404.
 *  Ordem de ligar em produção: RAIOX → COMPARADOR → CENARIOS, com OK a cada passo.
 *  - ANALISE_ATIVOS_RAIOX_HABILITADO="true"       Fundamentos · Raio-X + Exportar CSV
 *  - ANALISE_ATIVOS_COMPARADOR_HABILITADO="true"  página Comparador + entradas (pílulas, Quadro,
 *                                                 botão no cabeçalho do ativo)
 *  - ANALISE_ATIVOS_CENARIOS_HABILITADO="true"    Valuation · Meus cenários (depende do jurídico)
 */
export function analiseAtivosHabilitada(): boolean {
  return process.env.ANALISE_ATIVOS_HABILITADA === 'true';
}

/** Bloco C: relatos de dado incorreto (desligado por padrão; decisão 20). */
export function analiseAtivosReporteHabilitado(): boolean {
  return process.env.ANALISE_ATIVOS_REPORTE_HABILITADO === 'true';
}

/** Bloco D: Fundamentos · Raio-X + CSV (desligado por padrão; decisão 15). */
export function analiseAtivosRaioXHabilitado(): boolean {
  return process.env.ANALISE_ATIVOS_RAIOX_HABILITADO === 'true';
}

/** Bloco D: Comparador e as entradas dele (desligado por padrão; decisão 15). */
export function analiseAtivosComparadorHabilitado(): boolean {
  return process.env.ANALISE_ATIVOS_COMPARADOR_HABILITADO === 'true';
}

/** Bloco D: Valuation · Meus cenários (desligado por padrão; decisão 15). */
export function analiseAtivosCenariosHabilitado(): boolean {
  return process.env.ANALISE_ATIVOS_CENARIOS_HABILITADO === 'true';
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
