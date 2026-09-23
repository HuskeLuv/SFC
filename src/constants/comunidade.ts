/**
 * Comunidade (pedido do Pedro, 23/09/2026) — constantes compartilhadas entre
 * API e UI: trava de acesso, categorias, termo de uso e limites anti-spam.
 */

import { ACCESS_LEVELS } from '@/utils/accessLevel';

/**
 * Trava de cargo: nível mínimo (`User.accessLevel`) para entrar na comunidade.
 * Decisão 23/09: aberta a todos por enquanto — subir para ASSINANTE quando os
 * planos pagos existirem, sem mexer em rota nenhuma.
 */
export const COMUNIDADE_REQUIRED_LEVEL: number = ACCESS_LEVELS.GRATUITO;

/**
 * Versão do termo de uso da comunidade. v1 é PROVISÓRIO até a revisão dos
 * advogados — mudar a versão obriga todo membro a aceitar de novo.
 */
export const COMUNIDADE_TERMO_VERSAO = '1.0';
export const COMUNIDADE_TERMO_DOCUMENTO = 'community-terms';

/** Quem pode publicar numa categoria além dos membros comuns. */
export type RestricaoCategoria = 'todos' | 'consultores' | 'equipe';

export interface CategoriaComunidade {
  chave: string;
  nome: string;
  descricao: string;
  restricao: RestricaoCategoria;
}

export const CATEGORIAS_COMUNIDADE: readonly CategoriaComunidade[] = [
  {
    chave: 'geral',
    nome: 'Geral',
    descricao: 'Apresentações e conversas sobre a jornada',
    restricao: 'todos',
  },
  {
    chave: 'dividas',
    nome: 'Saindo das dívidas',
    descricao: 'Estratégias e apoio para quitar dívidas',
    restricao: 'todos',
  },
  {
    chave: 'orcamento',
    nome: 'Orçamento e fluxo de caixa',
    descricao: 'Planilha, controle de gastos e metas',
    restricao: 'todos',
  },
  {
    chave: 'investimentos',
    nome: 'Investimentos',
    descricao: 'Experiências e aprendizados com investimentos',
    restricao: 'todos',
  },
  {
    chave: 'conquistas',
    nome: 'Conquistas',
    descricao: 'Compartilhe suas vitórias',
    restricao: 'todos',
  },
  {
    chave: 'duvidas',
    nome: 'Dúvidas',
    descricao: 'Pergunte à comunidade',
    restricao: 'todos',
  },
  {
    chave: 'servicos',
    nome: 'Serviços de consultores',
    descricao: 'Consultores apresentam seus serviços',
    restricao: 'consultores',
  },
  {
    chave: 'avisos',
    nome: 'Avisos da equipe',
    descricao: 'Comunicados da equipe My Finance',
    restricao: 'equipe',
  },
] as const;

export const CHAVES_CATEGORIAS = CATEGORIAS_COMUNIDADE.map((c) => c.chave) as [string, ...string[]];

export const categoriaPorChave = (chave: string): CategoriaComunidade | undefined =>
  CATEGORIAS_COMUNIDADE.find((c) => c.chave === chave);

export const MOTIVOS_DENUNCIA = {
  spam: 'Spam ou propaganda indevida',
  ofensivo: 'Ofensivo, discriminatório ou assédio',
  golpe: 'Golpe, fraude ou promessa de ganho garantido',
  dados: 'Expõe dados pessoais',
  outro: 'Outro motivo',
} as const;

export type MotivoDenuncia = keyof typeof MOTIVOS_DENUNCIA;

export const COMUNIDADE_LIMITES = {
  postMaxChars: 5000,
  comentarioMaxChars: 1000,
  bioMaxChars: 280,
  detalheDenunciaMaxChars: 500,
  postsPorHora: 10,
  comentariosPorHora: 60,
  denunciasPorDia: 20,
  feedPageSize: 20,
  suspensaoMaxDias: 365,
} as const;

/**
 * Texto do termo v1 — PROVISÓRIO, pendente de revisão dos advogados (mesmo
 * regime dos textos do Open Finance). Alterou o sentido? Suba a versão acima.
 */
export const TERMO_COMUNIDADE_ITENS: readonly string[] = [
  'A comunidade é um espaço para trocar experiências entre pessoas que seguem a metodologia. O que você publica fica visível para todos os membros, com o nome e a foto da sua conta.',
  'Não publique dados pessoais seus ou de outras pessoas (CPF, contas, endereços, extratos, telefones).',
  'Nada do que é publicado aqui é recomendação de investimento. As decisões financeiras são suas; na dúvida, procure um profissional certificado.',
  'É proibido: ofensas, discriminação, assédio, spam, golpes, pirâmides, promessas de ganho garantido e pedidos de dinheiro.',
  'Consultores podem oferecer serviços somente na categoria "Serviços de consultores".',
  'A equipe My Finance pode remover conteúdos e suspender participantes que descumprirem estas regras. Você pode denunciar qualquer publicação ou comentário.',
  'Registramos data, hora e endereço IP das publicações, como exige o Marco Civil da Internet (Lei 12.965/2014).',
];
