/**
 * Tipo de FII EXIBIDO (v2.5, desenho final.mudancas_por_item "6 · Tipos de FII") — PURO e sem
 * dependência de servidor (o Quadro, a busca, as sugestões do Comparar e as tags do topo usam).
 *
 * - Na tela o tipo é só Tijolo ou Papel (protótipo data.js). Vem do perfil dos critérios (regra de
 *   composição: imóveis ≥ 50% do PL → 'fii_tijolo'): 'fii_tijolo' → tijolo, senão papel. Sem
 *   avaliação, o tipo CVM 'tijolo' continua tijolo e o resto (papel, FoF, híbrido, indefinido, sem
 *   tipo) cai em papel — regra conservadora, a mesma de sugestoesComparar.perfilFii.
 * - FoF e Híbrido (tipo CVM bruto) viram PREFIXO do segmento ('FoF · Títulos e Valores
 *   Mobiliários'); 'indefinido' e sem tipo não aparecem.
 * - O tipo CVM bruto fica na coluna gravada (analise_quadro_linhas.fiiTipo) e em
 *   AtivoTopoResposta.fiiTipoCvm (seção automática da Carteira).
 */
import { TEXTOS_QUADRO, formatarTexto } from '@/services/analiseAtivos/textosQuadro';
import type { LinhaQuadroApi, SegmentoTipoFii, TipoFiiExibido } from '@/types/analiseAtivosApi';

/** Tipo exibido a partir do perfil dos critérios (preferido) e do tipo CVM bruto. */
export function tipoFiiExibido(
  perfil: string | null | undefined,
  tipoCvm: string | null | undefined,
): TipoFiiExibido {
  if (perfil === 'fii_tijolo') return 'tijolo';
  if (perfil === 'fii_papel') return 'papel';
  return tipoCvm === 'tijolo' ? 'tijolo' : 'papel';
}

/** Prefixo do segmento pelo tipo CVM bruto ('fof' | 'hibrido'); senão null. */
export function segmentoTipoDe(tipoCvm: string | null | undefined): SegmentoTipoFii | null {
  return tipoCvm === 'fof' || tipoCvm === 'hibrido' ? tipoCvm : null;
}

/** Segmento exibido: 'FoF · ‹segmento CVM›', só 'FoF' sem segmento, ou o segmento CVM. */
export function rotuloSegmentoFii(
  segmentoTipo: SegmentoTipoFii | null | undefined,
  segmentoCvm: string | null | undefined,
): string | null {
  if (!segmentoTipo) return segmentoCvm ?? null;
  const tipo = TEXTOS_QUADRO.segmentoTipo[segmentoTipo];
  return segmentoCvm
    ? formatarTexto(TEXTOS_QUADRO.segmentoTipo.comSegmento, { tipo, segmento: segmentoCvm })
    : tipo;
}

/**
 * Linha do Quadro com o tipo exibido (fiiTipo = 'tijolo' | 'papel') e o prefixo do segmento
 * (segmentoTipo). Ação passa igual. Idempotente: uma linha já convertida (fiiTipo tijolo/papel,
 * segmentoTipo presente) não muda.
 */
export function comTipoFiiExibido(l: LinhaQuadroApi): LinhaQuadroApi {
  if (l.classe !== 'fii') return l;
  if (l.segmentoTipo !== undefined) return l;
  return {
    ...l,
    fiiTipo: tipoFiiExibido(l.criterios?.perfil, l.fiiTipo),
    segmentoTipo: segmentoTipoDe(l.fiiTipo),
  };
}
