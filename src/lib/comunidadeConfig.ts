/**
 * Flag da Comunidade (23/09/2026): fica só em dev até a revisão do termo pelos
 * advogados, no mesmo regime do PLUGGY_HABILITADO. Desligada, o menu some e
 * toda rota /api/comunidade/** responde 503.
 *
 *  - COMUNIDADE_HABILITADA="true"   liga a comunidade
 */
export function comunidadeHabilitada(): boolean {
  return process.env.COMUNIDADE_HABILITADA === 'true';
}
