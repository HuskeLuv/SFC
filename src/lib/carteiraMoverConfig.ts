/**
 * Chave da FASE 2 do mover na Carteira (out/2026): Reserva de Emergência,
 * Reserva de Oportunidade e Renda Fixa passam a trocar entre si. Mesmo regime
 * do COMUNIDADE_HABILITADA / PLUGGY_HABILITADO: env lida em RUNTIME no servidor;
 * desligar = mudar a env + restart, sem PR (docs/carteira-mover/fase2-decisoes.md).
 *
 *  - MOVER_CAIXA_RF_HABILITADO="true"   libera as 3 abas no mover
 *
 * DESLIGADA por padrão: com ela desligada nada visível muda em relação à fase 1
 * (bandeja, diálogo, rotas, Saúde, pizza, 'cash' — tudo como antes).
 *
 * No CLIENTE devolve sempre false (a env não é NEXT_PUBLIC). A UI NUNCA decide
 * pela chave: decide pelos dados do servidor (destinos do GET /mover,
 * `naoMovivelMotivo` das linhas, `opcoes.movivel`).
 */
export function moverCaixaRfHabilitado(): boolean {
  if (typeof process === 'undefined' || !process.env) return false;
  return process.env.MOVER_CAIXA_RF_HABILITADO === 'true';
}
