/**
 * Chave da Carteira EUA em US$ (out/2026). Mesmo regime do MOVER_CAIXA_RF_HABILITADO:
 * env lida em RUNTIME no servidor; desligar = mudar a env + restart, sem PR.
 *
 *  - CARTEIRA_EUA_DOLAR_HABILITADO="true"   liga
 *
 * Controla SÓ duas coisas (docs/carteira-eua-dolar/desenho.json, chaves):
 *  (a) a unidade de uma posição NOVA de stock EUA: ligada = US$, desligada = R$ legado;
 *  (b) o layout novo das abas Stocks/REITs, devolvido pela rota como `layoutUsd: true`.
 *
 * Os leitores (consolidado, snapshots, fluxos, proventos) NÃO consultam a chave: convertem
 * pela unidade gravada (src/lib/ativoEmDolar.ts). Por isso desligá-la é sempre seguro.
 *
 * DESLIGADA por padrão. No CLIENTE devolve sempre false (a env não é NEXT_PUBLIC): a UI
 * decide pelos campos que o servidor devolve.
 */
export function carteiraEuaDolarHabilitado(): boolean {
  if (typeof process === 'undefined' || !process.env) return false;
  return process.env.CARTEIRA_EUA_DOLAR_HABILITADO === 'true';
}
