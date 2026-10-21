/**
 * Textos do visual v2 da Análise de Ativos (fundamentei-regras, F4, item C — HTML do Pedro), só com
 * ANALISE_ATIVOS_VISUAL_V2_HABILITADO. Rótulos curtos, factuais, sem avaliação nem chamada à ação
 * (varredura linguagemV2 + termos EN proibidos em textosVisual.test.ts). Com a chave desligada nada
 * daqui aparece.
 */
import { formatarTexto } from '@/services/analiseAtivos/textos';

export const TEXTOS_VISUAL = {
  quadro: {
    /** rótulo da faixa de filtros (o mesmo de textosQuadro.barra.rotulo) */
    filtros: 'Filtros de fundamentos',
    /** meta à direita da faixa: '12 de 312 · ordem' */
    meta: '{contador} · ordem',
  },
  pares: {
    titulo: 'Comparação com pares do setor',
    hint: 'clique para abrir',
    /** '{ticker} · {nome}' na 1ª coluna */
    ativo: '{ticker} · {nome}',
    /** leitor de tela: a 1ª linha é o próprio ativo */
    proprioSr: 'este ativo',
  },
  eventos: {
    hint: 'vai para a sua Agenda',
  },
  historicos: {
    hint: 'vs. média 10a',
    media: 'média 10a',
  },
  essencial: {
    /** linha de unidade acima da tabela */
    unidade: 'Valores em {unidade} · ano fiscal · {fonte}',
    fonteCvm: 'fonte: demonstrações financeiras (CVM)',
  },
  raioX: {
    unidade: 'Valores em {unidade} · ano fiscal · mais recente à esquerda',
  },
  grafico: {
    /** linha de referência do gráfico Lucro por ação × Cotação */
    base100: 'base 100',
  },
  comparador: {
    /** cabeçalho do card dos mini-gráficos */
    escala: 'mesma escala nos gráficos',
  },
} as const;

export function textoVisual(t: string, valores: Record<string, string | number>): string {
  return formatarTexto(t, valores);
}
