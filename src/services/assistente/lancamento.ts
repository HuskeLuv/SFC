/**
 * Ação de escrita do assistente: registrar um gasto/receita numa célula do
 * fluxo de caixa mensal — ou, quando o gasto se repete (aluguel, escola,
 * faculdade…), em todos os meses do ano da planilha. Fluxo obrigatório
 * (spec v1.1 §5):
 *   modelo chama a ferramenta → servidor monta a PROPOSTA (assinada, expira
 *   em 10 min) → app mostra o cartão → usuário confirma → servidor grava.
 * A IA nunca grava direto.
 */
import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import type { AuthWithActingResult } from '@/utils/auth';
import { getMergedCashflowGroups } from '@/services/cashflow/getCashflowTree';
import {
  MESES_LONGOS,
  aplicarLancamento,
  celulasDoLancamento,
  descreverPeriodo,
  ehRecorrente,
  posProcessarLancamento,
  type CelulaAplicada,
  type CelulaLancamento,
  type LancamentoResolvido,
  type ModoLancamento,
  type ResultadoAplicacao,
} from '@/services/cashflow/lancamentoFluxo';
import type { CashflowGroup } from '@/types/cashflow';
import { abrirPayload, assinarPayload } from './assinatura';
import { listarLinhasEditaveis, round, type LinhaEditavel } from './contexto';

// A gravação (e os tipos dela) mora em services/cashflow/lancamentoFluxo, compartilhada com o
// lançamento rápido do celular. Reexportados para quem já importava daqui.
export { MESES_LONGOS, descreverPeriodo, ehRecorrente };
export type { CelulaAplicada, ModoLancamento, ResultadoAplicacao };

/**
 * Quantos lançamentos uma mensagem pode propor (uma chamada de ferramenta por
 * item). Cobre o primeiro preenchimento da planilha ("plano de saúde 1.500,
 * medicamentos 500, internet 300…") sem deixar o modelo enumerar sem fim.
 */
export const MAX_LANCAMENTOS_POR_MENSAGEM = 20;

export interface LancamentoInput {
  tipo: 'despesa' | 'entrada';
  linha: string;
  /** Grupo/seção da linha (ex.: "Transporte"), para desempatar nomes repetidos como "Outros". */
  grupo?: string;
  /** Valor de UM mês. */
  valor: number;
  mes?: number;
  ano?: number;
  descricao?: string;
  /**
   * Gasto/receita que se repete todo mês (aluguel, escola, salário…): preenche o
   * ano inteiro da planilha (janeiro a dezembro) ou o intervalo mesInicio..mesFim.
   */
  recorrente?: boolean;
  mesInicio?: number;
  mesFim?: number;
  /** Padrão: `somar` no lançamento único, `definir` no recorrente. */
  modo?: ModoLancamento;
}

export type CelulaProposta = CelulaLancamento;

/** Lançamento resolvido + o que a proposta assinada carrega a mais. */
export type Proposta = LancamentoResolvido & {
  id: string;
  /** Linha de assistente_mensagens que gerou a proposta (métrica de confirmação). */
  mensagemId: string;
  /** epoch ms */
  expiraEm: number;
};

/** Defaults que vêm do app, não do modelo. */
export interface OpcoesProposta {
  /** Ano que o usuário está vendo na planilha (seletor da sidebar). */
  anoPlanilha?: number;
  hoje?: Date;
}

export type LinhaCandidata = LinhaEditavel;

const PROPOSTA_TTL_MS = 10 * 60 * 1000;

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Linhas editáveis do fluxo: grupos entrada/despesa, sem espelho de sonho/dívida, não ocultas. */
export function linhasEditaveis(groups: CashflowGroup[]): LinhaCandidata[] {
  return listarLinhasEditaveis(groups);
}

/** "gas" é palavra inteira em "gas de cozinha", mas não em "gasolina". */
function contemPalavra(texto: string, parte: string): boolean {
  return ` ${texto} `.includes(` ${parte} `);
}

/**
 * Pontua a semelhança entre o nome pedido e o nome da linha (0 = nada, 100 = igual).
 * O pedido pode ser um pedaço da linha ("mercado" → "Supermercado"), mas a linha só
 * conta como pedaço do pedido em palavra inteira ("gás" NÃO casa com "gasolina").
 */
export function pontuarLinha(pedido: string, linha: string): number {
  const p = normalizar(pedido);
  const l = normalizar(linha);
  if (!p || !l) return 0;
  if (p === l) return 100;
  if (l.startsWith(p)) return 85;
  if (p.startsWith(`${l} `)) return 85;
  if (l.includes(p)) return 70;
  if (contemPalavra(p, l)) return 70;
  const pt = new Set(p.split(' '));
  const lt = l.split(' ');
  const comuns = lt.filter((t) => t.length > 2 && pt.has(t)).length;
  if (comuns === 0) return 0;
  return Math.round((50 * comuns) / Math.max(pt.size, lt.length));
}

