/**
 * Textos centrais da Análise de Ativos (compliance, spec §9 + regra 9 do relatório da Fase A).
 *
 * Toda frase da área sai daqui: títulos NEUTROS dos critérios e frases factuais "número + referência",
 * sem adjetivo de julgamento nem verbo de ação. O teste de varredura (__tests__/textos.test.ts) roda
 * `encontrarPalavrasProibidas` em todas as folhas de TEXTOS_ANALISE, exceto nas chaves de
 * EXCECOES_TEXTO_FIXO (o rodapé legal e o do Valuation, que a spec obriga e citam "preço justo" para
 * negá-lo). O Índice MF nunca é chamado de "nota" (badge: "Índice acima da comunidade", decisão 24).
 *
 * Os scores gravam só códigos e números (AssetScore.checks); as frases são montadas na renderização
 * com `formatarTexto`, para que a troca de linguagem (ex.: ao contratar um CNPI) seja num lugar só.
 */
import {
  formatarComSinalBR,
  formatarNumeroBR,
} from '@/services/analiseAtivos/regras/valuation/arredondamento';
import type { StatusBarra } from '@/services/analiseAtivos/regras/valuation/barraPosicao';

export {
  PALAVRAS_PROIBIDAS,
  encontrarPalavrasProibidas,
} from '@/services/analiseAtivos/regras/comum/linguagem';

export const TEXTOS_ANALISE = {
  indice: {
    nome: 'Índice MF',
    descricao: 'indicador quantitativo de fórmula pública',
    formula:
      'Índice MF = 0,35 × C_lucro + 0,20 × C_dívida + 0,20 × C_rent + 0,15 × C_div + 0,10 × C_preço',
    leituraSemaforo: '{atendidos} de {aplicaveis} critérios atendidos',
    foraDoIndice: 'fora do Índice MF nesta fase',
    componentes: {
      lucro: 'Consistência do lucro',
      divida: 'Endividamento',
      rent: 'Rentabilidade',
      div: 'Proventos',
      preco: 'Preço',
    },
  },
  status: {
    atende: 'Atende',
    parcial: 'Parcial',
    nao_atende: 'Não atende',
    nao_se_aplica: 'Não se aplica',
    sem_dado: 'Sem dado',
  },
  criterios: {
    lucros_consecutivos: 'Lucros consecutivos',
    endividamento: 'Endividamento',
    rentabilidade: 'Rentabilidade (ROE)',
    preco_historico: 'P/L vs. média de 10 anos',
    dividendos: 'Dividendos',
    renda_recorrente: 'Renda recorrente',
    vacancia: 'Vacância física',
    diversificacao_imoveis: 'Nº de imóveis',
    obrigacoes_pl: 'Obrigações/PL',
    preco_vp: 'Preço vs. VP',
    concentracao_cri: 'Concentração do maior CRI',
    inadimplencia: 'Inadimplência',
    diversificacao_cri: 'Nº de CRIs',
  },
  frases: {
    lucros_consecutivos:
      '{valor} anos seguidos de lucro; referência do critério: {referencia} anos',
    endividamento: 'Dívida líquida/EBITDA de {valor}×; referência do critério: até {referencia}×',
    endividamento_caixa_liquido: 'Caixa líquido (dívida líquida menor ou igual a zero)',
    endividamento_ebitda_negativo: 'EBITDA menor ou igual a zero com dívida líquida positiva',
    rentabilidade: 'ROE de {valor}%; referência do critério: {referencia}%',
    rentabilidade_pl_negativo: 'Patrimônio líquido menor ou igual a zero',
    preco_historico:
      'P/L {valor}% em relação à média de 10 anos; referência do critério: até {referencia}%',
    preco_historico_prejuizo: 'P/L não calculado: prejuízo no último exercício',
    dividendos: 'Dividend yield de 12 meses de {valor}%; referência do critério: {referencia}%',
    renda_recorrente:
      'Dividend yield de 12 meses de {valor}%; referência do critério: {referencia}%',
    vacancia: 'Vacância física de {valor}% (fonte CVM); referência do critério: até {referencia}%',
    diversificacao_imoveis: '{valor} imóveis (fonte CVM); referência do critério: {referencia}',
    obrigacoes_pl: 'Obrigações/PL de {valor}%; referência do critério: até {referencia}%',
    preco_vp: 'P/VP de {valor}; referência do critério: {referencia}',
    concentracao_cri:
      'Maior CRI = {valor}% da carteira de CRIs; referência do critério: até {referencia}%',
    inadimplencia: 'Inadimplência de {valor}%; referência do critério: até {referencia}%',
    diversificacao_cri: '{valor} CRIs distintos; referência do critério: {referencia}',
    sem_dado: 'Sem dado estruturado disponível para este critério',
    nao_se_aplica: 'Critério fora da conta para este ativo',
  },
  motivosNaoSeAplica: {
    financeira: 'não se aplica a bancos, seguradoras e holdings financeiras',
    fof: 'fundo de fundos fica fora do Índice MF nesta fase',
    receita_nao_positiva: 'receita menor ou igual a zero',
    receita_menor_que_lucro: 'receita menor que o lucro (holding)',
    base_nao_positiva: 'base menor ou igual a zero',
    sem_fonte_estruturada: 'sem fonte estruturada',
    criterio_desligado: 'critério desligado até a validação da fonte',
    papel_sem_imoveis: 'fundo de papel não tem imóveis',
    fora_do_escopo: 'fora do escopo desta fase',
  },
  selos: {
    dadosIncompletos: 'dados incompletos',
    criteriosProvisorios: 'critérios provisórios',
    fonteCvm: 'fonte CVM · pode diferir do relatório do gestor',
    dataEstimada: 'data estimada',
    padraoContabil: 'padrão contábil: {padrao}',
    payoutExtraordinario: 'inclui extraordinários ou lucro negativo',
    baixaLiquidez: 'baixa liquidez',
    proventosEmRevisao: 'proventos em conferência',
  },
  barra: {
    variacaoPct: '{valor}% vs. média {n}a',
    variacaoPp: '{valor} p.p. vs. média {n}a',
    acima: 'acima da média {n}a',
    abaixo: 'abaixo da média {n}a',
    naMedia: 'na média de {n} anos',
    maior: 'maior em {n} anos',
    menor: 'menor em {n} anos',
    oculta: 'histórico com menos de {min} anos',
  },
  comunidade: {
    convergem: 'convergem',
    comunidadeAcima: 'comunidade acima do Índice',
    indiceAcima: 'Índice acima da comunidade',
    notaComunidade: 'média das opiniões de usuários',
  },
  valuation: {
    cenarios: 'Meus cenários',
    multiplos: 'Múltiplos',
    vsCotacao: 'vs. cotação',
    comMargem: 'Com sua margem',
    suaPosicao: 'Sua posição',
    semResultado: '—',
  },
  rodapeLegal:
    'O My Finance é uma ferramenta de organização financeira e de dados. O Índice MF é um indicador quantitativo de fórmula pública; o ranking, as notas e as teses são opiniões pessoais de usuários. Nada nesta área constitui análise, consultoria ou recomendação de investimento (Resolução CVM 20/2021). Rentabilidade passada não garante resultados futuros. Decisões de investimento são de responsabilidade exclusiva do usuário.',
  rodapeValuation:
    "Os cenários usam as premissas que você definiu. O My Finance não calcula 'preço justo' nem preço-alvo: o resultado é uma conta com os seus parâmetros, serve para estudo e não constitui recomendação de compra ou venda.",
} as const;

