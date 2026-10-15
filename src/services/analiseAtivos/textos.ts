/**
 * Textos centrais da Análise de Ativos (compliance, spec §9 + regra 9 do relatório da Fase A).
 *
 * Frases factuais "número + referência", sem adjetivo de julgamento nem verbo de ação. O teste de
 * varredura (__tests__/textos.test.ts) roda `encontrarPalavrasProibidas` em todas as folhas de
 * TEXTOS_ANALISE, exceto nas chaves de EXCECOES_TEXTO_FIXO (o rodapé do Valuation, que a spec obriga
 * e cita "preço justo" para negá-lo). v2.4 (F): saem da superfície os textos do indicador antigo
 * (Índice, semáforo, comunidade) e o rodapé legal antigo — o aviso legal da área é o
 * RODAPE_LEGAL_V2 de textosLiterais.ts. As frases são montadas na renderização com `formatarTexto`.
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
  motivosNaoSeAplica: {
    financeira: 'não se aplica a bancos, seguradoras e holdings financeiras',
    fof: 'não se aplica a fundo de fundos',
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
  valuation: {
    cenarios: 'Meus cenários',
    multiplos: 'Múltiplos',
    vsCotacao: 'vs. cotação',
    comMargem: 'Com sua margem',
    suaPosicao: 'Sua posição',
    semResultado: '—',
  },
  rodapeValuation:
    "Os cenários usam as premissas que você definiu. O My Finance não calcula 'preço justo' nem preço-alvo: o resultado é uma conta com os seus parâmetros, serve para estudo e não constitui recomendação de compra ou venda.",
} as const;

/** Chaves de TEXTOS_ANALISE fora da varredura de palavras proibidas (texto fixo exigido pela spec). */
export const EXCECOES_TEXTO_FIXO = ['rodapeValuation'] as const;

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

/** Número no padrão BR para as frases (reexport para quem monta textos). */
export { formatarNumeroBR };