/** Último segmento da trilha do grupo ("Despesas > Despesas Fixas > Transporte" → "Transporte"). */
export function grupoCurto(grupoNome: string): string {
  const partes = grupoNome.split(' > ');
  return partes[partes.length - 1] ?? grupoNome;
}

/**
 * O grupo pedido bate com a trilha do grupo da linha? Ignora a raiz ("Despesas"/
 * "Entradas") quando há subgrupos, senão todo grupo de despesa ganharia o bônus.
 */
function grupoBate(grupoPedido: string, grupoNome: string): boolean {
  const g = normalizar(grupoPedido);
  if (!g) return false;
  const segs = grupoNome.split(' > ');
  const relevantes = segs.length > 1 ? segs.slice(1) : segs;
  return relevantes.some((seg) => {
    const n = normalizar(seg);
    return n === g || n.startsWith(g) || g.startsWith(n) || contemPalavra(g, n);
  });
}

const BONUS_GRUPO = 20;
const SCORE_MINIMO = 50;

/**
 * Escolhe a linha: melhor pontuação de nome dentro do tipo; o grupo informado pelo
 * modelo dá bônus (desempata "Outros" repetido em 14 grupos e evita cair na seção
 * errada). Sem linha aceitável, as alternativas vêm do grupo pedido, se houver.
 */
export function resolverLinha(
  groups: CashflowGroup[],
  nome: string,
  tipo: 'despesa' | 'entrada',
  grupo?: string,
): { melhor: LinhaCandidata | null; alternativas: LinhaCandidata[] } {
  const candidatas = linhasEditaveis(groups).filter((c) => c.grupoTipo === tipo);
  const ranqueadas = candidatas
    .map((c) => {
      const nomeScore = pontuarLinha(nome, c.itemNome);
      const noGrupo = grupo ? grupoBate(grupo, c.grupoNome) : false;
      return { c, nomeScore, noGrupo, score: nomeScore + (noGrupo ? BONUS_GRUPO : 0) };
    })
    .filter((x) => x.nomeScore > 0)
    .sort((a, b) => b.score - a.score);
  const melhor = ranqueadas[0] && ranqueadas[0].nomeScore >= SCORE_MINIMO ? ranqueadas[0].c : null;
  let alternativas = ranqueadas
    .slice(0, 5)
    .map((x) => x.c)
    .filter((c) => c.itemId !== melhor?.itemId);
  if (!melhor && grupo) {
    const doGrupo = candidatas.filter((c) => grupoBate(grupo, c.grupoNome));
    if (doGrupo.length > 0) {
      const vistos = new Set(alternativas.map((a) => a.itemId));
      alternativas = [...alternativas, ...doGrupo.filter((c) => !vistos.has(c.itemId))].slice(0, 8);
    }
  }
  return { melhor, alternativas };
}

export type ResultadoProposta =
  | { ok: true; proposta: Proposta; token: string }
  | { ok: false; motivo: string; alternativas: LinhaCandidata[] };

export async function montarProposta(
  userId: string,
  mensagemId: string,
  input: LancamentoInput,
  opcoes: OpcoesProposta = {},
): Promise<ResultadoProposta> {
  const hoje = opcoes.hoje ?? new Date();
  const valor = round(Number(input.valor));
  if (!Number.isFinite(valor) || valor <= 0) {
    return { ok: false, motivo: 'Valor inválido.', alternativas: [] };
  }

  const recorrente =
    Boolean(input.recorrente) || input.mesInicio !== undefined || input.mesFim !== undefined;
  const modo: ModoLancamento = input.modo ?? (recorrente ? 'definir' : 'somar');

  // Ano: o que o usuário disse > o ano aberto na planilha > o ano de hoje. Um
  // lançamento único sem mês ("gastei hoje") é sempre no mês/ano de hoje.
  const anoPlanilha = opcoes.anoPlanilha ?? hoje.getFullYear();
  const usaPlanilha = recorrente || input.mes !== undefined;
  const ano = input.ano ?? (usaPlanilha ? anoPlanilha : hoje.getFullYear());

  let meses: number[];
  if (recorrente) {
    const inicio = input.mesInicio ?? input.mes ?? 0;
    const fim = input.mesFim ?? 11;
    if (inicio > fim) {
      return { ok: false, motivo: 'O mês inicial vem depois do mês final.', alternativas: [] };
    }
    meses = Array.from({ length: fim - inicio + 1 }, (_, i) => inicio + i);
  } else {
    meses = [input.mes ?? hoje.getMonth()];
  }
  if (meses.some((m) => m < 0 || m > 11) || ano < 2000 || ano > 2100) {
    return { ok: false, motivo: 'Mês ou ano inválido.', alternativas: [] };
  }

  const groups = await getMergedCashflowGroups(userId, ano);
  const { melhor, alternativas } = resolverLinha(groups, input.linha, input.tipo, input.grupo);
  if (!melhor) {
    const onde = input.grupo ? ` em "${input.grupo}"` : '';
    return {
      ok: false,
      motivo: `Não encontrei uma linha de ${input.tipo === 'despesa' ? 'despesa' : 'entrada'} parecida com "${input.linha}"${onde}.`,
      alternativas,
    };
  }

  const celulas: CelulaProposta[] = celulasDoLancamento(
    groups,
    melhor.itemId,
    ano,
    meses,
    modo,
    valor,
  );
  const proposta: Proposta = {
    id: randomUUID(),
    mensagemId,
    userId,
    itemId: melhor.itemId,
    itemNome: melhor.itemNome,
    grupoNome: melhor.grupoNome,
    tipo: input.tipo,
    valor,
    ano,
    descricao: input.descricao?.trim().slice(0, 200) || null,
    modo,
    celulas,
    expiraEm: Date.now() + PROPOSTA_TTL_MS,
  };
  return { ok: true, proposta, token: assinarProposta(proposta) };
}

