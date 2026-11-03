/**
 * Ajustes do assistente no fluxo de caixa (ticket 86e2wwqxm, 02/11/2026): comentário da célula,
 * cor da célula (só as da legenda) e orçado do Orçamento v2. Mesmo fluxo obrigatório do
 * lançamento (spec v1.1 §5):
 *   modelo chama a ferramenta → servidor monta a PROPOSTA (assinada, expira em 10 min) → app
 *   mostra o cartão → usuário confirma → servidor grava e registra no Histórico (com Desfazer).
 * A IA nunca grava direto.
 */
import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import type { AuthWithActingResult } from '@/utils/auth';
import type { CashflowGroup, CashflowValue } from '@/types/cashflow';
import { getMergedCashflowGroups } from '@/services/cashflow/getCashflowTree';
import { ensurePersonalizedItem } from '@/utils/cashflowPersonalization';
import { recordChange, diffFields, CASHFLOW_FIELD_LABELS } from '@/services/changeHistory';
import {
  CASHFLOW_COLOR_LEGEND,
  cashflowColorCss,
  type CashflowColorValue,
} from '@/utils/cashflowColorLegend';
import { normalizeCellColor } from '@/lib/cashflow/cellColor';
import { estadoAcessoOrcamentoV2 } from '@/services/cashflow/orcamentoV2/acesso';
import {
  ErroEscritaOrcamento,
  orcadoDaLinha,
  resolverSubcategoria,
  salvarOrcado,
} from '@/services/cashflow/orcamentoV2/escritaOrcado';
import { abrirPayload, assinarPayload } from './assinatura';
import { invalidarContextoUsuario, round } from './contexto';
import { grupoCurto, pontuarLinha, resolverLinha, type LinhaCandidata } from './lancamento';

/** Quantos ajustes uma mensagem pode propor (uma chamada de ferramenta por ajuste). */
export const MAX_AJUSTES_POR_MENSAGEM = 12;

const PROPOSTA_TTL_MS = 10 * 60 * 1000;
const MAX_COMENTARIO = 1000;

export const MESES_CURTOS = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
] as const;

