import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { Prisma } from '@prisma/client';

/** FGC coverage limit per CPF per institution (CNPJ). */
const FGC_LIMIT_PER_INSTITUTION = 250_000;

/** FGC total coverage cap per CPF across all institutions (renewed every 4 years). */
const FGC_TOTAL_CAP = 1_000_000;

/**
 * Fixed income types covered by FGC.
 * Covered: CDB, LC, LCI, LCA, RDB, DPGE, LIG, RDC
 * NOT covered: CRI, CRA, LF, LFS (Letras Financeiras > R$250k by definition)
 */
const FGC_COVERED_PREFIXES = ['CDB', 'LC', 'LCI', 'LCA', 'RDB', 'DPGE', 'LIG', 'RDC'];

function isFgcCovered(fixedIncomeType: string): boolean {
  // FixedIncomeType enum values are like CDB_PRE, LCI_HIB, etc.
  const prefix = fixedIncomeType.split('_')[0];
  return FGC_COVERED_PREFIXES.includes(prefix);
}

function getProductLabel(fixedIncomeType: string): string {
  return fixedIncomeType.split('_')[0];
}

const DAY_MS = 24 * 60 * 60 * 1000;

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  // 1. Fetch all fixed income assets for the user
  let fixedIncomeAssets: Awaited<ReturnType<typeof prisma.fixedIncomeAsset.findMany>> = [];
  try {
    fixedIncomeAssets = await prisma.fixedIncomeAsset.findMany({
      where: { userId: targetUserId },
      include: { asset: true },
    });
  } catch (error) {
    const prismaError = error as Prisma.PrismaClientKnownRequestError;
    if (prismaError?.code !== 'P2021') throw error;
    fixedIncomeAssets = [];
  }

  // 2. Fetch portfolio entries for FGC-relevant assets.
  // Includes emergency/opportunity reserves to pick up Poupança e Conta Corrente,
  // que são cobertas pelo FGC mesmo sem um FixedIncomeAsset associado.
  const portfolio = await prisma.portfolio.findMany({
    where: {
      userId: targetUserId,
      asset: { type: { in: ['bond', 'cash', 'emergency', 'opportunity'] } },
    },
    include: { asset: true },
  });

  // 3. Build map of fixedIncomeAsset by assetId
  const fixedIncomeByAssetId = new Map(fixedIncomeAssets.map((fi) => [fi.assetId, fi]));

  // 4. Get institution info from transaction notes
  const assetIds = portfolio.map((p) => p.assetId).filter((id): id is string => id !== null);

  const transactions =
    assetIds.length > 0
      ? await prisma.stockTransaction.findMany({
          where: {
            userId: targetUserId,
            assetId: { in: assetIds },
            type: 'compra',
          },
          orderBy: { date: 'asc' },
          select: {
            assetId: true,
            notes: true,
          },
        })
      : [];

  // Extract instituicaoId from transaction notes
  const institutionIdByAssetId = new Map<string, string>();
  for (const tx of transactions) {
    if (!tx.assetId || institutionIdByAssetId.has(tx.assetId)) continue;
    if (!tx.notes) continue;
    try {
      const parsed = JSON.parse(tx.notes);
      if (parsed.operation?.instituicaoId) {
        institutionIdByAssetId.set(tx.assetId, parsed.operation.instituicaoId);
      }
    } catch {
      // skip malformed notes
    }
  }

  // 5. Fetch institution details
  const institutionIds = [...new Set(institutionIdByAssetId.values())];
  const institutions =
    institutionIds.length > 0
      ? await prisma.institution.findMany({
          where: { id: { in: institutionIds } },
        })
      : [];
  const institutionById = new Map(institutions.map((i) => [i.id, i]));

  // 6. Calculate current value for each fixed income asset
  const today = new Date();
  const normalizeDate = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const calculateCurrentValue = (
    fi: (typeof fixedIncomeAssets)[number],
    portfolioItem: (typeof portfolio)[number],
  ) => {
    // Use manually updated value if available
    if (portfolioItem.avgPrice > 0 && portfolioItem.quantity > 0) {
      return portfolioItem.avgPrice * portfolioItem.quantity;
    }
    // Otherwise calculate from rate
    const start = normalizeDate(new Date(fi.startDate));
    const maturity = normalizeDate(new Date(fi.maturityDate));
    const current = normalizeDate(today);
    const endDate = current.getTime() > maturity.getTime() ? maturity : current;
    if (endDate.getTime() <= start.getTime()) return fi.investedAmount;
    const days = Math.floor((endDate.getTime() - start.getTime()) / DAY_MS);
    const rate = fi.annualRate / 100;
    return Math.round(fi.investedAmount * Math.pow(1 + rate, days / 365) * 100) / 100;
  };

  // 7. Build FGC coverage data grouped by institution
  interface AssetFgcInfo {
    id: string;
    nome: string;
    produto: string;
    valorAtual: number;
    valorInvestido: number;
    vencimento: string | null;
    coberto: boolean;
    isentoIR: boolean;
  }

  interface InstitutionGroup {
    instituicaoId: string;
    instituicaoNome: string;
    cnpj: string | null;
    ativos: AssetFgcInfo[];
    totalCoberto: number;
    totalNaoCoberto: number;
    totalValor: number;
    limiteFgc: number;
    percentualUtilizado: number;
    excedente: number;
  }

  const institutionGroups = new Map<string, InstitutionGroup>();

  // Poupança e conta corrente são cobertas pelo FGC ("depósitos à vista" no caso da conta corrente)
  // e não têm FixedIncomeAsset associado — derivamos a info do símbolo do asset.
  const getDepositInfo = (symbol: string | null) => {
    if (!symbol) return null;
    if (symbol.startsWith('POUPANCA-')) {
      return { produto: 'Poupança', isentoIR: true };
    }
    if (symbol.startsWith('CONTA-CORRENTE-')) {
      return { produto: 'Conta Corrente', isentoIR: false };
    }
    return null;
  };

  for (const item of portfolio) {
    if (!item.assetId) continue;
    const fi = fixedIncomeByAssetId.get(item.assetId);

    const instId = institutionIdByAssetId.get(item.assetId) || 'desconhecida';
    const inst = instId !== 'desconhecida' ? institutionById.get(instId) : null;
    const instName = inst?.nome || 'Instituição não identificada';
    const cnpj = inst?.cnpj || null;

    let asset: AssetFgcInfo;
    let valorAtual: number;
    let coberto: boolean;

    if (fi) {
      valorAtual = calculateCurrentValue(fi, item);
      coberto = isFgcCovered(fi.type);
      asset = {
        id: item.id,
        nome: fi.description || item.asset?.name || 'Renda Fixa',
        produto: getProductLabel(fi.type),
        valorAtual,
        valorInvestido: fi.investedAmount,
        vencimento: fi.maturityDate.toISOString(),
        coberto,
        isentoIR: fi.taxExempt,
      };
    } else {
      const deposit = getDepositInfo(item.asset?.symbol ?? null);
      if (!deposit) continue;
      valorAtual = item.totalInvested ?? item.avgPrice * item.quantity;
      coberto = true;
      asset = {
        id: item.id,
        nome: item.asset?.name || deposit.produto,
        produto: deposit.produto,
        valorAtual,
        valorInvestido: valorAtual,
        vencimento: null,
        coberto,
        isentoIR: deposit.isentoIR,
      };
    }

    const groupKey = inst?.cnpj || instId; // Group by CNPJ when available (same CNPJ = same FGC limit)
    if (!institutionGroups.has(groupKey)) {
      institutionGroups.set(groupKey, {
        instituicaoId: instId,
        instituicaoNome: instName,
        cnpj,
        ativos: [],
        totalCoberto: 0,
        totalNaoCoberto: 0,
        totalValor: 0,
        limiteFgc: FGC_LIMIT_PER_INSTITUTION,
        percentualUtilizado: 0,
        excedente: 0,
      });
    }

    const group = institutionGroups.get(groupKey)!;
    group.ativos.push(asset);

    if (coberto) {
      group.totalCoberto += valorAtual;
    } else {
      group.totalNaoCoberto += valorAtual;
    }
    group.totalValor += valorAtual;
  }

  // Calculate percentages and excedent per institution
  const instituicoes = Array.from(institutionGroups.values()).map((group) => {
    const percentual = (group.totalCoberto / FGC_LIMIT_PER_INSTITUTION) * 100;
    const excedente = Math.max(0, group.totalCoberto - FGC_LIMIT_PER_INSTITUTION);
    return {
      ...group,
      percentualUtilizado: Math.round(percentual * 100) / 100,
      excedente: Math.round(excedente * 100) / 100,
      totalCoberto: Math.round(group.totalCoberto * 100) / 100,
      totalNaoCoberto: Math.round(group.totalNaoCoberto * 100) / 100,
      totalValor: Math.round(group.totalValor * 100) / 100,
    };
  });

  // Sort by total covered value descending
  instituicoes.sort((a, b) => b.totalCoberto - a.totalCoberto);

  // 8. Calculate global summary
  const totalCoberto = instituicoes.reduce(
    (sum, i) => sum + Math.min(i.totalCoberto, FGC_LIMIT_PER_INSTITUTION),
    0,
  );
  const totalEfetivamenteCoberto = Math.min(totalCoberto, FGC_TOTAL_CAP);
  const totalNaoCoberto = instituicoes.reduce((sum, i) => sum + i.totalNaoCoberto, 0);
  const totalExcedente = instituicoes.reduce((sum, i) => sum + i.excedente, 0);
  const totalValorRendaFixa = instituicoes.reduce((sum, i) => sum + i.totalValor, 0);
  const totalAtivos = instituicoes.reduce((sum, i) => sum + i.ativos.length, 0);

  return NextResponse.json({
    resumo: {
      totalEfetivamenteCoberto: Math.round(totalEfetivamenteCoberto * 100) / 100,
      totalNaoCoberto: Math.round(totalNaoCoberto * 100) / 100,
      totalExcedente: Math.round(totalExcedente * 100) / 100,
      totalValorRendaFixa: Math.round(totalValorRendaFixa * 100) / 100,
      percentualCoberto:
        totalValorRendaFixa > 0
          ? Math.round((totalEfetivamenteCoberto / totalValorRendaFixa) * 100 * 100) / 100
          : 0,
      limiteGlobal: FGC_TOTAL_CAP,
      limitePorInstituicao: FGC_LIMIT_PER_INSTITUTION,
      totalAtivos,
      totalInstituicoes: instituicoes.length,
    },
    instituicoes,
  });
});
