/**
 * Seção da Carteira numa COMPRA (fatia C1, rec. 2). O POST /api/carteira/operacao exige estrategia
 * (ação) ou tipoFii (FII) em TODA compra, então a seção é resolvida nesta ordem:
 *  1. com posição → valor da posição (overlay.posicoes[t].estrategia/tipoFii), oculto ('posicao');
 *     a rota não regrava a seção de quem já tem o ativo (decisão 6 do mover), então não se pergunta;
 *  2. planejado sem posição → Watchlist.secao (overlay.planejados[t].secao), editável ('planejado');
 *  3. FII novo → sugestão pela CVM (tijolo→tijolo, papel→tvm, fof→fofi), editável ('sugestao_cvm');
 *  4. sem nada disso → obrigatória ('obrigatoria', valor null): ação value | growth | risk; FII
 *     híbrido/indefinido escolhe entre os tipos da Carteira.
 * Valor fora das seções válidas da aba é ignorado (cai para o passo seguinte). Função pura.
 */
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import type { AtivoTopoResposta, ClasseQuadro, FiiTipoTela } from '@/types/analiseAtivosApi';
import type { SecaoOperacao } from '@/types/analiseAtivosCriterios';

/** Rótulo da tag de tipo (TEXTOS_TELA.ativo.tiposFii) → tipo do FII. */
const TIPO_POR_ROTULO = new Map<string, FiiTipoTela>(
  (Object.entries(TEXTOS_TELA.ativo.tiposFii) as Array<[FiiTipoTela, string]>).map(([k, v]) => [
    v,
    k,
  ]),
);

/**
 * Tipo do FII da página do ativo (sugestão de seção na 1ª compra/plano): o perfil da avaliação de
 * critérios primeiro (tijolo/papel, já com a regra de composição da rec. 3); sem ela, a tag de tipo
 * do cabeçalho. Ação ou sem informação ⇒ null.
 */
export function tipoCvmDoTopo(
  ativo: Pick<AtivoTopoResposta, 'classe' | 'tags' | 'criterios'>,
): FiiTipoTela | null {
  if (ativo.classe !== 'fii') return null;
  const perfil = ativo.criterios?.perfil;
  if (perfil === 'fii_tijolo') return 'tijolo';
  if (perfil === 'fii_papel') return 'papel';
  for (const tag of ativo.tags) {
    const tipo = TIPO_POR_ROTULO.get(tag);
    if (tipo) return tipo;
  }
  return null;
}

export interface EntradaSecaoOperacao {
  classe: ClasseQuadro;
  posicao: { estrategia?: string | null; tipoFii?: string | null } | null;
  planejado: { secao?: string | null } | null;
  /** tipo do FII na CVM (sugestão da 1ª compra) */
  tipoCvm: FiiTipoTela | null;
}

/** Seções que a rota de operação aceita (estrategia de ação; tipoFii de FII), na ordem da tela. */
export const SECOES_OPERACAO: Record<ClasseQuadro, readonly string[]> = {
  acao: ['value', 'growth', 'risk'],
  fii: ['tijolo', 'tvm', 'fofi', 'infra'],
};

/** Tipo do FII na CVM → tipoFii da Carteira (híbrido e indefinido não têm equivalente). */
export const SECAO_POR_TIPO_CVM: Partial<Record<FiiTipoTela, string>> = {
  tijolo: 'tijolo',
  papel: 'tvm',
  fof: 'fofi',
};

export function secaoValida(classe: ClasseQuadro, valor: string | null | undefined): boolean {
  return !!valor && SECOES_OPERACAO[classe].includes(valor);
}

export function secaoOperacao({
  classe,
  posicao,
  planejado,
  tipoCvm,
}: EntradaSecaoOperacao): SecaoOperacao {
  if (posicao) {
    const daPosicao = classe === 'acao' ? posicao.estrategia : posicao.tipoFii;
    if (secaoValida(classe, daPosicao)) {
      return { valor: daPosicao as string, editavel: false, origem: 'posicao' };
    }
  }
  if (planejado && secaoValida(classe, planejado.secao)) {
    return { valor: planejado.secao as string, editavel: true, origem: 'planejado' };
  }
  if (classe === 'fii' && tipoCvm) {
    const sugestao = SECAO_POR_TIPO_CVM[tipoCvm];
    if (sugestao) return { valor: sugestao, editavel: true, origem: 'sugestao_cvm' };
  }
  return { valor: null, editavel: true, origem: 'obrigatoria' };
}
