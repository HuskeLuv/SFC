/**
 * Insumos do Relatório financeiro: tudo o que os montadores leem do banco, carregado SEMPRE na
 * janela máxima (13 meses) e cacheado por targetUserId (60 s, até 200 usuários). Trocar de
 * período só recorta em memória.
 *
 * Cada insumo é preguiçoso: só roda quando um montador pede, e uma vez por entrada de cache.
 * Bloco de plano bloqueado não roda o montador, então o insumo dele nunca é lido.
 *
 * Só leitura. Nunca chama carregarOrcamentoV2 (ativa a estrutura) nem as rotas que gravam.
 * buildSaudeFinanceira é chamado como hoje, sem preload (leitura dupla aceita na v1).
 *
 * Arquivo da fatia F0: as outras fatias só consomem.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getBoundedTtlCache } from '@/lib/boundedTtlCache';
import type { HojeSP } from '@/lib/orcamento/regras';
import type { CashflowGroup } from '@/types/cashflow';
import type { MesesRelatorio, PeriodoRelatorio, ValorMensal } from '@/types/relatorioFinanceiro';
import { getMergedCashflowGroups } from '@/services/cashflow/getCashflowTree';
import type { OrcadoRow } from '@/services/cashflow/orcamentoV2/montarOrcamento';
import {
  buildSaudeFinanceira,
  type SaudeFinanceiraPayload,
} from '@/services/saudeFinanceira/saudeFinanceiraServer';
import { carregarAportesMensais, chaveMesAporte } from '@/services/planejamento/aportesMensais';
import {
  JANELA_INSUMOS_MESES,
  anosDaJanela,
  hojeEmSaoPaulo,
  inicioDaJanela,
  mesesDaJanela,
} from './periodo';

export const CACHE_INSUMOS_NAMESPACE = 'relatorio-financeiro-insumos';
export const CACHE_INSUMOS_TTL_MS = 60_000;
export const CACHE_INSUMOS_MAX = 200;

/** Snapshot diário da carteira (portfolio_daily_snapshots), Decimal → number. */
export interface SnapshotDiario {
  date: Date;
  totalValue: number;
  totalInvested: number;
}

/** Ponto de portfolio_performance; cumulativeReturn em % (TWR acumulado). */
export interface PontoPerformance {
  date: Date;
  dailyReturn: number | null;
  cumulativeReturn: number;
}

export type DividaComPagamentos = Prisma.DividaGetPayload<{ include: { pagamentos: true } }>;

export interface Insumos {
  userId: string;
  /** Instante da carga (o cache pode servir uma carga de até 60 s atrás). */
  agora: Date;
  hojeSP: HojeSP;
  /** Os 13 meses da janela, 'YYYY-MM', do mais antigo ao corrente. */
  janela: string[];
  /** Meia-noite UTC do 1º dia da janela. */
  inicioJanela: Date;
  /** Árvore mesclada do fluxo de caixa do ano (memo por ano). */
  cashflowDoAno(ano: number): Promise<CashflowGroup[]>;
  /** Orçados (Orçamento v2) dos anos tocados pela janela. */
  orcadosDosAnos(): Promise<OrcadoRow[]>;
  /** Payload de buildSaudeFinanceira (a valoração única da carteira, passivos, reserva…). */
  saudeBase(): Promise<SaudeFinanceiraPayload>;
  /** Snapshots diários da janela, em ordem de data. */
  snapshots13m(): Promise<SnapshotDiario[]>;
  /** portfolio_performance da janela, em ordem de data. */
  performance13m(): Promise<PontoPerformance[]>;
  /** Todas as dívidas do usuário (todos os status) com os pagamentos. */
  dividasComPagamentos(): Promise<DividaComPagamentos[]>;
  /** Aporte líquido (compras − vendas) de cada mês da janela; 0 sem transação. */
  aportesMensais13m(): Promise<ValorMensal[]>;
}

/** O que todo montador recebe. */
export interface ContextoMontador {
  /** Dono dos dados (targetUserId). */
  userId: string;
  meses: MesesRelatorio;
  periodo: PeriodoRelatorio;
  /** Os `meses` do período, 'YYYY-MM', do mais antigo ao corrente. */
  mesesDoPeriodo: string[];
  agora: Date;
  hojeSP: HojeSP;
  /** true quando um consultor gera pelo cliente: sem backfill, nada gravado. */
  comConsultor: boolean;
  insumos: Insumos;
}

