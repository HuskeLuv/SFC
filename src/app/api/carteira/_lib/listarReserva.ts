/**
 * Listagem das abas Reserva de Emergência e Reserva de Oportunidade — o miolo
 * das duas rotas GET (que ficam finas).
 *
 * Chave MOVER_CAIXA_RF_HABILITADO DESLIGADA: o código de antes da fase 2, sem
 * alteração (seleção por type/símbolo/`tesouroDestino`, valoração e metadados
 * de hoje). As linhas só ganham `naoMovivelMotivo` (sem alça no mover).
 *
 * Chave LIGADA (mover fase 2, out/2026):
 *   - seleção: o grupo Reservas + Renda Fixa inteiro (`wherePortfolioGrupoCaixaRf`)
 *     separado em JS pela aba efetiva (override ?? base, com a reserva do Tesouro
 *     de catálogo de `reservaDestinoPorAsset`) — "um item, uma aba";
 *   - valor: com FixedIncomeAsset, `getFixedIncomeCurrentValue` (= pizza e aba
 *     Renda Fixa); sem FI, a cascata de hoje;
 *   - metadados: com FI, os reais do título (vencimento, liquidez, indexador),
 *     sempre preferindo o que estiver explícito nas notes; sem FI, os padrões
 *     de hoje (D+0 / Imediata / CDI);
 *   - campos do mover por linha (`movido*`) e `saldoEmConta` (reserva sem título).
 *
 * Resposta no mesmo formato nos dois casos.
 */
import { prisma } from '@/lib/prisma';
import { isSaldoSemTitulo, type BaseCtx, type LinhaMovidaCampos } from '@/lib/carteiraMover';
import { moverCaixaRfHabilitado } from '@/lib/carteiraMoverConfig';
import { aplicarCamposMovido, camposMovidoPorLinha } from '@/app/api/carteira/_lib/linhaMovida';
import { filtrarDaCategoria, wherePortfolioGrupoCaixaRf } from '@/services/portfolio/categoriaAba';
import { createFixedIncomePricer } from '@/services/portfolio/fixedIncomePricing';
import { getFixedIncomeCurrentValue } from '@/services/portfolio/itemValuation';
import { reservaDestinoPorAsset } from '@/services/portfolio/tesouroDestino';
import type { FixedIncomeAssetWithAsset } from '@/services/portfolio/patrimonioHistoricoBuilder';

export type CategoriaReserva = 'reservaEmergencia' | 'reservaOportunidade';

export interface ReservaLinha extends LinhaMovidaCampos {
  id: string;
  nome: string;
  cotizacaoResgate: string;
  liquidacaoResgate: string;
  vencimento: Date;
  benchmark: string;
  valorInicial: number;
  aporte: number;
  resgate: number;
  valorAtualizado: number;
  percentualCarteira: number;
  riscoAtivo: number;
  rentabilidade: number;
  /** Fase 2 (chave ligada): saldo em conta/poupança/reserva manual, sem título. */
  saldoEmConta?: boolean;
}

export interface ReservaListagem {
  ativos: ReservaLinha[];
  saldoInicioMes: number;
  rendimento: number;
  rentabilidade: number;
}

interface ConfigReserva {
  nomePadrao: string;
  /** Seleção de antes da fase 2 (type/símbolo). */
  selecionaHoje: (asset: { type: string | null; symbol: string | null }) => boolean;
  tesouroDestino: 'reserva-emergencia' | 'reserva-oportunidade';
}

const CONFIG: Record<CategoriaReserva, ConfigReserva> = {
  reservaEmergencia: {
    nomePadrao: 'Reserva de Emergência',
    selecionaHoje: (a) => a.type === 'emergency' || Boolean(a.symbol?.startsWith('RESERVA-EMERG')),
    tesouroDestino: 'reserva-emergencia',
  },
  reservaOportunidade: {
    nomePadrao: 'Reserva de Oportunidade',
    // 'cash' soma em reservaOportunidade na distribuição do resumo — sem ele
    // aqui, o ativo aparecia na pizza mas em aba nenhuma.
    selecionaHoje: (a) =>
      a.type === 'opportunity' ||
      a.type === 'cash' ||
      Boolean(a.symbol?.startsWith('RESERVA-OPORT')),
    tesouroDestino: 'reserva-oportunidade',
  },
};

