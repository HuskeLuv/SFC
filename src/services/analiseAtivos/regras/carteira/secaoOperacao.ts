/**
 * STUB da fatia 0 — CORPO da fatia C1. Seção da Carteira numa COMPRA (o POST /api/carteira/operacao
 * exige estrategia (ação) ou tipoFii (FII) em TODA compra):
 *  1. com posição → valor da posição (overlay.posicoes[t].estrategia/tipoFii), oculto ('posicao');
 *  2. planejado sem posição → Watchlist.secao (overlay.planejados[t].secao), editável ('planejado');
 *  3. FII novo → sugestão pela CVM (tijolo→tijolo, papel→tvm, fof→fofi), editável ('sugestao_cvm');
 *  4. ação nova sem planejado → obrigatória (value | growth | risk) ('obrigatoria', valor null).
 * Assinatura FINAL.
 */
import type { ClasseQuadro, FiiTipoTela } from '@/types/analiseAtivosApi';
import type { SecaoOperacao } from '@/types/analiseAtivosCriterios';

export interface EntradaSecaoOperacao {
  classe: ClasseQuadro;
  posicao: { estrategia?: string | null; tipoFii?: string | null } | null;
  planejado: { secao?: string | null } | null;
  /** tipo do FII na CVM (sugestão da 1ª compra) */
  tipoCvm: FiiTipoTela | null;
}

export function secaoOperacao(_entrada: EntradaSecaoOperacao): SecaoOperacao {
  throw new Error('secaoOperacao: não implementado (fatia C1)');
}
