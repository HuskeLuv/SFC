/**
 * Ação de escrita do assistente: registrar um gasto/receita numa célula do
 * fluxo de caixa mensal. Fluxo obrigatório (spec v1.1 §5):
 *   modelo chama a ferramenta → servidor monta a PROPOSTA (assinada, expira
 *   em 10 min) → app mostra o cartão → usuário confirma → servidor grava.
 * A IA nunca grava direto.
 */
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import type { AuthWithActingResult } from '@/utils/auth';
import { ensurePersonalizedItem } from '@/utils/cashflowPersonalization';
import { getMergedCashflowGroups } from '@/services/cashflow/getCashflowTree';
import { recomputeEvolucaoSnapshotsSafe } from '@/services/cashflow/evolucaoPatrimonioServer';
import { checkOrcamentoAlertasSafe } from '@/services/cashflow/orcamentoAlertas';
import { recordChange } from '@/services/changeHistory';
import type { CashflowGroup } from '@/types/cashflow';
import {
  invalidarContextoUsuario,
  listarLinhasEditaveis,
  round,
  type LinhaEditavel,
} from './contexto';

export const MESES_LONGOS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

export interface LancamentoInput {
  tipo: 'despesa' | 'entrada';
  linha: string;
  /** Grupo/seção da linha (ex.: "Transporte"), para desempatar nomes repetidos como "Outros". */
  grupo?: string;
  valor: number;
  mes?: number;
  ano?: number;
  descricao?: string;
}

export interface Proposta {
  id: string;
  /** Linha de assistente_mensagens que gerou a proposta (métrica de confirmação). */
  mensagemId: string;
  userId: string;
  itemId: string;
  itemNome: string;
  grupoNome: string;
  tipo: 'despesa' | 'entrada';
  valor: number;
  mes: number;
  ano: number;
  descricao: string | null;
  valorAtual: number;
  valorNovo: number;
  /** epoch ms */
  expiraEm: number;
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

function valorDaCelula(groups: CashflowGroup[], itemId: string, ano: number, mes: number): number {
  const find = (g: CashflowGroup): number | null => {
    for (const it of g.items ?? []) {
      if (it.id === itemId) {
        const v = (it.values ?? []).find((x) => x.year === ano && x.month === mes);
        return v ? Number(v.value) : 0;
      }
    }
    for (const c of g.children ?? []) {
      const r = find(c);
      if (r !== null) return r;
    }
    return null;
  };
  for (const g of groups) {
    const r = find(g);
    if (r !== null) return r;
  }
  return 0;
}

export type ResultadoProposta =
  | { ok: true; proposta: Proposta; token: string }
  | { ok: false; motivo: string; alternativas: LinhaCandidata[] };

export async function montarProposta(
  userId: string,
  mensagemId: string,
  input: LancamentoInput,
): Promise<ResultadoProposta> {
  const agora = new Date();
  const ano = input.ano ?? agora.getFullYear();
  const mes = input.mes ?? agora.getMonth();
  const valor = round(Number(input.valor));
  if (!Number.isFinite(valor) || valor <= 0) {
    return { ok: false, motivo: 'Valor inválido.', alternativas: [] };
  }
  if (mes < 0 || mes > 11 || ano < 2000 || ano > 2100) {
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

  const valorAtual = round(valorDaCelula(groups, melhor.itemId, ano, mes));
  const proposta: Proposta = {
    id: randomUUID(),
    mensagemId,
    userId,
    itemId: melhor.itemId,
    itemNome: melhor.itemNome,
    grupoNome: melhor.grupoNome,
    tipo: input.tipo,
    valor,
    mes,
    ano,
    descricao: input.descricao?.trim().slice(0, 200) || null,
    valorAtual,
    valorNovo: round(valorAtual + valor),
    expiraEm: Date.now() + PROPOSTA_TTL_MS,
  };
  return { ok: true, proposta, token: assinarProposta(proposta) };
}

// ---------------------------------------------------------------------------
// Assinatura: a proposta vai e volta pelo cliente sem estado no servidor.
// ---------------------------------------------------------------------------

function segredo(): string {
  const s = process.env.ASSISTENTE_SECRET ?? process.env.JWT_SECRET;
  if (!s) throw new Error('ASSISTENTE_SECRET/JWT_SECRET não configurado');
  return s;
}

function hmac(payload: string): string {
  return createHmac('sha256', segredo()).update(payload).digest('base64url');
}

export function assinarProposta(p: Proposta): string {
  const payload = Buffer.from(JSON.stringify(p), 'utf8').toString('base64url');
  return `${payload}.${hmac(payload)}`;
}

/** Devolve a proposta se a assinatura confere, não expirou e pertence ao usuário. */
export function verificarProposta(token: string, userId: string): Proposta | null {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const esperado = hmac(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(esperado);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Proposta;
    if (p.userId !== userId || p.expiraEm < Date.now()) return null;
    return p;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Gravação (só depois da confirmação do usuário).
// ---------------------------------------------------------------------------

export interface ResultadoAplicacao {
  itemId: string;
  valorAnterior: number;
  valorNovo: number;
}

export async function aplicarProposta(
  auth: AuthWithActingResult,
  request: NextRequest,
  p: Proposta,
): Promise<ResultadoAplicacao> {
  const userId = auth.targetUserId;
  const { itemId } = await ensurePersonalizedItem(p.itemId, userId);

  const where = { itemId_userId_year_month: { itemId, userId, year: p.ano, month: p.mes } };
  const atual = await prisma.cashflowValue.findUnique({ where });
  const valorAnterior = atual ? round(Number(atual.value)) : 0;
  const valorNovo = round(valorAnterior + p.valor);

  const carimbo = `${p.tipo === 'despesa' ? 'Gasto' : 'Receita'} de R$ ${p.valor.toFixed(2).replace('.', ',')}${p.descricao ? ` — ${p.descricao}` : ''} (assistente)`;
  const comentario = atual?.comment ? `${atual.comment}\n${carimbo}` : carimbo;

  await prisma.cashflowValue.upsert({
    where,
    create: { itemId, userId, year: p.ano, month: p.mes, value: valorNovo, comment: comentario },
    // Soma manual invalida a fórmula da célula (ela deixaria de bater).
    update: { value: valorNovo, formula: null, comment: comentario.slice(0, 2000) },
  });

  await recomputeEvolucaoSnapshotsSafe(userId, new Date(p.ano, p.mes, 1));

  await recordChange({
    request,
    auth,
    section: 'fluxo-caixa',
    action: 'valor.editar',
    entity: 'valor',
    entityId: itemId,
    entityLabel: `${p.itemNome} · ${MESES_LONGOS[p.mes]}/${p.ano} (assistente)`,
    changes: [
      {
        field: 'monthlyValue',
        label: `${MESES_LONGOS[p.mes]}/${p.ano}`,
        before: atual ? valorAnterior : null,
        after: valorNovo,
        format: 'currency',
      },
    ],
    snapshot: {
      v: 1,
      kind: 'cashflow-valor',
      data: { value: atual ? valorAnterior : null },
      meta: { itemId, year: p.ano, month: p.mes, origem: 'assistente' },
    },
  });

  await checkOrcamentoAlertasSafe(userId);
  invalidarContextoUsuario(userId);

  return { itemId, valorAnterior, valorNovo };
}