const parseNotes = (notes?: string | null) => {
  if (!notes) return null;
  try {
    return JSON.parse(notes);
  } catch {
    return null;
  }
};

const fmtNum = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

/**
 * Rótulo do benchmark de um título (coluna "Benchmark" das reservas), sem o
 * "CDI" padrão: '110% CDI', 'IPCA + 6%', 'Pré 12,5%', 'Selic'.
 */
export const benchmarkDoTitulo = (
  fi: Pick<
    FixedIncomeAssetWithAsset,
    'indexer' | 'indexerPercent' | 'annualRate' | 'tesouroBondType'
  >,
): string => {
  const rate = fi.annualRate > 0 ? fi.annualRate : 0;
  const bond = (fi.tesouroBondType ?? '').toLowerCase();
  if (bond) {
    if (/selic/.test(bond)) return 'Selic';
    if (/ipca|renda\+|educa\+/.test(bond)) return rate ? `IPCA + ${fmtNum(rate)}%` : 'IPCA';
    if (/prefixado/.test(bond)) return rate ? `Pré ${fmtNum(rate)}%` : 'Pré';
  }
  if (fi.indexer === 'CDI') {
    const pct = fi.indexerPercent ?? 100;
    return pct && pct !== 100 ? `${fmtNum(pct)}% CDI` : 'CDI';
  }
  if (fi.indexer === 'IPCA') return rate ? `IPCA + ${fmtNum(rate)}%` : 'IPCA';
  return rate ? `Pré ${fmtNum(rate)}%` : 'Pré';
};

/** Cotização/liquidação de um título: diária → D+0/Imediata; senão "No vencimento". */
export const liquidezDoTitulo = (
  fi: Pick<FixedIncomeAssetWithAsset, 'liquidityType'>,
): { cotizacaoResgate: string; liquidacaoResgate: string } =>
  fi.liquidityType === 'DAILY'
    ? { cotizacaoResgate: 'D+0', liquidacaoResgate: 'Imediata' }
    : { cotizacaoResgate: 'No vencimento', liquidacaoResgate: 'No vencimento' };

type PortfolioComAsset = Awaited<
  ReturnType<typeof prisma.portfolio.findMany<{ include: { asset: true } }>>
>[number];

interface NotesReserva {
  cotizacaoResgate?: string;
  liquidacaoResgate?: string;
  vencimento?: string;
  benchmark?: string;
}

/** Saldo bruto (soma de totalInvested) — a base do % da carteira de hoje. */
async function saldoBrutoDoUsuario(userId: string): Promise<number> {
  const allPortfolio = await prisma.portfolio.findMany({
    where: { userId },
    include: { asset: true },
  });
  return allPortfolio.reduce((sum, item) => sum + item.totalInvested, 0);
}

async function transacoesDe(userId: string, portfolio: PortfolioComAsset[]) {
  const assetIds = portfolio.map((p) => p.assetId).filter((id): id is string => id !== null);
  return assetIds.length > 0
    ? prisma.stockTransaction.findMany({
        where: {
          userId,
          assetId: { in: assetIds },
          type: { in: ['compra', 'venda'] },
        },
        orderBy: {
          date: 'desc',
        },
      })
    : [];
}

type Transacao = Awaited<ReturnType<typeof transacoesDe>>[number];

function fluxosPorAsset(transactions: Transacao[]) {
  const comprasMap = new Map<string, number>();
  const aportesMap = new Map<string, number>();
  const resgatesMap = new Map<string, number>();

  transactions.forEach((transaction) => {
    if (!transaction.assetId) return;
    if (transaction.type === 'compra') {
      const parsed = parseNotes(transaction.notes);
      const action = parsed?.operation?.action || 'compra';
      if (action === 'aporte') {
        aportesMap.set(
          transaction.assetId,
          (aportesMap.get(transaction.assetId) || 0) + transaction.total,
        );
      } else {
        comprasMap.set(
          transaction.assetId,
          (comprasMap.get(transaction.assetId) || 0) + transaction.total,
        );
      }
    } else if (transaction.type === 'venda') {
      resgatesMap.set(
        transaction.assetId,
        (resgatesMap.get(transaction.assetId) || 0) + transaction.total,
      );
    }
  });
  return { comprasMap, aportesMap, resgatesMap };
}