// ---------------------------------------------------------------------------
// Assinatura: a proposta vai e volta pelo cliente sem estado no servidor.
// ---------------------------------------------------------------------------

export function assinarProposta(p: Proposta): string {
  return assinarPayload(p);
}

/**
 * Devolve a proposta se a assinatura confere, não expirou e pertence ao
 * usuário. `celulas` também separa esta proposta da de evento (agenda), que é
 * assinada com a mesma chave.
 */
export function verificarProposta(token: string, userId: string): Proposta | null {
  const p = abrirPayload<Proposta>(token);
  if (!p) return null;
  if (p.userId !== userId || p.expiraEm < Date.now()) return null;
  if (!Array.isArray(p.celulas) || p.celulas.length === 0) return null;
  return p;
}

// ---------------------------------------------------------------------------
// Gravação (só depois da confirmação do usuário).
// ---------------------------------------------------------------------------

export interface OpcoesAplicacao {
  /**
   * Recalcular snapshots de evolução, checar alertas de orçamento e invalidar o
   * contexto depois de gravar. `aplicarPropostas` desliga por item e faz uma vez
   * só no fim do lote.
   */
  posProcessar?: boolean;
}

/**
 * Grava a proposta confirmada — delega para `aplicarLancamento` (services/cashflow/lancamentoFluxo)
 * com origem 'assistente' e carimbo sempre ("Gasto de R$ X (assistente)"). Cada célula é relida do
 * banco na hora; o histórico recebe UMA entrada (desfazível) para o lançamento inteiro.
 */
export async function aplicarProposta(
  auth: AuthWithActingResult,
  request: NextRequest,
  p: Proposta,
  opcoes: OpcoesAplicacao = {},
): Promise<ResultadoAplicacao> {
  const { itemId, celulas } = await aplicarLancamento(auth, request, p, {
    origem: 'assistente',
    carimbar: 'sempre',
    posProcessar: opcoes.posProcessar,
  });
  return { itemId, celulas };
}

export type ResultadoLote =
  | { ok: true; proposta: Proposta; resultado: ResultadoAplicacao }
  | { ok: false; proposta: Proposta; erro: string };

/**
 * Grava várias propostas confirmadas de uma vez (o cartão com vários itens).
 * Cada proposta é independente: uma falha não desfaz as outras — o usuário vê
 * item a item o que entrou. Uma entrada no histórico por item (cada uma
 * desfazível sozinha); recálculo de snapshots e alertas rodam UMA vez, a
 * partir do mês mais antigo alterado.
 */
export async function aplicarPropostas(
  auth: AuthWithActingResult,
  request: NextRequest,
  propostas: Proposta[],
): Promise<ResultadoLote[]> {
  const out: ResultadoLote[] = [];
  let maisAntigo: { ano: number; mes: number } | null = null;
  for (const proposta of propostas) {
    try {
      const resultado = await aplicarProposta(auth, request, proposta, { posProcessar: false });
      out.push({ ok: true, proposta, resultado });
      const mes = proposta.celulas[0]?.mes ?? 0;
      if (
        !maisAntigo ||
        proposta.ano < maisAntigo.ano ||
        (proposta.ano === maisAntigo.ano && mes < maisAntigo.mes)
      ) {
        maisAntigo = { ano: proposta.ano, mes };
      }
    } catch (error: unknown) {
      console.error(
        '[assistente] falha ao gravar item do lote:',
        proposta.itemNome,
        error instanceof Error ? error.message : error,
      );
      out.push({ ok: false, proposta, erro: 'Não consegui gravar este item.' });
    }
  }
  if (maisAntigo) await posProcessarLancamento(auth.targetUserId, maisAntigo.ano, maisAntigo.mes);
  return out;
}
