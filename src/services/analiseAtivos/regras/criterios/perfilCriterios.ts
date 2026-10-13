/**
 * STUB da fatia 0 — CORPO da fatia A. Regra ÚNICA de perfil (params):
 * - ação: ehFinanceira (o mesmo flag do universo/AnaliseQuadroLinha) → 'acao_financeira' (D4),
 *   senão 'acao';
 * - FII: 'papel' → 'fii_papel'; 'tijolo' → 'fii_tijolo'; híbrido, indefinido, FoF ou sem tipo
 *   (params.regraHibrido.aplicaA) → imoveisPlPct ≥ limiarImoveisPlPct ? 'fii_tijolo' : 'fii_papel'
 *   (imoveisPlPct null = papel). Assinatura FINAL.
 */
import type { CriteriaParams } from '@/services/analiseAtivos/params/criteriaParamsSchema';
import type { EntradaPerfilCriterios, PerfilCriterio } from '@/types/analiseAtivosCriterios';

export function perfilCriterios(
  _entrada: EntradaPerfilCriterios,
  _params: CriteriaParams,
): PerfilCriterio {
  throw new Error('perfilCriterios: não implementado (fatia A)');
}
