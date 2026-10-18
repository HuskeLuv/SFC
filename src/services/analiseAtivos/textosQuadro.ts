/**
 * Textos do Quadro v2.4 (barra de filtros, contador, estado vazio, colunas novas, ordenação A–Z).
 * Dono: fatia B (o textosTela NÃO é editado na B, a limpeza é da F). Os textos que já existiam no
 * textosTela e continuam neutros (abas, colunas antigas, "Mostrar mais", erro) seguem lidos de lá;
 * tudo o que é NOVO na v2.4 fica aqui.
 *
 * Todo valor passa por linguagemV2 (textosQuadro.test.ts): sem nota, Índice, semáforo, destaque,
 * vencedor, melhor/pior, recomend*, compre/venda. Literais jurídicos (rodapé do Quadro, aviso legal,
 * aviso do banner) ficam em textosLiterais.ts; textos dos critérios em textosCriterios.ts.
 * Placeholders {chave} via formatarTexto.
 *
 * v2.5 (fatia 0, CONGELADOS para a B): coluna/faceta Tipo só com Tijolo ou Papel (protótipo
 * data.js), FoF e Híbrido como prefixo do segmento; explicação da financeira sem "n de 3" e sem
 * "sem fonte"; dica da vacância sem "não entra nos critérios".
 */
import { formatarTexto } from '@/services/analiseAtivos/textos';
import type { Janela } from '@/types/analiseAtivosCriterios';

export { formatarTexto };

export const TEXTOS_QUADRO = {
  /** subtítulo da área (sai do textosTela, que ainda fala no indicador antigo) */
  subtitulo: 'Dados e fundamentos de ações e FIIs, ao lado da sua carteira',
  /** description da página (metadata) */
  metaDescricao:
    'Ações e FIIs da B3 com fundamentos de 10 anos e filtros de critérios verificados nas demonstrações financeiras.',

  /** Barra "Filtros de fundamentos" (BarraFiltrosCriterios). */
  barra: {
    rotulo: 'Filtros de fundamentos',
    chipsRotulo: 'Critérios de fundamentos (todos os ligados valem juntos)',
    naCarteira: 'Na minha carteira',
    setor: 'Setor',
    segmento: 'Segmento',
    setorTodos: 'Todos',
    limpar: 'Limpar filtros',
    fechar: 'Fechar',
    /** sr-only do chip desabilitado (o selo visível é TEXTOS_CRITERIOS.chips.seloSemDado) */
    desabilitadoSr: 'filtro indisponível',
  },

  /** Contador ao lado da ordem (aria-live). */
  contador: {
    simples: '{n} de {total}',
    umCriterio: '{n} de {total} atendem a 1 critério em {anos} anos',
    variosCriterios: '{n} de {total} atendem a {k} critérios em {anos} anos',
  },

  /** Estado vazio com critérios ligados (o link "limpe os filtros" é um botão). */
  vazio: {
    titulo: 'Nenhum ativo atende aos filtros',
    criteriosAntes:
      'Nenhum ativo atende a todos os critérios selecionados em {anos} anos. Experimente uma janela menor ou menos critérios — ou ',
    criteriosLink: 'limpe os filtros',
    criteriosDepois: '.',
  },

  /** Ordem: A–Z por padrão; a pílula da coluna ativa volta para A–Z. */
  ordem: {
    rotulo: 'ordem',
    grupo: 'Ordem',
    az: 'A–Z',
    azPadrao: 'A–Z (padrão)',
    ordenarPor: 'Ordenar por',
    voltarAz: 'Ordenado por {valor}, {direcao}. Voltar à ordem alfabética',
    crescente: 'crescente',
    decrescente: 'decrescente',
    alfabetica: 'ordem alfabética',
  },

  /** Colunas novas e dicas dos cabeçalhos (title do botão de ordenar). */
  colunas: {
    criterios: 'Critérios',
  },
  dicas: {
    lucrosSeguidos: 'Anos seguidos com lucro líquido positivo (até 10+)',
    lucro10a:
      'Lucro líquido nos últimos 10 anos fechados: barra para cima = lucro, para baixo = prejuízo',
    rendimento10a: 'Rendimento por cota nos últimos 10 anos fechados',
    divLiqEbitda: 'Negativo = caixa líquido',
    vacanciaCvm:
      'Vacância física informada à CVM (último informe trimestral); pode diferir do relatório do gestor. O critério "Vacância ≤ 10%" olha os anos fechados da janela, não este informe',
    criterios:
      'Quantos critérios de fundamentos o ativo atende na janela escolhida (dado contábil, não avaliação do My Finance)',
    // EUA (fatia 0)
    dpaUsd: 'Dividendo por ação no último ano fiscal, em US$ (relatório 10-K)',
    fcoAcao:
      'Caixa operacional ÷ média de ações diluídas do último ano fiscal, em US$; difere do FFO do relatório',
    divFco: 'Dividendos pagos ÷ caixa operacional no último ano fiscal',
    anosDividendo: 'Anos seguidos com dividendo por ação maior que o do ano anterior',
  },

  /** Área recolhível "O que cada critério verifica". */
  explicacao: {
    resumo: 'O que cada critério verifica',
    papel: 'em FII de papel: {rotulo} — {definicao}',
    financeira:
      'Bancos, seguradoras e holdings financeiras seguem os mesmos 6 critérios; o que não existe nas demonstrações conta como "não atende · sem dado nas demonstrações"',
  },

  /** v2.5: tipo exibido (TipoFiiExibido) e prefixo do segmento para FoF/Híbrido. */
  tipos: {
    tijolo: 'Tijolo',
    papel: 'Papel',
  },
  segmentoTipo: {
    fof: 'FoF',
    hibrido: 'Híbrido',
    /** '{tipo} · {segmento}' ('FoF · Títulos e Valores Mobiliários') */
    comSegmento: '{tipo} · {segmento}',
  },

  /** Cartões do celular. */
  cartao: {
    serieLucro: 'lucro em 10 anos',
    serieRendimento: 'rendimento em 10 anos',
  },

  /** Rodapé legal da casca: título fora do nó do literal. */
  legal: {
    avisoTitulo: 'Aviso importante.',
  },
} as const;

/** Placeholders aceitos nos textos deste módulo (o teste confere). */
export const PLACEHOLDERS_QUADRO = [
  'n',
  'total',
  'k',
  'anos',
  'valor',
  'direcao',
  'rotulo',
  'definicao',
  'tipo',
  'segmento',
] as const;

/**
 * Contador do Quadro (caso 30): sem critério ligado '22 de 312'; com critérios
 * '22 de 312 atendem a 3 critérios em 5 anos' (1 critério no singular). `total` = ativos da classe
 * sem filtro (QuadroResposta.totalClasse); `n` = ativos que passam por TODOS os filtros.
 */
export function textoContadorQuadro(e: {
  n: number;
  total: number;
  criterios: number;
  janela: Janela;
}): string {
  const C = TEXTOS_QUADRO.contador;
  if (e.criterios <= 0) return formatarTexto(C.simples, { n: e.n, total: e.total });
  const template = e.criterios === 1 ? C.umCriterio : C.variosCriterios;
  return formatarTexto(template, { n: e.n, total: e.total, k: e.criterios, anos: e.janela });
}