/** Notes da compra mais recente que tem algum metadado de reserva (valores crus). */
function notesReservaPorAsset(transactions: Transacao[]): Map<string, NotesReserva> {
  const out = new Map<string, NotesReserva>();
  for (const transaction of transactions) {
    if (transaction.type !== 'compra') continue;
    if (!transaction.assetId || !transaction.notes || out.has(transaction.assetId)) continue;
    const parsed = parseNotes(transaction.notes);
    if (!parsed) continue;
    if (
      parsed.cotizacaoResgate ||
      parsed.liquidacaoResgate ||
      parsed.vencimento ||
      parsed.benchmark
    ) {
      out.set(transaction.assetId, {
        cotizacaoResgate: parsed.cotizacaoResgate || undefined,
        liquidacaoResgate: parsed.liquidacaoResgate || undefined,
        vencimento: parsed.vencimento || undefined,
        benchmark: parsed.benchmark || undefined,
      });
    }
  }
  return out;
}

function totais(ativos: ReservaLinha[]): ReservaListagem {
  // Mesma convenção de fluxos da rentabilidade por ativo: base = inicial +
  // aportes − resgates; rendimento = atual − base. Fonte única do card e da
  // linha TOTAL GERAL.
  const totalValorInicial = ativos.reduce((sum, ativo) => sum + ativo.valorInicial, 0);
  const totalAporte = ativos.reduce((sum, ativo) => sum + ativo.aporte, 0);
  const totalResgate = ativos.reduce((sum, ativo) => sum + ativo.resgate, 0);
  const totalValorAtualizado = ativos.reduce((sum, ativo) => sum + ativo.valorAtualizado, 0);
  const saldoInicioMes = totalValorInicial;
  const totalBaseComFluxos = totalValorInicial + totalAporte - totalResgate;
  const rendimento = totalValorAtualizado - totalBaseComFluxos;
  const rentabilidade =
    totalBaseComFluxos > 0 ? (totalValorAtualizado / totalBaseComFluxos - 1) * 100 : 0;
  return { ativos, saldoInicioMes, rendimento, rentabilidade };
}

interface LinhaCtx {
  item: PortfolioComAsset;
  valorInicial: number;
  aporte: number;
  resgate: number;
  valorAtualizado: number;
  saldoBrutoTotal: number;
  nomePadrao: string;
  /** Fase 2: descrição do FI (o mesmo nome da Renda Fixa), antes do Asset.name. */
  nomeTitulo?: string | null;
  meta: {
    cotizacaoResgate: string;
    liquidacaoResgate: string;
    vencimento: Date;
    benchmark: string;
  };
}

const montarLinha = (c: LinhaCtx): ReservaLinha => {
  const percentualCarteira =
    c.saldoBrutoTotal > 0 ? (c.valorAtualizado / c.saldoBrutoTotal) * 100 : 0;
  // Rentabilidade descontando fluxos (fórmula do Wellington, 14/08/2026):
  // atual / (inicial + aportes − resgates) − 1.
  const baseComFluxos = c.valorInicial + c.aporte - c.resgate;
  const rentabilidade = baseComFluxos > 0 ? (c.valorAtualizado / baseComFluxos - 1) * 100 : 0;
  return {
    id: c.item.id,
    nome: c.nomeTitulo || c.item.asset?.name || c.nomePadrao,
    cotizacaoResgate: c.meta.cotizacaoResgate,
    liquidacaoResgate: c.meta.liquidacaoResgate,
    vencimento: c.meta.vencimento,
    benchmark: c.meta.benchmark,
    valorInicial: c.valorInicial,
    aporte: c.aporte,
    resgate: c.resgate,
    valorAtualizado: c.valorAtualizado,
    percentualCarteira: Math.round(percentualCarteira * 100) / 100,
    riscoAtivo: 0, // Baixo risco para reserva
    rentabilidade: Math.round(rentabilidade * 100) / 100,
  };
};

/** Cascata de valor de hoje para item SEM curva (PU do catálogo → manual → fluxos). */
const valorSemCurva = (item: PortfolioComAsset, valorCalculado: number): number => {
  const currentPrice = item.asset?.currentPrice ? Number(item.asset.currentPrice) : 0;
  const isCatalogTesouro = item.asset?.type === 'tesouro-direto';
  return isCatalogTesouro && currentPrice > 0 && item.quantity > 0
    ? currentPrice * item.quantity
    : item.avgPrice && item.avgPrice > 0 && item.quantity > 0
      ? item.avgPrice * item.quantity
      : valorCalculado;
};

