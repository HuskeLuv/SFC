'use client';

/**
 * Seção "Imóveis e composição do fundo" da página do FII (A6, itens 1 e 2). DONO: fatia A
 * (docs/analise-ativos/fundamentei-trazer/desenho.json). Na fatia 0 é STUB (não renderiza nada);
 * a PaginaAtivo só o monta com recursos.imoveisFii, entre Fundamentos e Valuation, dentro de uma
 * SecaoPreguicosa. A fatia A troca o corpo mantendo as props: useImoveisFii(ticker) →
 * ImoveisFiiResposta; tijolo/híbrido com imóvel de renda = ComposicaoAtivoFii (1/3) +
 * ListaImoveisFii (2/3) a partir de xl; papel/FoF = só a composição, na largura toda. Textos em
 * TEXTOS_IMOVEIS_FII; sem cor semântica; em 390 px a lista vira cartões.
 */
import type { BlocoImoveisFiiProps } from '@/types/analiseAtivosComplementos';

export default function BlocoImoveisFii(_props: BlocoImoveisFiiProps) {
  return null;
}
