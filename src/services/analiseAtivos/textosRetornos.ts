/**
 * Textos do card "Variação da cotação" da página do ativo (A6, item 5; dona: fatia C) e das linhas
 * de variação do Comparador (fatia F: TEXTOS_COMPARADOR.linhas.variacao12m/variacao5a). Escritos e
 * congelados na fatia 0; a fatia C pode ACRESCENTAR chaves, sem renomear. Varredura linguagemV2Global
 * e, na fatia C, a varredura própria sem 'queda'/'desconto'.
 *
 * Decisões do Wellington (19/10): sinal +/− em cor NEUTRA (a cor fica só na variação do dia, no
 * cabeçalho); retorno só de PREÇO, "sem proventos", com o texto explícito no FII sobre rendimentos.
 * 24/10/2026 (regra "igual ao Fundamentei"): passa a ser RETORNO TOTAL, com proventos reinvestidos na
 * data-ex; os textos dizem isso.
 */
export const TEXTOS_RETORNOS = {
  titulo: 'Retorno total',
  sub: 'cotação ajustada, com proventos reinvestidos',
  janelas: {
    '1m': '1 mês',
    '12m': '12 meses',
    '5a': '5 anos (a.a.)',
    '10a': '10 anos (a.a.)',
  },
  distanciaMaxima: 'Distância da máxima',
  /** {valor} = preço (R$), {data} = dd/mm/aaaa, {desde} = mês/ano do início da série */
  distanciaMaximaSub: 'máxima de fechamento {valor} em {data} (série desde {desde})',
  semDado: 'sem dado',
  /** motivo da janela sem dado por série curta, por janela (MotivoRetorno 'serie_curta') */
  serieCurta: {
    '1m': 'menos de 1 mês de cotação neste código',
    '12m': 'menos de 12 meses de cotação neste código',
    '5a': 'menos de 5 anos de cotação neste código',
    '10a': 'menos de 10 anos de cotação neste código',
  },
  motivos: {
    evento_nao_confirmado:
      'evento societário em conferência: as variações longas ficam ocultas até a confirmação',
    sem_cotacao: 'sem cotação recente neste código',
  },
  rodape:
    'Cotação de fechamento ajustada por desdobramentos, grupamentos e bonificações confirmados, com os proventos reinvestidos na data-ex · fonte B3 (COTAHIST) · até {data}.',
  rodapeFii:
    'Inclui os rendimentos distribuídos pelo fundo, reinvestidos na data-ex (o DY ao lado mostra só os rendimentos).',
  rentabilidadePassada: 'Rentabilidade passada não é garantia de resultados futuros.',
  /** nome acessível de cada célula ('12 meses: +4,6%') */
  ariaCelula: '{campo}: {valor}',
} as const;
