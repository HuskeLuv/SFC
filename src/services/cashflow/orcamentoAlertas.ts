import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import type { CashflowGroup } from '@/types/cashflow';
import { getMergedCashflowGroups } from './getCashflowTree';
import { buildOrcamentoVsReal } from './orcamentoVsReal';

/**
 * Alertas de orçamento (ticket 20/08/2026): notificação in-app quando o
 * consumo do orçamento de uma categoria no MÊS CORRENTE cruza um nível:
 * - 'atencao'   (≥ 80%): fique de olho;
 * - 'atingido'  (= 100%): orçamento do mês atingido;
 * - 'estourado' (> 100%): passou do limite, hora de gestão orçamentária.
 *
 * Regras:
 * - Real no modo 'lancado' (padrão da aba Orçamento vs Real) do mês corrente
 *   em horário de Brasília; edições de meses passados não alertam.
 * - UMA notificação por (categoria, mês, nível), guardado em
 *   Notification.metadata — se o consumo pula direto de 50% para 120%, sai só
 *   o alerta do nível mais alto ('estourado'), sem spam dos intermediários.
 * - A linha Investimentos fica FORA: a semântica dela é invertida (atingir
 *   100% da meta de aporte é bom, não um estouro).
 *
 * Disparo: após mutações que mudam o real (batch-update, import) ou a meta
 * (orcamento PUT), via `checkOrcamentoAlertasSafe` — best-effort, nunca
 * derruba a mutação principal. E-mail fica para quando houver verificação de
 * e-mail no cadastro (SES); o gancho é este mesmo serviço.
 */

export const ORCAMENTO_ALERTA_TYPE = 'orcamento_alerta';

/** Tolerância para comparações com valores já arredondados a 2 casas. */
const EPS = 0.005;

