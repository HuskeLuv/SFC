/**
 * Dados da conta SOB DEMANDA (21/09/2026). Antes o prompt levava o contexto
 * inteiro do usuário (4–10 mil tokens) em toda conversa, gravado no cache —
 * caro para o uso previsto, de várias conversas curtas. Agora vai:
 *
 *   - um NÚCLEO pequeno (data, nome, totais e distribuição da carteira,
 *     retrato do mês) + a lista das seções que existem na conta;
 *   - as seções que a INTENÇÃO da pergunta pede (e das últimas mensagens,
 *     para perguntas de continuação);
 *   - o resto o modelo busca com a ferramenta `consultar_dados`.
 *
 * As seções mantêm o MESMO caminho do contexto completo (carteira.posicoes,
 * fluxoDeCaixa, agendaProximos60Dias…), então as regras do prompt continuam
 * valendo sem mudar os nomes.
 */
import type { LlmTool } from './llm';
import type { Intencao } from './intencao';

type Json = Record<string, unknown>;

/** Seção → caminhos no contexto completo (`montarContexto`). */
export const SECOES = {
  posicoes: {
    descricao:
      'ativos da carteira por classe (valor, rentabilidade; renda fixa com emissor, taxa e ' +
      'VENCIMENTO: CDB, debêntures, Tesouro) e ativos planejados',
    caminhos: ['carteira.posicoes', 'carteira.ativosPlanejadosSemPosicao'],
  },
  alocacao: {
    descricao: 'alocação alvo × atual por classe e cobertura do FGC',
    caminhos: ['carteira.alocacaoAlvoPorClasse', 'carteira.coberturaFgc'],
  },
  rentabilidade: {
    descricao: 'TWR/MWR por janela, evolução mensal do patrimônio e meta de patrimônio',
    caminhos: [
      'carteira.rentabilidade',
      'carteira.evolucaoPatrimonioPorMes',
      'carteira.metaPatrimonioStatus',
    ],
  },
  proventos: {
    descricao: 'dividendos, JCP e rendimentos recebidos e a receber',
    caminhos: ['carteira.proventosRecebidos'],
  },
  agenda: {
    descricao: 'o que vence nos próximos 60 dias (parcelas, renda fixa, proventos, IR, eventos)',
    caminhos: ['agendaProximos60Dias'],
  },
  fluxo: {
    descricao: 'fluxo de caixa do ano: linhas com valor e total de cada grupo por mês',
    caminhos: ['fluxoDeCaixa'],
  },
  linhasDoFluxo: {
    descricao: 'catálogo completo de linhas do fluxo de caixa por grupo (para propor_lancamento)',
    caminhos: ['linhasDoFluxo'],
  },
  orcamento: {
    descricao: 'orçamento: meta mensal × real do mês por categoria',
    caminhos: ['orcamento'],
  },
  dividas: {
    descricao: 'dívidas com saldo devedor, próxima parcela e prazo restante',
    caminhos: ['dividas'],
  },
  saude: {
    descricao: 'indicadores da saúde financeira (reserva, poupança, endividamento) e tendências',
    caminhos: ['saudeFinanceira'],
  },
  objetivos: {
    descricao: 'objetivos/sonhos com progresso e o plano de aposentadoria',
    caminhos: ['objetivos', 'aposentadoria'],
  },
} as const;

export type Secao = keyof typeof SECOES;
export const SECOES_KEYS = Object.keys(SECOES) as Secao[];

/** O que entra junto com a pergunta, por intenção (o resto vem por consultar_dados). */
const SECOES_DA_INTENCAO: Partial<Record<Intencao, Secao[]>> = {
  gasto_categoria: ['fluxo'],
  maior_despesa: ['fluxo'],
  receitas: ['fluxo'],
  sobra_mes: ['fluxo'],
  orcamento: ['orcamento', 'fluxo'],
  carteira: ['posicoes', 'alocacao'],
  rentabilidade: ['rentabilidade', 'posicoes'],
  proventos: ['proventos'],
  // Vencimento de título (debênture, CDB) está na posição, não só na agenda.
  vencimentos: ['agenda', 'dividas', 'posicoes'],
  dividas: ['dividas'],
  saude_financeira: ['saude'],
  objetivos: ['objetivos', 'rentabilidade'],
  lancamento: ['linhasDoFluxo'],
};

export function secoesDaIntencao(intencoes: Intencao[]): Secao[] {
  const set = new Set<Secao>();
  for (const i of intencoes) for (const s of SECOES_DA_INTENCAO[i] ?? []) set.add(s);
  return SECOES_KEYS.filter((s) => set.has(s));
}