/** Chaves de TEXTOS_ANALISE fora da varredura de palavras proibidas (texto fixo exigido pela spec). */
export const EXCECOES_TEXTO_FIXO = ['rodapeLegal', 'rodapeValuation'] as const;

/** Substitui {chave} pelos valores; placeholder sem valor fica como está (o teste pega). */
export function formatarTexto(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) =>
    Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m,
  );
}

/** Frase do status da barra de posição ("+40% vs. média 10a", "abaixo da média 10a · menor em 10 anos"). */
export function textoStatusBarra(status: StatusBarra, nPontos: number): string {
  const t = TEXTOS_ANALISE.barra;
  const n = { n: nPontos };
  let principal: string;
  switch (status.tipo) {
    case 'variacao_pct':
      principal = formatarTexto(t.variacaoPct, {
        ...n,
        valor: formatarComSinalBR(status.valor, 0),
      });
      break;
    case 'variacao_pp':
      principal = formatarTexto(t.variacaoPp, { ...n, valor: formatarComSinalBR(status.valor, 1) });
      break;
    case 'acima':
      principal = formatarTexto(t.acima, n);
      break;
    case 'abaixo':
      principal = formatarTexto(t.abaixo, n);
      break;
    default:
      principal = formatarTexto(t.naMedia, n);
  }
  if (status.extremo) {
    principal += ` · ${formatarTexto(status.extremo === 'maior' ? t.maior : t.menor, n)}`;
  }
  return principal;
}

/** Leitura do semáforo ("3 de 4 critérios atendidos"). */
export function textoLeituraSemaforo(atendidos: number, aplicaveis: number): string {
  return formatarTexto(TEXTOS_ANALISE.indice.leituraSemaforo, { atendidos, aplicaveis });
}

/** Número no padrão BR para as frases (reexport para quem monta textos). */
export { formatarNumeroBR };
