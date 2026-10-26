import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import type { CashflowGroup } from '@/types/cashflow';
import { getMergedCashflowGroups } from './getCashflowTree';
import { buildOrcamentoVsReal, collectCategorias } from './orcamentoVsReal';
import { rankDoConsumo } from '@/lib/cashflow/orcamentoNivel';
import { enviarPushDaNotificacao } from '@/services/push/enviarPush';
import { estadoAcessoOrcamentoV2 } from './orcamentoV2/acesso';
import { montarOrcamentoV2, type OrcadoRow } from './orcamentoV2/montarOrcamento';
import { receitaPrevistaPorMes, type ReceitaMes } from './orcamentoV2/receitaPrevista';

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
 * Orçamento v2 (desenho técnico §3.3, PR 12): para o dono dos dados com o v2 `liberada && ativado`,
 * a meta da categoria é o ORÇADO v2 do mês (soma dos orçados das subcategorias em
 * `cashflow_orcamento_itens`, % convertido pela receita prevista) e o real é o Lançado do GET v2
 * (mesma montagem, `montarOrcamentoV2`). Sem ativação, fora do beta ou com a flag desligada, lê
 * `cashflow_orcamentos` exatamente como antes. A dedupe por categoria olha também o `templateId`:
 * a ativação personaliza as categorias de template (o id do grupo muda para o do override), e o
 * nível já notificado no mesmo dia não pode sair de novo.
 *
 * Disparo: após mutações que mudam o real (batch-update, import) ou a meta
 * (orcamento PUT), via `checkOrcamentoAlertasSafe` — best-effort, nunca
 * derruba a mutação principal. E-mail fica para quando houver verificação de
 * e-mail no cadastro (SES); o gancho é este mesmo serviço.
 */

export const ORCAMENTO_ALERTA_TYPE = 'orcamento_alerta';

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
const brasiliaParts = (now: Date): { year: number; month: number; day: number } => {
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return { year: brt.getUTCFullYear(), month: brt.getUTCMonth(), day: brt.getUTCDate() };
};

export type OrcamentoAlertaNivel = 'atencao' | 'atingido' | 'estourado';

const NIVEL_POR_RANK: Record<number, OrcamentoAlertaNivel> = {
  1: 'atencao',
  2: 'atingido',
  3: 'estourado',
};

// Rank do nível de consumo (0 = sem alerta): movido para a lib isomórfica, compartilhada com o
// Orçamento no celular (PWA fase 2). Re-exportado aqui sem mudança de comportamento.
export { rankDoConsumo };

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

/** Categoria com meta e real do mês corrente, pronta para a checagem de nível. */
interface CategoriaDoMes {
  groupId: string;
  /** Ids sob os quais um alerta desta categoria pode já ter sido gravado (o próprio + template). */
  chavesDedupe: string[];
  nome: string;
  meta: number;
  real: number;
}

interface FonteDoMes {
  categorias: CategoriaDoMes[];
  /** Campos extras no metadata da notificação (o caminho antigo não grava nenhum). */
  metadataExtra: Record<string, string>;
}

const arvoreDoAno = async (
  userId: string,
  year: number,
  options: CheckOrcamentoAlertasOptions,
): Promise<CashflowGroup[]> =>
  options.groups && options.groupsYear === year
    ? options.groups
    : getMergedCashflowGroups(userId, year);

/** Caminho de sempre: metas de `cashflow_orcamentos` (tipo 'grupo') × real Lançado do mês. */
async function categoriasPelaTabelaAntiga(
  userId: string,
  year: number,
  month: number,
  options: CheckOrcamentoAlertasOptions,
): Promise<FonteDoMes> {
  const metasRows = await prisma.cashflowOrcamento.findMany({
    where: { userId, year, tipo: 'grupo' },
  });
  if (metasRows.length === 0) return { categorias: [], metadataExtra: {} };

  const groups = await arvoreDoAno(userId, year, options);
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

  const categorias: CategoriaDoMes[] = [];
  for (const categoria of orcamento.categorias) {
    const meta = categoria.metaMensal;
    if (meta === null || !(meta > 0)) continue;
    categorias.push({
      groupId: categoria.groupId,
      chavesDedupe: [categoria.groupId],
      nome: categoria.nome,
      meta,
      real: categoria.realPorMes.lancado[month] || 0,
    });
  }
  return { categorias, metadataExtra: {} };
}