/** Caminho de antes da fase 2 (chave desligada) — sem alteração de comportamento. */
async function listarHoje(userId: string, cat: CategoriaReserva): Promise<ReservaListagem> {
  const cfg = CONFIG[cat];

  const allUserPortfolio = await prisma.portfolio.findMany({
    where: { userId },
    include: { asset: true },
    orderBy: { lastUpdate: 'desc' },
  });

  // Catalog Tesouro Direto tem asset.type='tesouro-direto' (compartilhado entre usuários),
  // então não casa com os filtros padrão de reserva. Identificamos o destino pela nota da
  // transação de compra (operacao/route.ts grava metadata.tesouroDestino).
  const userPurchaseNotes = await prisma.stockTransaction.findMany({
    where: { userId, type: 'compra', notes: { not: null } },
    select: { assetId: true, notes: true },
  });
  const tesouroReservaAssetIds = new Set<string>();
  for (const tx of userPurchaseNotes) {
    if (!tx.assetId || !tx.notes) continue;
    const parsed = parseNotes(tx.notes);
    if (parsed?.tesouroDestino === cfg.tesouroDestino) tesouroReservaAssetIds.add(tx.assetId);
  }

  const portfolio = allUserPortfolio.filter((item) => {
    if (!item.asset) return false;
    if (cfg.selecionaHoje(item.asset)) return true;
    if (item.assetId && tesouroReservaAssetIds.has(item.assetId)) return true;
    return false;
  });

  // Pricer compartilhado: mesma marcação na curva (CDI/IPCA/Tesouro PU) da aba Renda Fixa.
  const pricer = await createFixedIncomePricer(userId);
  const saldoBrutoTotal = await saldoBrutoDoUsuario(userId);
  const transactions = await transacoesDe(userId, portfolio);
  const notesMap = notesReservaPorAsset(transactions);
  const { comprasMap, aportesMap, resgatesMap } = fluxosPorAsset(transactions);

  const ativos = portfolio.map((item) => {
    const assetId = item.assetId || '';
    const totalCompras = assetId ? comprasMap.get(assetId) || 0 : 0;
    const aporte = assetId ? aportesMap.get(assetId) || 0 : 0;
    const resgate = assetId ? resgatesMap.get(assetId) || 0 : 0;
    const valorInicial = totalCompras > 0 ? totalCompras : item.totalInvested;
    const valorAtualizadoCalculado = valorInicial + aporte - resgate;
    // CDB/LCI/LCA na curva exige rendimento acumulado (calc > investido); Tesouro
    // via FI aceita qualquer valor > 0 (PU pode ficar abaixo do par).
    const fixedIncome = item.assetId ? pricer.fixedIncomeByAssetId.get(item.assetId) : undefined;
    const fiCurveValue = fixedIncome ? pricer.getCurrentValue(fixedIncome) : 0;
    const isFiTesouro = Boolean(fixedIncome?.tesouroBondType);
    const fiHasCurve = fixedIncome
      ? isFiTesouro
        ? fiCurveValue > 0
        : fiCurveValue > fixedIncome.investedAmount
      : false;
    const valorAtualizado = fiHasCurve
      ? fiCurveValue
      : valorSemCurva(item, valorAtualizadoCalculado);

    // Defaults de hoje quando a compra tem algum metadado: D+0 / Imediata / CDI.
    const notes = item.assetId ? notesMap.get(item.assetId) : undefined;
    return montarLinha({
      item,
      valorInicial,
      aporte,
      resgate,
      valorAtualizado,
      saldoBrutoTotal,
      nomePadrao: cfg.nomePadrao,
      meta: {
        cotizacaoResgate: notes?.cotizacaoResgate || 'D+0',
        liquidacaoResgate: notes?.liquidacaoResgate || 'Imediata',
        vencimento: notes?.vencimento ? new Date(notes.vencimento) : new Date(),
        benchmark: notes?.benchmark || 'CDI',
      },
    });
  });

  aplicarCamposMovido(
    ativos,
    await camposMovidoPorLinha(
      userId,
      cat,
      portfolio.map((p) => ({ id: p.id, categoriaOverride: p.categoriaOverride, asset: p.asset })),
    ),
  );

  return totais(ativos);
}

