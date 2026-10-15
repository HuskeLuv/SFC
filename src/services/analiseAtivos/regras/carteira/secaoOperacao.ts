/**
 * Seção da Carteira numa COMPRA — v2.5 (fatia C, decisão 2): AUTOMÁTICA, sem campo no modal. O
 * POST /api/carteira/operacao exige estrategia (ação) ou tipoFii (FII) em TODA compra, então a seção
 * é resolvida nesta ordem e nunca fica vazia:
 *  1. com posição → valor da posição (overlay.posicoes[t].estrategia/tipoFii) ('posicao'); a rota
 *     não regrava a seção de quem já tem o ativo (decisão 6 do mover);
 *  2. planejado antigo sem posição → Watchlist.secao (overlay.planejados[t].secao) ('planejado');
 *  3. FII: tipo CVM 'fof' → 'fofi'; senão pelo perfil — tijolo → 'tijolo', qualquer outro → 'tvm'
 *     ('sugestao_cvm'; sem tipo conhecido, 'tvm' com origem 'padrao');
 *  4. ação → 'value' ('padrao'), o mesmo padrão da rota de operação nas recompras sem estratégia.
 * O modal mostra a linha "Na Carteira: Ações · Value (dá para mover depois)": quem usa growth/risk
 * corrige pelo mover (#274). Valor fora das seções válidas da aba é ignorado (cai para o passo
 * seguinte). 'obrigatoria' (v2.4) não é mais devolvida. Função pura.
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
 * Tipo do FII da página do ativo para a seção automática: o tipo CVM BRUTO 'fof' primeiro
 * (AtivoTopoResposta.fiiTipoCvm → seção 'fofi'); depois o perfil da avaliação de critérios
 * (tijolo/papel, já com a regra de composição); depois o tipo CVM bruto; por fim a tag de tipo do
 * cabeçalho. Ação ou sem informação ⇒ null.
 */
export function tipoCvmDoTopo(
  ativo: Pick<AtivoTopoResposta, 'classe' | 'tags' | 'criterios' | 'fiiTipoCvm'>,
): FiiTipoTela | null {
  if (ativo.classe !== 'fii') return null;
  if (ativo.fiiTipoCvm === 'fof') return 'fof';
  const perfil = ativo.criterios?.perfil;
  if (perfil === 'fii_tijolo') return 'tijolo';
  if (perfil === 'fii_papel') return 'papel';
  if (ativo.fiiTipoCvm) return ativo.fiiTipoCvm;
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
  /** tipo do FII (tipoCvmDoTopo: 'fof' bruto, senão o do perfil) */
  tipoCvm: FiiTipoTela | null;
}

/** Seções que a rota de operação aceita (estrategia de ação; tipoFii de FII), na ordem da tela. */
export const SECOES_OPERACAO: Record<ClasseQuadro, readonly string[]> = {
  acao: ['value', 'growth', 'risk'],
  fii: ['tijolo', 'tvm', 'fofi', 'infra'],
};

/**
 * Tipo do FII → tipoFii da Carteira. Híbrido e indefinido caem em 'tvm' (o perfil já decidiu
 * tijolo quando os imóveis são ≥ 50% do PL — regra conservadora, como o tipo exibido).
 */
export const SECAO_POR_TIPO_CVM: Record<FiiTipoTela, string> = {
  tijolo: 'tijolo',
  papel: 'tvm',
  fof: 'fofi',
  hibrido: 'tvm',
  indefinido: 'tvm',
};

/** Seção padrão quando nada indica outra (ação → 'value'; FII sem tipo → 'tvm'). */
export const SECAO_PADRAO: Record<ClasseQuadro, string> = { acao: 'value', fii: 'tvm' };

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
    return { valor: planejado.secao as string, editavel: false, origem: 'planejado' };
  }
  if (classe === 'fii' && tipoCvm) {
    const sugestao = SECAO_POR_TIPO_CVM[tipoCvm];
    if (sugestao) return { valor: sugestao, editavel: false, origem: 'sugestao_cvm' };
  }
  return { valor: SECAO_PADRAO[classe], editavel: false, origem: 'padrao' };
}