const MESES_LONGOS = [
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

/** Cor pedida ao modelo: um valor da legenda ou 'nenhuma' (tira a cor). */
export type CorAjuste = CashflowColorValue | 'nenhuma';
export const CORES_AJUSTE: readonly CorAjuste[] = [
  ...CASHFLOW_COLOR_LEGEND.map((c) => c.value),
  'nenhuma',
];

export type AcaoComentario = 'acrescentar' | 'substituir' | 'apagar';

// ---------------------------------------------------------------------------
// Entradas (o que o modelo manda, já validado pelo zod da rota)
// ---------------------------------------------------------------------------

interface AlvoLinhaInput {
  linha: string;
  grupo?: string;
  tipo?: 'despesa' | 'entrada';
  ano?: number;
}

export interface ComentarioInput extends AlvoLinhaInput {
  mes?: number;
  comentario?: string;
  acao?: AcaoComentario;
}

export interface CorInput extends AlvoLinhaInput {
  cor: CorAjuste;
  mes?: number;
  mesInicio?: number;
  mesFim?: number;
}

export interface OrcamentoInput {
  subcategoria: string;
  categoria?: string;
  valor: number;
  mes?: number;
  mesInicio?: number;
  mesFim?: number;
  ano?: number;
}

// ---------------------------------------------------------------------------
// Propostas (assinadas; vão e voltam pelo cliente)
// ---------------------------------------------------------------------------

interface PropostaBase {
  kind: 'ajuste';
  id: string;
  mensagemId: string;
  userId: string;
  itemId: string;
  itemNome: string;
  grupoNome: string;
  ano: number;
  /** epoch ms */
  expiraEm: number;
}

export interface PropostaComentario extends PropostaBase {
  tipo: 'comentario';
  mes: number;
  antes: string | null;
  depois: string | null;
}

export interface PropostaCor extends PropostaBase {
  tipo: 'cor';
  cor: CorAjuste;
  celulas: Array<{ mes: number; antes: string | null }>;
}

export interface PropostaOrcamento extends PropostaBase {
  tipo: 'orcamento';
  valor: number;
  celulas: Array<{ mes: number; antes: number | null }>;
}

export type PropostaAjuste = PropostaComentario | PropostaCor | PropostaOrcamento;

export type ResultadoAjuste =
  | { ok: true; proposta: PropostaAjuste; token: string }
  | { ok: false; motivo: string; alternativas?: LinhaCandidata[] };

export interface OpcoesAjuste {
  /** Ano aberto na planilha (seletor da sidebar). */
  anoPlanilha?: number;
  hoje?: Date;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lerValor(
  groups: CashflowGroup[],
  itemId: string,
  ano: number,
  mes: number,
): CashflowValue | null {
  const find = (g: CashflowGroup): CashflowValue | null | undefined => {
    for (const it of g.items ?? []) {
      if (it.id === itemId) {
        return (it.values ?? []).find((v) => v.year === ano && v.month === mes) ?? null;
      }
    }
    for (const c of g.children ?? []) {
      const r = find(c);
      if (r !== undefined) return r;
    }
    return undefined;
  };
  for (const g of groups) {
    const r = find(g);
    if (r !== undefined) return r;
  }
  return null;
}

/** Ano: o que o usuário disse > o ano aberto na planilha > o ano de hoje. */
function anoDoAjuste(input: { ano?: number }, opcoes: OpcoesAjuste): number {
  return input.ano ?? opcoes.anoPlanilha ?? (opcoes.hoje ?? new Date()).getFullYear();
}

function mesesDoIntervalo(
  input: { mes?: number; mesInicio?: number; mesFim?: number },
  hoje: Date,
): number[] | null {
  if (input.mesInicio === undefined && input.mesFim === undefined) {
    return [input.mes ?? hoje.getMonth()];
  }
  const inicio = input.mesInicio ?? input.mes ?? 0;
  const fim = input.mesFim ?? 11;
  if (inicio > fim || inicio < 0 || fim > 11) return null;
  return Array.from({ length: fim - inicio + 1 }, (_, i) => inicio + i);
}

/** Linha do fluxo pelo nome: no tipo informado ou, sem tipo, a melhor entre despesa e entrada. */
function acharLinha(
  groups: CashflowGroup[],
  input: AlvoLinhaInput,
): { melhor: LinhaCandidata | null; alternativas: LinhaCandidata[] } {
  if (input.tipo) return resolverLinha(groups, input.linha, input.tipo, input.grupo);
  const d = resolverLinha(groups, input.linha, 'despesa', input.grupo);
  const e = resolverLinha(groups, input.linha, 'entrada', input.grupo);
  if (!d.melhor) return e.melhor ? e : { melhor: null, alternativas: [...d.alternativas] };
  if (!e.melhor) return d;
  return pontuarLinha(input.linha, e.melhor.itemNome) > pontuarLinha(input.linha, d.melhor.itemNome)
    ? e
    : d;
}

function naoAchou(nome: string, grupo: string | undefined, alternativas: LinhaCandidata[]) {
  const onde = grupo ? ` em "${grupo}"` : '';
  return {
    ok: false as const,
    motivo: `Não encontrei uma linha parecida com "${nome}"${onde}.`,
    alternativas,
  };
}

function base(
  userId: string,
  mensagemId: string,
  linha: LinhaCandidata,
  ano: number,
): PropostaBase {
  return {
    kind: 'ajuste',
    id: randomUUID(),
    mensagemId,
    userId,
    itemId: linha.itemId,
    itemNome: linha.itemNome,
    grupoNome: linha.grupoNome,
    ano,
    expiraEm: Date.now() + PROPOSTA_TTL_MS,
  };
}

function anoValido(ano: number): boolean {
  return Number.isInteger(ano) && ano >= 2000 && ano <= 2100;
}

// ---------------------------------------------------------------------------
// Montagem das propostas
// ---------------------------------------------------------------------------

export async function montarPropostaComentario(
  userId: string,
  mensagemId: string,
  input: ComentarioInput,
  opcoes: OpcoesAjuste = {},
): Promise<ResultadoAjuste> {
  const hoje = opcoes.hoje ?? new Date();
  const acao: AcaoComentario = input.acao ?? 'acrescentar';
  const texto = (input.comentario ?? '').trim();
  if (acao !== 'apagar' && !texto) return { ok: false, motivo: 'Faltou o texto do comentário.' };
  const mes = input.mes ?? hoje.getMonth();
  const ano = anoDoAjuste(input, opcoes);
  if (mes < 0 || mes > 11 || !anoValido(ano)) return { ok: false, motivo: 'Mês ou ano inválido.' };

  const groups = await getMergedCashflowGroups(userId, ano);
  const { melhor, alternativas } = acharLinha(groups, input);
  if (!melhor) return naoAchou(input.linha, input.grupo, alternativas);

  const antes = lerValor(groups, melhor.itemId, ano, mes)?.comment?.trim() || null;
  let depois: string | null;
  if (acao === 'apagar') depois = null;
  else if (acao === 'substituir' || !antes) depois = texto;
  else depois = `${antes}\n${texto}`;
  if (depois && depois.length > MAX_COMENTARIO) {
    return { ok: false, motivo: 'O comentário ficaria longo demais (máximo de 1.000 caracteres).' };
  }
  if (antes === depois) {
    return {
      ok: false,
      motivo:
        acao === 'apagar'
          ? `A célula de "${melhor.itemNome}" em ${MESES_LONGOS[mes]}/${ano} não tem comentário.`
          : `A célula de "${melhor.itemNome}" em ${MESES_LONGOS[mes]}/${ano} já tem esse comentário.`,
    };
  }

  const proposta: PropostaComentario = {
    ...base(userId, mensagemId, melhor, ano),
    tipo: 'comentario',
    mes,
    antes,
    depois,
  };
  return { ok: true, proposta, token: assinarPayload(proposta) };
}

export async function montarPropostaCor(
  userId: string,
  mensagemId: string,
  input: CorInput,
  opcoes: OpcoesAjuste = {},
): Promise<ResultadoAjuste> {
  const hoje = opcoes.hoje ?? new Date();
  if (!CORES_AJUSTE.includes(input.cor)) {
    return {
      ok: false,
      motivo: `Só dá para usar as cores da legenda do fluxo: ${CASHFLOW_COLOR_LEGEND.map((c) => c.label).join(', ')}.`,
    };
  }
  const ano = anoDoAjuste(input, opcoes);
  const meses = mesesDoIntervalo(input, hoje);
  if (!meses || meses.some((m) => m < 0 || m > 11) || !anoValido(ano)) {
    return { ok: false, motivo: 'Mês ou ano inválido.' };
  }

  const groups = await getMergedCashflowGroups(userId, ano);
  const { melhor, alternativas } = acharLinha(groups, input);
  if (!melhor) return naoAchou(input.linha, input.grupo, alternativas);

  const alvo = input.cor === 'nenhuma' ? null : input.cor;
  const celulas = meses
    .map((mes) => ({ mes, antes: lerValor(groups, melhor.itemId, ano, mes)?.color ?? null }))
    .filter((c) => normalizeCellColor(c.antes) !== alvo || (alvo === null && c.antes !== null));
  if (celulas.length === 0) {
    return {
      ok: false,
      motivo: `"${melhor.itemNome}" já está ${alvo ? `como ${rotuloCor(input.cor)}` : 'sem cor'} ${meses.length === 1 ? `em ${MESES_LONGOS[meses[0]]}/${ano}` : 'nesses meses'}.`,
    };
  }

  const proposta: PropostaCor = {
    ...base(userId, mensagemId, melhor, ano),
    tipo: 'cor',
    cor: input.cor,
    celulas,
  };
  return { ok: true, proposta, token: assinarPayload(proposta) };
}

export async function montarPropostaOrcamento(
  userId: string,
  mensagemId: string,
  input: OrcamentoInput,
  opcoes: OpcoesAjuste = {},
): Promise<ResultadoAjuste> {
  const hoje = opcoes.hoje ?? new Date();
  const valor = round(Number(input.valor));
  if (!Number.isFinite(valor) || valor < 0) return { ok: false, motivo: 'Valor inválido.' };

  const { estado, ativado } = await estadoAcessoOrcamentoV2(userId);
  if (estado !== 'liberada' || !ativado) {
    return {
      ok: false,
      motivo:
        'Para definir o orçamento por aqui, abra uma vez a aba Orçamento do Fluxo de Caixa (ela organiza o orçamento por subcategoria) e peça de novo.',
    };
  }

  const ano = anoDoAjuste(input, opcoes);
  const meses = mesesDoIntervalo(input, hoje);
  if (!meses || meses.some((m) => m < 0 || m > 11) || !anoValido(ano)) {
    return { ok: false, motivo: 'Mês ou ano inválido.' };
  }

  const groups = await getMergedCashflowGroups(userId, ano);
  const { melhor, alternativas } = resolverLinha(
    groups,
    input.subcategoria,
    'despesa',
    input.categoria,
  );
  if (!melhor) return naoAchou(input.subcategoria, input.categoria, alternativas);
  try {
    await resolverSubcategoria(userId, melhor.itemId, ano);
  } catch (error: unknown) {
    if (error instanceof ErroEscritaOrcamento) {
      return {
        ok: false,
        motivo: `"${melhor.itemNome}" não é uma subcategoria do orçamento.`,
      };
    }
    throw error;
  }

  const linhas = await prisma.cashflowOrcamentoItem.findMany({
    where: { userId, itemId: melhor.itemId, ano, mes: { in: meses } },
    select: { mes: true, valor: true, pct: true },
  });
  const porMes = new Map(linhas.map((l) => [l.mes, orcadoDaLinha(l)]));
  const celulas = meses.map((mes) => {
    const o = porMes.get(mes);
    return { mes, antes: o?.valor ?? null };
  });
  if (celulas.every((c) => c.antes !== null && Math.abs(c.antes - valor) < 0.005)) {
    return {
      ok: false,
      motivo: `O orçamento de "${melhor.itemNome}" já está em ${brl(valor)} ${meses.length === 1 ? `em ${MESES_LONGOS[meses[0]]}/${ano}` : 'nesses meses'}.`,
    };
  }

  const proposta: PropostaOrcamento = {
    ...base(userId, mensagemId, melhor, ano),
    tipo: 'orcamento',
    valor,
    celulas,
  };
  return { ok: true, proposta, token: assinarPayload(proposta) };
}

// ---------------------------------------------------------------------------
// Verificação
// ---------------------------------------------------------------------------

/** Devolve a proposta se a assinatura confere, não expirou e pertence ao usuário. */
export function verificarPropostaAjuste(token: string, userId: string): PropostaAjuste | null {
  const p = abrirPayload<PropostaAjuste>(token);
  if (!p || p.kind !== 'ajuste') return null;
  if (p.userId !== userId || p.expiraEm < Date.now()) return null;
  if (!p.itemId || !anoValido(p.ano)) return null;
  if (p.tipo === 'comentario') return p.mes >= 0 && p.mes <= 11 ? p : null;
  if (p.tipo === 'cor' || p.tipo === 'orcamento') {
    return Array.isArray(p.celulas) && p.celulas.length > 0 ? p : null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Textos (cartão e resumo)
// ---------------------------------------------------------------------------

function brl(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function rotuloCor(cor: CorAjuste | string | null): string {
  if (!cor || cor === 'nenhuma') return 'sem cor';
  const v = normalizeCellColor(cor);
  return CASHFLOW_COLOR_LEGEND.find((c) => c.value === v)?.label ?? 'outra cor';
}

/** "em setembro/2026" | "de agosto a setembro/2026". */
function naFrase(periodoTxt: string): string {
  return periodoTxt.includes(' a ') ? `de ${periodoTxt}` : `em ${periodoTxt}`;
}

function periodo(ano: number, meses: number[]): string {
  if (meses.length === 1) return `${MESES_LONGOS[meses[0]]}/${ano}`;
  const contiguo = meses.every((m, i) => i === 0 || m === meses[i - 1] + 1);
  if (contiguo)
    return `${MESES_LONGOS[meses[0]]} a ${MESES_LONGOS[meses[meses.length - 1]]}/${ano}`;
  return `${meses.map((m) => MESES_CURTOS[m]).join(', ')}/${ano}`;
}

/** Proposta como vai para o cartão do painel. */
export interface AjusteResposta {
  token: string;
  tipo: PropostaAjuste['tipo'];
  titulo: string;
  linha: string;
  grupo: string;
  periodo: string;
  detalhes: string[];
  /** Só na cor: o hex da legenda, para a bolinha do cartão. */
  corCss?: string | null;
  expiraEm: number;
}

export function paraRespostaAjuste(p: PropostaAjuste, token: string): AjusteResposta {
  const comum = {
    token,
    tipo: p.tipo,
    linha: p.itemNome,
    grupo: grupoCurto(p.grupoNome),
    expiraEm: p.expiraEm,
  };
  if (p.tipo === 'comentario') {
    return {
      ...comum,
      titulo:
        p.depois === null ? 'Apagar comentário' : p.antes ? 'Editar comentário' : 'Comentário',
      periodo: periodo(p.ano, [p.mes]),
      detalhes: [
        ...(p.antes ? [`Atual: ${p.antes}`] : []),
        p.depois === null ? 'Novo: (sem comentário)' : `Novo: ${p.depois}`,
      ],
    };
  }
  if (p.tipo === 'cor') {
    const meses = p.celulas.map((c) => c.mes);
    return {
      ...comum,
      titulo: `Cor · ${rotuloCor(p.cor)}`,
      periodo: periodo(p.ano, meses),
      corCss: p.cor === 'nenhuma' ? null : cashflowColorCss(p.cor),
      detalhes: p.celulas.map(
        (c) => `${MESES_CURTOS[c.mes]}: ${rotuloCor(c.antes)} → ${rotuloCor(p.cor)}`,
      ),
    };
  }
  const meses = p.celulas.map((c) => c.mes);
  return {
    ...comum,
    titulo: `Orçamento · ${brl(p.valor)}${meses.length > 1 ? ' por mês' : ''}`,
    periodo: periodo(p.ano, meses),
    detalhes: p.celulas.map(
      (c) =>
        `${MESES_CURTOS[c.mes]}: ${c.antes === null ? 'sem orçado' : brl(c.antes)} → ${brl(p.valor)}`,
    ),
  };
}

/** Frase do assistente para um ajuste (o cartão traz os detalhes). */
export function descreverAjuste(a: AjusteResposta): string {
  if (a.tipo === 'comentario') {
    return a.titulo === 'Apagar comentário'
      ? `Vou apagar o comentário de "${a.linha}" (${a.grupo}) em ${a.periodo}.`
      : `Vou ${a.titulo === 'Editar comentário' ? 'atualizar' : 'colocar'} o comentário de "${a.linha}" (${a.grupo}) em ${a.periodo}.`;
  }
  if (a.tipo === 'cor') {
    return `Vou marcar "${a.linha}" (${a.grupo}) ${naFrase(a.periodo)} como ${a.titulo.replace('Cor · ', '')}.`;
  }
  return `Vou definir o orçamento de "${a.linha}" (${a.grupo}) em ${a.titulo.replace('Orçamento · ', '')}, ${a.periodo}.`;
}

// ---------------------------------------------------------------------------
// Gravação (só depois da confirmação do usuário)
// ---------------------------------------------------------------------------

export const ACAO_COR_EDITAR = 'cor.editar';
export const KIND_SNAPSHOT_CORES = 'cashflow-cores';

/** Célula do snapshot de 'cor.editar': cor antes/depois (hex ou null) e se a linha existia. */
export interface CelulaCorSnapshot {
  month: number;
  before: string | null;
  after: string | null;
  existia: boolean;
}

export interface ResultadoAjusteAplicado {
  resumo: string;
}

/**
 * Comentário: mesma escrita e mesma entrada de histórico do PATCH /api/cashflow/comments
 * ('comentario.editar', snapshot 'cashflow-comentario'), que já tem Desfazer. O texto é relido
 * do banco na hora: `acrescentar` entra em cima do comentário atual.
 */
async function aplicarComentario(
  auth: AuthWithActingResult,
  request: NextRequest,
  p: PropostaComentario,
): Promise<ResultadoAjusteAplicado> {
  const userId = auth.targetUserId;
  const { itemId, item } = await ensurePersonalizedItem(p.itemId, userId);
  const where = { itemId_userId_year_month: { itemId, userId, year: p.ano, month: p.mes } };
  const atual = await prisma.cashflowValue.findUnique({ where });
  const antesBanco = atual?.comment ?? null;
  // Comentário mudou desde a proposta (outra aba): `acrescentar` preserva o que entrou depois.
  let depois = p.depois;
  if (depois !== null && p.antes && antesBanco && antesBanco.trim() !== p.antes) {
    const novo = depois.startsWith(`${p.antes}\n`) ? depois.slice(p.antes.length + 1) : null;
    if (novo !== null) depois = `${antesBanco}\n${novo}`.slice(0, MAX_COMENTARIO);
  }
  if (atual) {
    await prisma.cashflowValue.update({ where: { id: atual.id }, data: { comment: depois } });
  } else {
    await prisma.cashflowValue.create({
      data: { itemId, userId, year: p.ano, month: p.mes, value: 0, comment: depois },
    });
  }
  await recordChange({
    request,
    auth,
    section: 'fluxo-caixa',
    action: 'comentario.editar',
    entity: 'item',
    entityId: itemId,
    entityLabel: `${item.name} · ${MESES_CURTOS[p.mes]}/${p.ano} (assistente)`,
    changes: diffFields({ comment: antesBanco }, { comment: depois }, CASHFLOW_FIELD_LABELS),
    snapshot: {
      v: 1,
      kind: 'cashflow-comentario',
      data: { comment: antesBanco, valueExisted: Boolean(atual) },
      meta: { itemId, year: p.ano, month: p.mes },
    },
  });
  const periodoTxt = periodo(p.ano, [p.mes]);
  return {
    resumo:
      depois === null
        ? `Apaguei o comentário de "${item.name}" em ${periodoTxt}. Dá para desfazer em Histórico.`
        : `Comentário salvo em "${item.name}" (${periodoTxt}). Dá para desfazer em Histórico.`,
  };
}

/**
 * Cor: grava o hex da legenda (o mesmo que o seletor da planilha grava) e registra
 * 'cor.editar' com as cores de antes de cada célula — o Desfazer volta cada uma que ainda
 * estiver com a cor gravada aqui.
 */
async function aplicarCor(
  auth: AuthWithActingResult,
  request: NextRequest,
  p: PropostaCor,
): Promise<ResultadoAjusteAplicado> {
  const userId = auth.targetUserId;
  const { itemId, item } = await ensurePersonalizedItem(p.itemId, userId);
  const corNova = p.cor === 'nenhuma' ? null : cashflowColorCss(p.cor);
  const meses = [...new Set(p.celulas.map((c) => c.mes))].sort((a, b) => a - b);

  const celulas = await prisma.$transaction(async (tx) => {
    const out: CelulaCorSnapshot[] = [];
    for (const month of meses) {
      const where = { itemId_userId_year_month: { itemId, userId, year: p.ano, month } };
      const atual = await tx.cashflowValue.findUnique({ where });
      const antes = atual?.color ?? null;
      if (atual && (atual.color ?? null) === corNova) continue;
      if (!atual && corNova === null) continue;
      if (atual) {
        await tx.cashflowValue.update({ where: { id: atual.id }, data: { color: corNova } });
      } else {
        await tx.cashflowValue.create({
          data: { itemId, userId, year: p.ano, month, value: 0, color: corNova },
        });
      }
      out.push({ month, before: antes, after: corNova, existia: Boolean(atual) });
    }
    return out;
  });

  const periodoTxt = periodo(p.ano, meses);
  if (celulas.length > 0) {
    await recordChange({
      request,
      auth,
      section: 'fluxo-caixa',
      action: ACAO_COR_EDITAR,
      entity: 'item',
      entityId: itemId,
      entityLabel: `${item.name} · ${periodo(
        p.ano,
        celulas.map((c) => c.month),
      )} (assistente)`,
      changes: celulas.map((c) => ({
        field: 'color',
        label: `${MESES_CURTOS[c.month]}/${p.ano}`,
        before: rotuloCor(c.before),
        after: rotuloCor(c.after),
      })),
      snapshot: {
        v: 1,
        kind: KIND_SNAPSHOT_CORES,
        data: { celulas } as unknown as Record<string, unknown>,
        meta: { itemId, year: p.ano },
      },
    });
    // Verde/vermelho contam como consolidado no orçamento e na saúde financeira.
    invalidarContextoUsuario(userId);
  }
  return {
    resumo: `Marquei "${item.name}" como ${rotuloCor(p.cor)} ${naFrase(periodoTxt)}. Dá para desfazer em Histórico.`,
  };
}

/**
 * Orçado: mesma gravação da tela do Orçamento (`salvarOrcado`), uma entrada de histórico
 * 'orcamento.item.editar' (desfazível) por mês.
 */
async function aplicarOrcamento(
  auth: AuthWithActingResult,
  request: NextRequest,
  p: PropostaOrcamento,
): Promise<ResultadoAjusteAplicado> {
  const userId = auth.targetUserId;
  const { estado, ativado } = await estadoAcessoOrcamentoV2(userId);
  if (estado !== 'liberada' || !ativado) {
    throw new ErroAjuste('O Orçamento por subcategoria não está ativo nesta conta.');
  }
  const meses = [...new Set(p.celulas.map((c) => c.mes))].sort((a, b) => a - b);
  let nome = p.itemNome;
  // Item-template é personalizado na 1ª gravação: os meses seguintes usam o id do usuário.
  let itemId = p.itemId;
  try {
    for (const mes0 of meses) {
      const r = await salvarOrcado(
        userId,
        itemId,
        { ano: p.ano, mes0, modo: 'valor', valor: p.valor },
        { contexto: { request, auth } },
      );
      nome = r.nome;
      itemId = r.itemId;
    }
  } catch (error: unknown) {
    if (error instanceof ErroEscritaOrcamento) {
      throw new ErroAjuste(`"${p.itemNome}" não é mais uma subcategoria do orçamento.`);
    }
    throw error;
  }
  const desfazer =
    meses.length === 1
      ? 'Dá para desfazer em Histórico.'
      : 'Dá para desfazer cada mês em Histórico.';
  return {
    resumo: `Orçamento de "${nome}" definido em ${brl(p.valor)}${meses.length > 1 ? ' por mês' : ''} (${periodo(p.ano, meses)}). ${desfazer}`,
  };
}

/** Falha esperada na gravação (vira 409 com a mensagem para o usuário). */
export class ErroAjuste extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErroAjuste';
  }
}

export async function aplicarPropostaAjuste(
  auth: AuthWithActingResult,
  request: NextRequest,
  p: PropostaAjuste,
): Promise<ResultadoAjusteAplicado> {
  if (p.tipo === 'comentario') return aplicarComentario(auth, request, p);
  if (p.tipo === 'cor') return aplicarCor(auth, request, p);
  return aplicarOrcamento(auth, request, p);
}