/** Fase 2 (chave ligada): aba efetiva pelo override, valoração única e metadados do título. */
async function listarFase2(userId: string, cat: CategoriaReserva): Promise<ReservaListagem> {
  const cfg = CONFIG[cat];

  const grupo = await prisma.portfolio.findMany({
    where: wherePortfolioGrupoCaixaRf(userId),
    include: { asset: true },
    orderBy: { lastUpdate: 'desc' },
  });
  const destinos = await reservaDestinoPorAsset(
    userId,
    grupo.map((p) => p.assetId).filter((id): id is string => Boolean(id)),
  );
  const baseCtxDe = (p: PortfolioComAsset): BaseCtx => ({
    reservaDestino: (p.assetId ? destinos.get(p.assetId) : undefined) ?? null,
  });
  const portfolio = filtrarDaCategoria(grupo, cat, baseCtxDe);

  const pricer = await createFixedIncomePricer(userId);
  const saldoBrutoTotal = await saldoBrutoDoUsuario(userId);
  const transactions = await transacoesDe(userId, portfolio);
  const notesMap = notesReservaPorAsset(transactions);
  const { comprasMap, aportesMap, resgatesMap } = fluxosPorAsset(transactions);

  const ativos = portfolio.map((item) => {
    const assetId = item.assetId || '';
    const totalCompras = assetId ? comprasMap.get(assetId) || 0 : 0;
    const aporte = assetId ? aportesMap.get(assetId) || 0 : 0;
    const resgate = assetId ? resgatesMap.get(assetId) || 0 : 0;
    const valorInicial = totalCompras > 0 ? totalCompras : item.totalInvested;
    const fixedIncome = item.assetId ? pricer.fixedIncomeByAssetId.get(item.assetId) : undefined;
    const notes = item.assetId ? notesMap.get(item.assetId) : undefined;

    const valorAtualizado = fixedIncome
      ? getFixedIncomeCurrentValue(fixedIncome, item, item.asset, pricer.getCurrentValue).valor
      : valorSemCurva(item, valorInicial + aporte - resgate);

    const meta = fixedIncome
      ? {
          ...liquidezDoTitulo(fixedIncome),
          ...(notes?.cotizacaoResgate ? { cotizacaoResgate: notes.cotizacaoResgate } : {}),
          ...(notes?.liquidacaoResgate ? { liquidacaoResgate: notes.liquidacaoResgate } : {}),
          vencimento: notes?.vencimento
            ? new Date(notes.vencimento)
            : new Date(fixedIncome.maturityDate),
          benchmark: notes?.benchmark || benchmarkDoTitulo(fixedIncome),
        }
      : {
          cotizacaoResgate: notes?.cotizacaoResgate || 'D+0',
          liquidacaoResgate: notes?.liquidacaoResgate || 'Imediata',
          vencimento: notes?.vencimento ? new Date(notes.vencimento) : new Date(),
          benchmark: notes?.benchmark || 'CDI',
        };

    const linha = montarLinha({
      item,
      valorInicial,
      aporte,
      resgate,
      valorAtualizado,
      saldoBrutoTotal,
      nomePadrao: cfg.nomePadrao,
      // Mesmo nome da Renda Fixa (renda-fixa/route: description || asset.name): o título não
      // muda de nome ao trocar de aba. Sem FI, igual a antes.
      nomeTitulo: fixedIncome?.description,
      meta,
    });
    if (
      isSaldoSemTitulo(item.asset, { temRendaFixa: Boolean(fixedIncome), baseCtx: baseCtxDe(item) })
    ) {
      linha.saldoEmConta = true;
    }
    return linha;
  });

  aplicarCamposMovido(
    ativos,
    await camposMovidoPorLinha(
      userId,
      cat,
      portfolio.map((p) => ({
        id: p.id,
        categoriaOverride: p.categoriaOverride,
        asset: p.asset,
        temRendaFixa: Boolean(p.assetId && pricer.fixedIncomeByAssetId.has(p.assetId)),
        baseCtx: baseCtxDe(p),
      })),
    ),
  );

  return totais(ativos);
}

export async function listarReserva(
  userId: string,
  cat: CategoriaReserva,
): Promise<ReservaListagem> {
  return moverCaixaRfHabilitado() ? listarFase2(userId, cat) : listarHoje(userId, cat);
}
