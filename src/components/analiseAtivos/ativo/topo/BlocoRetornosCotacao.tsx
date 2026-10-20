'use client';

/**
 * Card "Variação da cotação" da página do ativo (A6, item 5). DONO: fatia C
 * (docs/analise-ativos/fundamentei-trazer/desenho.json). Na fatia 0 é STUB (não renderiza nada); a
 * PaginaAtivo só o monta quando o topo traz `retornos` (ANALISE_ATIVOS_RETORNOS_HABILITADO), em
 * largura total depois de GraficoLucroCotacao + BlocoDividendos e antes de Fundamentos. A fatia C
 * troca o corpo mantendo as props: 4 janelas + distância da máxima, sinal +/− em cor NEUTRA (sem
 * classes de cor semântica), "sem proventos" no rodapé e, no FII, o texto sobre rendimentos
 * (TEXTOS_RETORNOS).
 */
import type { BlocoRetornosCotacaoProps } from '@/types/analiseAtivosComplementos';

export default function BlocoRetornosCotacao(_props: BlocoRetornosCotacaoProps) {
  return null;
}
