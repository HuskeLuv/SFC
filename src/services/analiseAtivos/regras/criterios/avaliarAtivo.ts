/**
 * STUB da fatia 0 — CORPO da fatia A (motor puro dos Filtros de Fundamentos, port do
 * evalCriteria/critCount do screen.js com as 3 correções da spec: 'up' com J+1 valores, só os anos da
 * janela, 'months' com ausência tratada). Assinatura FINAL: o job 'criterios' (executarCriterios) e
 * os testes dos casos 24–29 (casos45.test.ts, fixtures em src/test/fixtures/analiseAtivos/criterios.ts)
 * programam contra ela.
 *
 * Regras que o corpo segue (contrato): 'sem_dado' conta como não atende e não entra em `atendidos`;
 * 'nao_se_aplica' (financeira, D4) sai de `aplicaveis`; critério com ativo:false (D3) = 'sem_dado'
 * com motivo 'sem_fonte_confiavel'; fatos com formatarValorCriterio e TEXTOS_CRITERIOS.fatos.
 */
import type { CriteriaParams } from '@/services/analiseAtivos/params/criteriaParamsSchema';
import type { AvaliacaoAtivo, EntradaAvaliacaoAtivo } from '@/types/analiseAtivosCriterios';

export function avaliarAtivo(
  _entrada: EntradaAvaliacaoAtivo,
  _params: CriteriaParams,
  _paramsVersion: number,
): AvaliacaoAtivo {
  throw new Error('avaliarAtivo: não implementado (fatia A)');
}