const SEM_RECEITA: ReceitaMes[] = Array.from({ length: 12 }, () => ({
  valor: null,
  origem: 'nenhuma' as const,
}));

/**
 * Orçamento v2: orçado da categoria no mês (Σ subcategorias, R-01) e realizado Lançado, pela mesma
 * montagem do GET v2. A receita prevista só é carregada se houver orçado em % (poupança): sem ela
 * o % vale 0, como na tela.
 */
async function categoriasPeloOrcamentoV2(
  userId: string,
  year: number,
  month: number,
  day: number,
  now: Date,
  options: CheckOrcamentoAlertasOptions,
): Promise<FonteDoMes> {
  const rows = await prisma.cashflowOrcamentoItem.findMany({
    where: { userId, ano: year, mes: month },
    select: { itemId: true, ano: true, mes: true, valor: true, pct: true },
  });
  const orcados: OrcadoRow[] = rows.map((r) => ({
    itemId: r.itemId,
    ano: r.ano,
    mes: r.mes,
    valor: r.valor === null ? null : Number(r.valor),
    pct: r.pct === null ? null : Number(r.pct),
  }));
  const metadataExtra = { orcamento: 'v2' };
  if (!orcados.some((o) => (o.valor ?? 0) > 0 || (o.pct ?? 0) > 0)) {
    return { categorias: [], metadataExtra };
  }

  const arvore = await arvoreDoAno(userId, year, options);
  const receitaPorMes = orcados.some((o) => o.pct !== null)
    ? await receitaPrevistaPorMes(userId, year, arvore)
    : SEM_RECEITA;

  const montado = montarOrcamentoV2({
    arvore,
    orcados,
    receitaPorMes,
    ano: year,
    mes0: month,
    visao: 'mes',
    fonte: 'lancado',
    hojeSP: { ano: year, mes0: month, dia: day },
    prefs: null,
    atualizadoEm: now,
  });

  const templatePorGrupo = new Map(
    collectCategorias(arvore).map(({ group }) => [group.id, group.templateId ?? null]),
  );
  const categorias: CategoriaDoMes[] = [];
  for (const categoria of montado.categorias) {
    if (!(categoria.orcado > 0)) continue;
    const templateId = templatePorGrupo.get(categoria.id);
    categorias.push({
      groupId: categoria.id,
      chavesDedupe: templateId ? [categoria.id, templateId] : [categoria.id],
      nome: categoria.nome,
      meta: categoria.orcado,
      real: categoria.realizado,
    });
  }
  return { categorias, metadataExtra };
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
  const { year, month, day } = brasiliaParts(now);

  // Decide pelo dono dos dados; flag desligada responde sem consultar o banco.
  const acesso = await estadoAcessoOrcamentoV2(userId);
  const { categorias, metadataExtra } =
    acesso.estado === 'liberada' && acesso.ativado
      ? await categoriasPeloOrcamentoV2(userId, year, month, day, now, options)
      : await categoriasPelaTabelaAntiga(userId, year, month, options);
  if (categorias.length === 0) return [];

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
  const rankJaNotificado = (chaves: string[]): number =>
    Math.max(0, ...chaves.map((id) => maxRankPorGrupo.get(id) ?? 0));

  const criados: OrcamentoAlertaCriado[] = [];
  for (const categoria of categorias) {
    const { meta, real } = categoria;
    const rank = rankDoConsumo(real, meta);
    if (rank === 0 || rank <= rankJaNotificado(categoria.chavesDedupe)) continue;

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
    const notificacao = await prisma.notification.create({
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
          ...metadataExtra,
        },
      },
    });
    // Web push best-effort (fase 5): espelha o sino, nunca falha o alerta.
    void enviarPushDaNotificacao(notificacao);
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