const vazio = (v: unknown): boolean =>
  v === undefined ||
  v === null ||
  (Array.isArray(v) && v.length === 0) ||
  (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as Json).length === 0);

function ler(obj: Json, caminho: string): unknown {
  return caminho.split('.').reduce<unknown>((acc, k) => (acc as Json | undefined)?.[k], obj);
}

function gravar(obj: Json, caminho: string, valor: unknown): void {
  const partes = caminho.split('.');
  let alvo = obj;
  for (const k of partes.slice(0, -1)) {
    alvo[k] = (alvo[k] as Json | undefined) ?? {};
    alvo = alvo[k] as Json;
  }
  alvo[partes[partes.length - 1]] = valor;
}

/** Seções com algum dado na conta (as outras nem aparecem para o modelo). */
export function secoesComDados(ctx: Json): Secao[] {
  return SECOES_KEYS.filter((s) => SECOES[s].caminhos.some((c) => !vazio(ler(ctx, c))));
}

/** Copia as seções pedidas do contexto completo, nos mesmos caminhos. */
export function extrairSecoes(ctx: Json, secoes: readonly Secao[]): Json {
  const out: Json = {};
  for (const s of secoes) {
    for (const c of SECOES[s].caminhos) {
      const v = ler(ctx, c);
      if (!vazio(v)) gravar(out, c, v);
    }
  }
  return out;
}

const CAMPOS_NUCLEO_CARTEIRA = [
  'saldoBruto',
  'valorAplicado',
  'rentabilidadePercentual',
  'caixaParaInvestir',
  'metaPatrimonio',
  'totais',
  'distribuicao',
];

/**
 * Núcleo + seções da intenção. `secoesDisponiveis` diz ao modelo o que mais
 * existe na conta (e ainda não veio) para ele pedir com consultar_dados.
 */
export function contextoRecortado(ctx: Json, secoes: readonly Secao[]): Json {
  const carteira = (ctx.carteira ?? {}) as Json;
  const nucleo: Json = {
    hoje: ctx.hoje,
    mesAtual: ctx.mesAtual,
    ano: ctx.ano,
    ...(ctx.usuario ? { usuario: ctx.usuario } : {}),
    carteira: Object.fromEntries(
      CAMPOS_NUCLEO_CARTEIRA.filter((k) => carteira[k] !== undefined).map((k) => [k, carteira[k]]),
    ),
    mesAtualResumo: ctx.mesAtualResumo ?? null,
    anoResumo: ctx.anoResumo ?? null,
  };
  const comDados = secoesComDados(ctx);
  const incluidas = secoes.filter((s) => comDados.includes(s));
  const extra = extrairSecoes(ctx, incluidas);
  const faltam = comDados.filter((s) => !incluidas.includes(s));
  return {
    ...nucleo,
    ...extra,
    carteira: { ...(nucleo.carteira as Json), ...((extra.carteira as Json | undefined) ?? {}) },
    ...(faltam.length > 0
      ? {
          secoesDisponiveis: Object.fromEntries(faltam.map((s) => [s, SECOES[s].descricao])),
        }
      : {}),
  };
}

export const TOOL_CONSULTAR_DADOS: LlmTool = {
  name: 'consultar_dados',
  description:
    'Busca seções dos dados da conta do usuário que não vieram em DADOS DO USUÁRIO ' +
    '(a lista secoesDisponiveis diz quais existem). Chame ANTES de responder quando a pergunta ' +
    'precisar delas; peça todas as seções necessárias numa chamada só.',
  inputSchema: {
    type: 'object',
    properties: {
      secoes: {
        type: 'array',
        items: { type: 'string', enum: SECOES_KEYS },
        description: 'Seções a buscar.',
      },
    },
    required: ['secoes'],
  },
};

/** Resultado da ferramenta: as seções pedidas (válidas) em JSON. */
export function resultadoConsulta(ctx: Json, input: Record<string, unknown>): string {
  const pedidas = Array.isArray(input.secoes)
    ? (input.secoes as unknown[]).filter((s): s is Secao => SECOES_KEYS.includes(s as Secao))
    : [];
  if (pedidas.length === 0) {
    return JSON.stringify({ erro: `Informe secoes entre: ${SECOES_KEYS.join(', ')}.` });
  }
  const dados = extrairSecoes(ctx, pedidas);
  return JSON.stringify(Object.keys(dados).length > 0 ? dados : { vazio: pedidas });
}