const MES_NOME = [
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

const brl = (v: number): string =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Data civil em horário de Brasília (UTC−3, sem horário de verão desde 2019). */
const brasiliaParts = (now: Date): { year: number; month: number } => {
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return { year: brt.getUTCFullYear(), month: brt.getUTCMonth() };
};

export type OrcamentoAlertaNivel = 'atencao' | 'atingido' | 'estourado';

const NIVEL_POR_RANK: Record<number, OrcamentoAlertaNivel> = {
  1: 'atencao',
  2: 'atingido',
  3: 'estourado',
};

/** Rank do nível de consumo (0 = sem alerta). */
export const rankDoConsumo = (real: number, meta: number): number => {
  if (!(meta > 0)) return 0;
  if (real - meta > EPS) return 3;
  if (real >= meta - EPS) return 2;
  if (real >= meta * 0.8 - EPS) return 1;
  return 0;
};

const tituloEMensagem = (
  rank: number,
  categoria: string,
  mesNome: string,
  real: number,
  meta: number,
  pct: number,
): { title: string; message: string } => {
  if (rank === 3) {
    return {
      title: `Orçamento de ${categoria} estourado`,
      message: `O orçamento de ${categoria} de ${mesNome} passou do limite: ${brl(real)} de ${brl(meta)} (${pct}%). Vale rever os gastos da categoria.`,
    };
  }
  if (rank === 2) {
    return {
      title: `Orçamento de ${categoria} atingido`,
      message: `O orçamento de ${categoria} de ${mesNome} foi atingido: ${brl(real)} de ${brl(meta)}.`,
    };
  }
  return {
    title: `Orçamento: ${categoria} em ${pct}%`,
    message: `Você já usou ${pct}% do orçamento de ${categoria} em ${mesNome}: ${brl(real)} de ${brl(meta)}. Fique de olho para não estourar.`,
  };
};

export interface CheckOrcamentoAlertasOptions {
  now?: Date;
  /** Árvore mesclada já carregada pelo caller (ex.: batch-update) + o ano dela.
   * Reaproveitada só se o ano bater com o mês corrente BRT. */
  groups?: CashflowGroup[];
  groupsYear?: number;
}

export interface OrcamentoAlertaCriado {
  groupId: string;
  categoria: string;
  nivel: OrcamentoAlertaNivel;
  consumoPct: number;
}

/**
 * Checa o consumo do mês corrente contra as metas e cria as notificações
 * pendentes. Retorna os alertas criados (vazio quando não há nada novo).
 */
export async function checkOrcamentoAlertas(
  userId: string,
  options: CheckOrcamentoAlertasOptions = {},
): Promise<OrcamentoAlertaCriado[]> {
  const now = options.now ?? new Date();
  const { year, month } = brasiliaParts(now);

  const metasRows = await prisma.cashflowOrcamento.findMany({
    where: { userId, year, tipo: 'grupo' },
  });
  if (metasRows.length === 0) return [];

  const groups =
    options.groups && options.groupsYear === year
      ? options.groups
      : await getMergedCashflowGroups(userId, year);

  // Já notificados neste mês (por categoria, maior rank). createdAt ≥ início
  // do mês UTC cobre o mês BRT inteiro (BRT começa 3h depois do UTC).
  const existentes = await prisma.notification.findMany({
    where: {
      userId,
      type: ORCAMENTO_ALERTA_TYPE,
      createdAt: { gte: new Date(Date.UTC(year, month, 1)) },
    },
    select: { metadata: true },
  });
  const maxRankPorGrupo = new Map<string, number>();
  for (const notif of existentes) {
    const meta = notif.metadata as {
      year?: number;
      month?: number;
      groupId?: string;
      rank?: number;
    } | null;
    if (!meta || meta.year !== year || meta.month !== month || !meta.groupId) continue;
    const rank = typeof meta.rank === 'number' ? meta.rank : 0;
    if (rank > (maxRankPorGrupo.get(meta.groupId) ?? 0)) {
      maxRankPorGrupo.set(meta.groupId, rank);
    }
  }

  const orcamento = buildOrcamentoVsReal({
    groups,
    metas: metasRows.map((row) => ({
      groupId: row.groupId,
      tipo: row.tipo,
      tipoMeta: row.tipoMeta,
      valor: Number(row.valor),
    })),
    // Só categorias alertam — a linha Investimentos (semântica invertida) fica
    // fora, então a série real dela não é necessária aqui.
    investimentosRealPorMes: Array(12).fill(0),
  });

  const criados: OrcamentoAlertaCriado[] = [];
  for (const categoria of orcamento.categorias) {
    const meta = categoria.metaMensal;
    if (meta === null || !(meta > 0)) continue;
    const real = categoria.realPorMes.lancado[month] || 0;
    const rank = rankDoConsumo(real, meta);
    if (rank === 0 || rank <= (maxRankPorGrupo.get(categoria.groupId) ?? 0)) continue;

    const nivel = NIVEL_POR_RANK[rank];
    const consumoPct = Math.round((real / meta) * 100);
    const { title, message } = tituloEMensagem(
      rank,
      categoria.nome,
      MES_NOME[month],
      real,
      meta,
      consumoPct,
    );
    await prisma.notification.create({
      data: {
        userId,
        title,
        message,
        type: ORCAMENTO_ALERTA_TYPE,
        metadata: {
          year,
          month,
          groupId: categoria.groupId,
          categoria: categoria.nome,
          nivel,
          rank,
          consumoPct,
          meta,
          real,
        },
      },
    });
    criados.push({ groupId: categoria.groupId, categoria: categoria.nome, nivel, consumoPct });
  }

  return criados;
}

/** Variante best-effort para rotas de mutação: falha loga e não derruba a rota. */
export async function checkOrcamentoAlertasSafe(
  userId: string,
  options: CheckOrcamentoAlertasOptions = {},
): Promise<void> {
  try {
    await checkOrcamentoAlertas(userId, options);
  } catch (error) {
    logger.error('[checkOrcamentoAlertasSafe] check falhou:', { userId, error });
  }
}
