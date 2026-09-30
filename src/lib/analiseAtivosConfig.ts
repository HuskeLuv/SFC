/**
 * Flags da Análise de Ativos (Fase 0 = só dados, sem tela — 30/09/2026). Mesmo regime do
 * COMUNIDADE_HABILITADA: desligadas por padrão; ligar só depois da Fase 1.
 *
 *  - ANALISE_ATIVOS_HABILITADA="true"    datas de resultado/assembleias na Agenda (e, na Fase 1, a área)
 *  - ANALISE_ATIVOS_ALERTA_ADMIN="true"  alertas dos jobs viram Notification para admins (só em prod)
 */
export function analiseAtivosHabilitada(): boolean {
  return process.env.ANALISE_ATIVOS_HABILITADA === 'true';
}

export function analiseAtivosAlertaAdmin(): boolean {
  return process.env.ANALISE_ATIVOS_ALERTA_ADMIN === 'true';
}
