/**
 * Regra de perfil dos Filtros de Fundamentos para Stocks e REITs (fatia B; desenho
 * final.criterios). Complementa perfilCriterios (que só conhece ação e FII) sem mudá-lo:
 *  - stock: SecCompany.ehFinanceira (SIC 6000–6799 exceto 6798, + override por CIK, gravado pela
 *    fatia A) → 'stock_financeira' ("n de 6" literal na v3), senão 'stock';
 *  - reit: 'reit'.
 * Funções puras.
 */
import { ehSicFinanceira, type ClasseEua } from '@/types/analiseAtivosEua';
import type { PerfilCriterioEua } from '@/types/analiseAtivosCriterios';

export interface EntradaPerfilEua {
  classe: ClasseEua;
  /** SecCompany.ehFinanceira; ausente = pela faixa de SIC */
  ehFinanceira?: boolean | null;
  sic?: number | null;
}

export function perfilCriteriosEua(e: EntradaPerfilEua): PerfilCriterioEua {
  if (e.classe === 'reit') return 'reit';
  const financeira =
    typeof e.ehFinanceira === 'boolean' ? e.ehFinanceira : ehSicFinanceira(e.sic ?? null);
  return financeira ? 'stock_financeira' : 'stock';
}
