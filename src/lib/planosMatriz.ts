/**
 * Textos da matriz dos planos (cartões e comparativo de /planos e os 3 itens do cadeado).
 *
 * Fora de src/lib/planos.ts de propósito: planos.ts entra no bundle de todas as páginas (menu,
 * usePlano e relatório financeiro) e estes textos citam PGBL e recursos do Advanced. O e2e do
 * relatório (modo demonstração Basic) exige que nenhum JS baixado traga esses termos; aqui eles só
 * entram nos chunks de /planos e do cadeado.
 */
import { LIMITES_PLANO, type Plano } from '@/lib/planos';

/** Célula da matriz: true = incluído, false = não incluído, texto = valor (ex.: '3'). */
export type CelulaMatriz = boolean | string;

export interface LinhaMatriz {
  recurso: string;
  basic: CelulaMatriz;
  pro: CelulaMatriz;
  adv: CelulaMatriz;
}

export interface CartaoPlano {
  /** Para quem é o plano (subtítulo do cartão). */
  para: string;
  /** 'Tudo do Basic, mais:' (ausente no Basic). */
  base?: string;
  /** Itens do cartão em /planos; os 3 primeiros vão para o cadeado. */
  itens: readonly string[];
}

/**
 * Textos de /planos (cartões e comparativo) e dos cadeados (3 primeiros itens do plano), iguais
 * ao protótipo aprovado (docs/assinaturas/prototipo-assinaturas.html). Só exibição: quem decide o
 * acesso é ACESSO_ROTAS (src/services/planos/acessoRotas.ts) e ACESSO_BLOCOS.
 */
export const MATRIZ_EXIBICAO: {
  cartoes: Record<Plano, CartaoPlano>;
  grupos: ReadonlyArray<{ grupo: string; linhas: readonly LinhaMatriz[] }>;
} = {
  cartoes: {
    basic: {
      para: 'Para organizar o dia a dia: entradas, gastos e dívidas.',
      itens: [
        'Fluxo de caixa e orçamento completos',
        'Dívidas e agenda de contas',
        'Importação da planilha de fluxo de caixa',
        `${LIMITES_PLANO.conexoes.basic} conexão bancária (Open Finance)`,
        `Assistente de IA: ${LIMITES_PLANO.ia.basic} mensagens por mês`,
        'Relatório financeiro: orçamento e dívidas',
      ],
    },
    pro: {
      para: 'Para quem investe e quer ver a carteira e os planos num lugar só.',
      base: 'Tudo do Basic, mais:',
      itens: [
        'Carteira completa: ações, FIIs, renda fixa, Tesouro, cripto e imóveis',
        'Rentabilidade da carteira e meta',
        'Planejamento da independência financeira e Meus Sonhos',
        'Carteira nos EUA (ações e REITs)',
        'Análise de Ativos completa: Quadro, página do ativo, comparador e cenários',
        'Importar investimentos do Open Finance',
        `${LIMITES_PLANO.conexoes.pro} conexões bancárias`,
        `Assistente de IA: ${LIMITES_PLANO.ia.pro} mensagens por mês`,
        'Relatórios da carteira e das movimentações',
      ],
    },
    adv: {
      para: 'Para acompanhar cada detalhe e cuidar do imposto de renda.',
      base: 'Tudo do Pro, mais:',
      itens: [
        'Análise da carteira: rentabilidade comparável (TWR), proventos, risco x retorno e cobertura do FGC',
        'Imposto de renda: mensal de ações e FIIs, exterior, cripto e PGBL',
        'Saúde Financeira',
        `${LIMITES_PLANO.conexoes.adv} conexões bancárias`,
        `Assistente de IA: ${LIMITES_PLANO.ia.adv} mensagens por mês`,
        'Relatório financeiro completo',
      ],
    },
  },
  grupos: [
    {
      grupo: 'Organização',
      linhas: [
        { recurso: 'Fluxo de caixa e orçamento', basic: true, pro: true, adv: true },
        { recurso: 'Dívidas e agenda', basic: true, pro: true, adv: true },
        { recurso: 'Importar planilha de fluxo de caixa', basic: true, pro: true, adv: true },
        {
          recurso: 'Conexões bancárias (Open Finance)',
          basic: String(LIMITES_PLANO.conexoes.basic),
          pro: String(LIMITES_PLANO.conexoes.pro),
          adv: String(LIMITES_PLANO.conexoes.adv),
        },
        {
          recurso: 'Assistente de IA (mensagens por mês)',
          basic: String(LIMITES_PLANO.ia.basic),
          pro: String(LIMITES_PLANO.ia.pro),
          adv: String(LIMITES_PLANO.ia.adv),
        },
      ],
    },
    {
      grupo: 'Investimentos',
      linhas: [
        {
          recurso: 'Carteira: ações, FIIs, renda fixa, Tesouro, cripto, imóveis',
          basic: false,
          pro: true,
          adv: true,
        },
        { recurso: 'Carteira nos EUA', basic: false, pro: true, adv: true },
        { recurso: 'Rentabilidade da carteira e meta', basic: false, pro: true, adv: true },
        { recurso: 'Importar investimentos do Open Finance', basic: false, pro: true, adv: true },
        {
          recurso: 'Análise: TWR, proventos, risco x retorno, sensibilidade, FGC',
          basic: false,
          pro: false,
          adv: true,
        },
      ],
    },
    {
      grupo: 'Planejamento e impostos',
      linhas: [
        { recurso: 'Independência financeira e Meus Sonhos', basic: false, pro: true, adv: true },
        { recurso: 'Saúde Financeira', basic: false, pro: false, adv: true },
        { recurso: 'Imposto de renda e PGBL', basic: false, pro: false, adv: true },
      ],
    },
    {
      grupo: 'Análise de Ativos',
      linhas: [
        { recurso: 'Quadro, busca e página do ativo', basic: false, pro: true, adv: true },
        {
          recurso: 'Comparador, cenários, alertas, salvos e PDF',
          basic: false,
          pro: true,
          adv: true,
        },
      ],
    },
    {
      grupo: 'Relatórios',
      linhas: [
        {
          recurso: 'Relatório financeiro',
          basic: 'Orçamento e dívidas',
          pro: '+ carteira, planejamento e sonhos',
          adv: 'Completo',
        },
        { recurso: 'Carteira e movimentações', basic: false, pro: true, adv: true },
      ],
    },
  ],
};
