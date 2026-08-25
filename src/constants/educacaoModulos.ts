/**
 * Trilha "Educação Financeira do Zero" (Escolhi Ser Rico) — módulos na ordem
 * do layout de referência do Pedro (ticket 25/08/2026). Fonte única pro seed
 * (banco novo) e pro script de sincronização em prod
 * (`scripts/educacao/sync-modulos-trilha.ts`). Capas em public/educacao/modulos.
 */

export const CURSO_ESR_SLUG = 'educacao-financeira-do-zero';

export interface ModuloTrilhaSeed {
  title: string;
  description: string;
  coverUrl: string;
}

export const MODULOS_TRILHA_ESR: ModuloTrilhaSeed[] = [
  {
    title: 'Boas-vindas',
    description:
      'Comece por aqui: como funciona o método e como aproveitar o My Finance ao máximo.',
    coverUrl: '/educacao/modulos/01-boas-vindas.jpg',
  },
  {
    title: 'Como Preencher a Planilha',
    description:
      'O passo a passo para dominar a ferramenta que organiza toda a sua vida financeira.',
    coverUrl: '/educacao/modulos/02-como-preencher-a-planilha.jpg',
  },
  {
    title: 'Zerando Dívidas',
    description: 'A estratégia para sair do vermelho e limpar seu nome de uma vez por todas.',
    coverUrl: '/educacao/modulos/03-zerando-dividas.jpg',
  },
  {
    title: 'Orçamento',
    description: 'Descubra para onde seu dinheiro vai e assuma o controle de cada real.',
    coverUrl: '/educacao/modulos/04-orcamento.jpg',
  },
  {
    title: 'Planejamento Financeiro',
    description: 'Transforme metas em plano: curto, médio e longo prazo com método.',
    coverUrl: '/educacao/modulos/05-planejamento-financeiro.jpg',
  },
  {
    title: 'Saúde Financeira',
    description: 'Os indicadores que mostram se sua vida financeira está evoluindo de verdade.',
    coverUrl: '/educacao/modulos/06-saude-financeira.jpg',
  },
  {
    title: 'Renda Fixa',
    description: 'CDB, Tesouro e LCI/LCA: faça seu dinheiro render com segurança.',
    coverUrl: '/educacao/modulos/07-renda-fixa.jpg',
  },
  {
    title: 'Ações',
    description: 'Os fundamentos para investir em empresas e construir patrimônio na bolsa.',
    coverUrl: '/educacao/modulos/08-acoes.jpg',
  },
  {
    title: 'Fundos Imobiliários',
    description: 'Receba aluguéis todo mês sem precisar comprar um imóvel.',
    coverUrl: '/educacao/modulos/09-fundos-imobiliarios.jpg',
  },
];
