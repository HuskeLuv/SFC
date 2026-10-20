'use client';

/**
 * Card "Dados societários e estatuto" da página da ação (A6, item 6). DONO: fatia D
 * (docs/analise-ativos/fundamentei-trazer/desenho.json). Na fatia 0 é STUB (não renderiza nada); a
 * PaginaAtivo só o monta para ação com recursos.societario, depois de Múltiplos históricos + Pares e
 * antes de Tese/Eventos, dentro de uma SecaoPreguicosa. A fatia D troca o corpo mantendo as props:
 * useSocietarioAtivo(ticker) → SocietarioResposta; a partir de xl em 2 colunas (acionistas |
 * circulação, tag along, dividendo mínimo); exercício do FRE + DT_RECEB em cada parte; só nome e %
 * dos acionistas (TEXTOS_SOCIETARIO).
 */
import type { BlocoSocietarioProps } from '@/types/analiseAtivosComplementos';

export default function BlocoSocietario(_props: BlocoSocietarioProps) {
  return null;
}