/** Memo de uma promessa; uma falha não fica presa no cache (a próxima chamada tenta de novo). */
function preguicoso<T>(carregar: () => Promise<T>): () => Promise<T> {
  let promessa: Promise<T> | null = null;
  return () => {
    if (!promessa) {
      promessa = carregar().catch((erro: unknown) => {
        promessa = null;
        throw erro;
      });
    }
    return promessa;
  };
}

const num = (v: unknown): number => Number(v);
const numOuNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/** Monta os insumos (sem cache). Nada é lido até um montador pedir. */
export function criarInsumos(userId: string, agora: Date): Insumos {
  const hojeSP = hojeEmSaoPaulo(agora);
  const janela = mesesDaJanela(hojeSP, JANELA_INSUMOS_MESES);
  const inicioJanela = inicioDaJanela(hojeSP, JANELA_INSUMOS_MESES);
  const anos = anosDaJanela(hojeSP, JANELA_INSUMOS_MESES);

  const arvores = new Map<number, () => Promise<CashflowGroup[]>>();
  const cashflowDoAno = (ano: number) => {
    let f = arvores.get(ano);
    if (!f) {
      f = preguicoso(() => getMergedCashflowGroups(userId, ano));
      arvores.set(ano, f);
    }
    return f();
  };

  const orcadosDosAnos = preguicoso(async (): Promise<OrcadoRow[]> => {
    const rows = await prisma.cashflowOrcamentoItem.findMany({
      where: { userId, ano: { in: anos } },
      select: { itemId: true, ano: true, mes: true, valor: true, pct: true },
    });
    return rows.map((r) => ({
      itemId: r.itemId,
      ano: r.ano,
      mes: r.mes,
      valor: numOuNull(r.valor),
      pct: numOuNull(r.pct),
    }));
  });

  const saudeBase = preguicoso(() => buildSaudeFinanceira(userId));

  const snapshots13m = preguicoso(async (): Promise<SnapshotDiario[]> => {
    const rows = await prisma.portfolioDailySnapshot.findMany({
      where: { userId, date: { gte: inicioJanela, lte: agora } },
      orderBy: { date: 'asc' },
      select: { date: true, totalValue: true, totalInvested: true },
    });
    return rows.map((r) => ({
      date: r.date,
      totalValue: num(r.totalValue),
      totalInvested: num(r.totalInvested),
    }));
  });

  const performance13m = preguicoso(async (): Promise<PontoPerformance[]> => {
    const rows = await prisma.portfolioPerformance.findMany({
      where: { userId, date: { gte: inicioJanela, lte: agora } },
      orderBy: { date: 'asc' },
      select: { date: true, dailyReturn: true, cumulativeReturn: true },
    });
    return rows.map((r) => ({
      date: r.date,
      dailyReturn: numOuNull(r.dailyReturn),
      cumulativeReturn: num(r.cumulativeReturn),
    }));
  });

  const dividasComPagamentos = preguicoso(() =>
    prisma.divida.findMany({
      where: { userId },
      include: { pagamentos: true },
      orderBy: { createdAt: 'desc' },
    }),
  );

  const aportesMensais13m = preguicoso(async (): Promise<ValorMensal[]> => {
    const porMes = await carregarAportesMensais(userId, inicioJanela, agora);
    return janela.map((mes) => {
      const [a, m] = mes.split('-').map(Number);
      const valor = porMes.get(chaveMesAporte(a, m - 1)) ?? 0;
      return { mes, valor: Math.round(valor * 100) / 100 };
    });
  });

  return {
    userId,
    agora,
    hojeSP,
    janela,
    inicioJanela,
    cashflowDoAno,
    orcadosDosAnos,
    saudeBase,
    snapshots13m,
    performance13m,
    dividasComPagamentos,
    aportesMensais13m,
  };
}

function cache() {
  return getBoundedTtlCache<Insumos>(CACHE_INSUMOS_NAMESPACE, { maxKeys: CACHE_INSUMOS_MAX });
}

/**
 * Insumos do dono dos dados, do cache quando há (60 s). A chave é só o targetUserId: dois
 * clientes do mesmo consultor nunca se cruzam, e trocar de período não recarrega.
 */
export function carregarInsumos(userId: string, agora: Date): Insumos {
  const c = cache();
  const hit = c.get(userId);
  if (hit) return hit;
  const insumos = criarInsumos(userId, agora);
  c.set(userId, insumos, CACHE_INSUMOS_TTL_MS);
  return insumos;
}

/** Esvazia o cache (testes). */
export function limparCacheInsumos(): void {
  cache().limpar();
}
