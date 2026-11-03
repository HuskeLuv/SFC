/**
 * Tipos e rótulos do painel de CS (ticket 86e3vmyrc). Sem Prisma: pode ser
 * importado pelos componentes do cliente. A lógica e o SQL ficam em ./cs.ts.
 */
export const AREAS_CS = [
  'carteira',
  'fluxo',
  'orcamento',
  'planejamento',
  'assistente',
  'conexoes',
] as const;
export type AreaCs = (typeof AREAS_CS)[number];

export const ROTULO_AREA_CS: Record<AreaCs, string> = {
  carteira: 'Carteira',
  fluxo: 'Fluxo de Caixa',
  orcamento: 'Orçamento',
  planejamento: 'Planejamento',
  assistente: 'Assistente',
  conexoes: 'Conexões',
};

export type AcaoAtivacao = 'carteira' | 'fluxo' | 'conexao';

export const ROTULO_ACAO_ATIVACAO: Record<AcaoAtivacao, string> = {
  carteira: 'Primeiro ativo na Carteira',
  fluxo: 'Primeiro lançamento no Fluxo',
  conexao: 'Primeiro banco conectado',
};

/** Faixas de inatividade destacadas na tela (dias sem login nem uso). */
export type FaixaAtividade = 'ativo' | 'inativo7' | 'inativo30' | 'nunca';

export interface ClienteCs {
  id: string;
  nome: string;
  email: string;
  papel: 'user' | 'consultant';
  cadastroEm: string;
  /** Nível de acesso (0 = gratuito). Não há tabela de assinatura ainda. */
  nivelAcesso: number;
  ultimoLogin: string | null;
  /** Maior data entre as áreas abaixo. */
  ultimaAtividade: string | null;
  /** Maior entre último login e última atividade. */
  ultimoAcesso: string | null;
  diasSemAcesso: number | null;
  faixa: FaixaAtividade;
  openFinanceConectado: boolean;
  ativosCarteira: number;
  usaFluxo: boolean;
  usaOrcamento: boolean;
  mensagensAssistenteMes: number;
  ultimoUsoPorArea: Record<AreaCs, string | null>;
  ativacao: {
    em: string | null;
    acao: AcaoAtivacao | null;
    diasAteAtivar: number | null;
  };
}

export interface PainelCs {
  geradoEm: string;
  inicioMes: string;
  clientes: ClienteCs[];
  ativacao: {
    total: number;
    ativados: number;
    pctAtivados: number;
    /** Mediana de dias entre cadastro e ativação (só ativados). */
    medianaDias: number | null;
    mediaDias: number | null;
    ativados7d: number;
    porAcao: Record<AcaoAtivacao, number>;
  };
  engajamento: {
    ativos7d: number;
    inativos7a30: number;
    inativos30: number;
    nuncaAcessaram: number;
    porArea: { area: AreaCs; usuarios30d: number; usuarios7d: number }[];
  };
  /**
   * CSAT: a pesquisa de satisfação está em construção (outra frente). Enquanto
   * a tabela não existir no banco, vem null e a aba explica.
   */
  csat: null;
}
