import { NextRequest, NextResponse } from 'next/server';
import { ehIsentoDeIr, ehTesouroDireto } from '@/services/ir/fixedIncomeIR';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { createFixedIncomePricer } from '@/services/portfolio/fixedIncomePricing';
import { valuatePortfolioItem } from '@/services/portfolio/itemValuation';
import { getAssetPrices } from '@/services/pricing/assetPriceService';
import { getCotacaoDolarHoje } from '@/services/market/cambioUsdBrl';
import { resumirSemCobertura, type ItemSemCobertura } from '@/services/analises/semCoberturaFgc';
import { aceitaEmissor, isFgcCovered, produtoFgc } from '@/lib/fgc/produtosCobertos';
import {
  agruparCoberturaFgc,
  type InstRef,
  type ItemFgc,
} from '@/services/analises/agruparCoberturaFgc';

const SIMBOLO_PLUGGY_RF = /^PLUGGY-RF-/i;

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  // 1. Pricer compartilhado: carrega todos os FixedIncomeAssets do usuário (qualquer aba)
  // e expõe marcação na curva (CDI/IPCA/Tesouro PU), igual à aba Renda Fixa.
  const pricer = await createFixedIncomePricer(targetUserId);
  const { fixedIncomeAssets, fixedIncomeByAssetId } = pricer;

  // 2. Fetch portfolio entries para FGC: qualquer item com FixedIncomeAsset associado
  // (independente de asset.type — pega CDB/LCI/LCA registrados em outras abas) + Poupança
  // e Conta Corrente em reservas (cobertas pelo FGC sem FI associado).
  const fixedIncomeAssetIdSet = new Set(fixedIncomeAssets.map((fi) => fi.assetId));
  const portfolio = await prisma.portfolio.findMany({
    where: {
      userId: targetUserId,
      OR: [
        { assetId: { in: Array.from(fixedIncomeAssetIdSet) } },
        { asset: { type: { in: ['cash', 'emergency', 'opportunity'] } } },
      ],
    },
    include: { asset: true },
  });

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

  // 5. Emissor gravado em cada FI (o tipo do pricer não traz a coluna) e, do Open Finance, o
  // subtipo e o emissor (texto) que o Pluggy mandou para cada título.
  const fiIds = fixedIncomeAssets.map((fi) => fi.id);
  const [emissoresFi, bankInvestments] =
    fiIds.length > 0
      ? await Promise.all([
          prisma.fixedIncomeAsset.findMany({
            where: { userId: targetUserId, id: { in: fiIds } },
            select: { id: true, emissorInstitutionId: true },
          }),
          prisma.bankInvestment.findMany({
            where: { userId: targetUserId, fixedIncomeAssetId: { in: fiIds } },
            select: { fixedIncomeAssetId: true, subtype: true, issuer: true },
          }),
        ])
      : [[], []];
  const emissorIdByFiId = new Map<string, string>();
  for (const fi of emissoresFi) {
    if (fi.emissorInstitutionId) emissorIdByFiId.set(fi.id, fi.emissorInstitutionId);
  }
  const bankInvestmentByFiId = new Map<string, { subtype: string | null; issuer: string | null }>();
  for (const bi of bankInvestments) {
    if (bi.fixedIncomeAssetId && !bankInvestmentByFiId.has(bi.fixedIncomeAssetId)) {
      bankInvestmentByFiId.set(bi.fixedIncomeAssetId, { subtype: bi.subtype, issuer: bi.issuer });
    }
  }

  // 6. Corretoras (notes) e emissores (FI) no catálogo.
  const emissorIds = [...emissorIdByFiId.values()];
  const institutionIds = [...new Set([...institutionIdByAssetId.values(), ...emissorIds])];
  const institutions =
    institutionIds.length > 0
      ? await prisma.institution.findMany({
          where: { id: { in: institutionIds } },
          select: {
            id: true,
            nome: true,
            cnpj: true,
            cnpjCalculado: true,
            tipoBacen: true,
            codigo: true,
            conglomeradoBacen: true,
          },
        })
      : [];
  const institutionById = new Map<string, InstRef>(
    institutions.map((i) => [
      i.id,
      {
        id: i.id,
        nome: i.nome,
        cnpj: i.cnpj,
        cnpjCalculado: i.cnpjCalculado,
        tipoBacen: i.tipoBacen,
        codigo: i.codigo,
        conglomerado: i.conglomeradoBacen,
      },
    ]),
  );
  /** Corretora das notes; fora do catálogo vira um grupo com nome genérico (como antes). */
  const corretoraRef = (instId: string | undefined): InstRef | null => {
    if (!instId) return null;
    return (
      institutionById.get(instId) ?? {
        id: instId,
        nome: 'Instituição não identificada',
        cnpj: null,
        cnpjCalculado: false,
        tipoBacen: null,
        codigo: null,
        conglomerado: null,
      }
    );
  };

  // 7. Valor atual com a mesma prioridade da aba Renda Fixa: marcação na curva quando
  // produz valor > investido (rendimento acumulado), caso contrário avgPrice*quantity
  // (edição manual ou valor inicial). Não usar `avgPrice > 0` como gatilho único: na
  // criação avgPrice = valorAplicado, e a curva nunca seria preferida.
  // Tesouro Direto (tesouroBondType setado) é exceção: valorCalculado é PU/PU0 e pode
  // ficar abaixo do investido em janelas de alta de juros — usamos sempre que > 0
  // para refletir a marcação a mercado real.
  const calculateCurrentValue = (
    fi: (typeof fixedIncomeAssets)[number],
    portfolioItem: (typeof portfolio)[number],
  ) => {
    const valorCalculado = pricer.getCurrentValue(fi);
    const isFiTesouro = Boolean(fi.tesouroBondType);
    if (isFiTesouro && valorCalculado > 0) return valorCalculado;
    if (!isFiTesouro && valorCalculado > fi.investedAmount) return valorCalculado;
    if (portfolioItem.avgPrice > 0 && portfolioItem.quantity > 0) {
      return portfolioItem.avgPrice * portfolioItem.quantity;
    }
    return valorCalculado;
  };

  // 8. Itens da cobertura (renda fixa com FI + depósitos), agrupados por emissor adiante.
  const itensFgc: ItemFgc[] = [];
  // Fora do FGC (ClickUp 86e2vvde3): Tesouro aqui; as demais classes depois do loop.
  const semCoberturaItens: ItemSemCobertura[] = [];

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
    const corretora = corretoraRef(institutionIdByAssetId.get(item.assetId));
    const symbol = item.asset?.symbol ?? null;

    if (fi) {
      // Tesouro Direto não é coberto pelo FGC (tem garantia do Tesouro Nacional).
      // Filtrar fora pra não poluir esta aba — relevante para Tesouro+Reserva, que cria
      // FixedIncomeAsset com tesouroBondType preenchido.
      if (fi.tesouroBondType) {
        semCoberturaItens.push({
          classe: 'tesouroDireto',
          valorAtual: calculateCurrentValue(fi, item),
        });
        continue;
      }
      const valorAtual = calculateCurrentValue(fi, item);
      const coberto = isFgcCovered(fi.type);
      const bi = bankInvestmentByFiId.get(fi.id) ?? null;
      const openFinance = Boolean(bi) || SIMBOLO_PLUGGY_RF.test(symbol ?? '');
      const aceita = aceitaEmissor({
        type: fi.type,
        tesouroBondType: fi.tesouroBondType,
        assetSymbol: symbol,
        pluggySubtype: bi?.subtype ?? null,
      });
      const emissorId = emissorIdByFiId.get(fi.id);
      // Emissor apagado do catálogo (ou produto que não aceita emissor): fica no fallback.
      const emissor = aceita && emissorId ? (institutionById.get(emissorId) ?? null) : null;
      itensFgc.push({
        ativo: {
          id: item.id,
          nome: fi.description || item.asset?.name || 'Renda Fixa',
          produto: produtoFgc(fi.type),
          valorAtual,
          valorInvestido: fi.investedAmount,
          vencimento: fi.maturityDate.toISOString(),
          coberto,
          isentoIR: ehIsentoDeIr(
            fi.type,
            ehTesouroDireto(fi.tesouroBondType, symbol),
            fi.taxExempt,
          ),
        },
        coberto,
        valorAtual,
        temFi: true,
        aceita,
        deposito: false,
        emissor,
        corretora,
        origem: openFinance ? 'openFinance' : 'manual',
        emissorInformadoTexto: openFinance && !emissor ? bi?.issuer?.trim() || null : null,
      });
    } else {
      const deposit = getDepositInfo(symbol);
      if (!deposit) continue;
      const valorAtual = item.totalInvested ?? item.avgPrice * item.quantity;
      itensFgc.push({
        ativo: {
          id: item.id,
          nome: item.asset?.name || deposit.produto,
          produto: deposit.produto,
          valorAtual,
          valorInvestido: valorAtual,
          vencimento: null,
          coberto: true,
          isentoIR: deposit.isentoIR,
        },
        coberto: true,
        valorAtual,
        temFi: false,
        aceita: false,
        deposito: true,
        emissor: null,
        corretora,
        origem: 'manual',
        emissorInformadoTexto: null,
      });
    }
  }

  // 7b. O resto da carteira (ações, FIIs, fundos, cripto, previdência...) não tem FGC. Valor
  // pela mesma cascata das abas (valuatePortfolioItem); imóveis/bens ficam fora (não são
  // investimento financeiro) e posição em US$ sem câmbio do dia também (nunca US$ como R$).
  const outros = await prisma.portfolio.findMany({
    where: {
      userId: targetUserId,
      quantity: { gt: 0 },
      id: { notIn: portfolio.map((p) => p.id) },
    },
    include: { asset: true },
  });
  const simbolosOutros = [
    ...new Set(outros.map((p) => p.asset?.symbol).filter((s): s is string => Boolean(s))),
  ];
  const [cotacoesOutros, cotacaoHoje] = await Promise.all([
    simbolosOutros.length > 0
      ? getAssetPrices(simbolosOutros, { useBrapiFallback: true })
      : Promise.resolve(new Map<string, number>()),
    outros.length > 0 ? getCotacaoDolarHoje().catch(() => null) : Promise.resolve(null),
  ]);
  for (const item of outros) {
    const symbol = item.asset?.symbol;
    const v = valuatePortfolioItem({
      item,
      asset: item.asset,
      quote: symbol ? (cotacoesOutros.get(symbol) ?? null) : null,
      cotacaoDolar: cotacaoHoje?.taxa ?? null,
    });
    if (!v.contaNoSaldoBruto || v.semCambio) continue;
    semCoberturaItens.push({ classe: v.categoria, valorAtual: v.valorAtualBRL });
  }

  // 9. Grupos por emissor (raiz do CNPJ), totais e avisos de conglomerado.
  const { grupos, avisosConglomerado, resumo, totais } = agruparCoberturaFgc(itensFgc);

  return NextResponse.json({
    resumo,
    instituicoes: grupos,
    avisosConglomerado,
    semCobertura: resumirSemCobertura(semCoberturaItens, {
      totalValor: totais.totalValorRendaFixa,
      totalEfetivamenteCoberto: totais.totalEfetivamenteCoberto,
    }),
  });
});
