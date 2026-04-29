import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { getDividends } from '@/services/pricing/dividendService';
import {
  apurarRendaVariavel,
  type RvTransaction,
  type RendaVariavelCategory,
} from '@/services/ir/rendaVariavelIR';
import { apurarStocksUs, type UsTransaction } from '@/services/ir/stocksUsIR';
import { apurarCripto, type CriptoTransaction } from '@/services/ir/criptoIR';
import { withErrorHandler } from '@/utils/apiErrorHandler';

/**
 * Resumo anual consolidado de IR (Fase 6).
 *
 * Agrega o IR projetado/recolhido no ano e classifica os proventos por tipo
 * de tributação (isento / tributável / exclusiva). Útil pra "fechar" o ano
 * fiscal mesmo que não gere a DAA.
 *
 * Escopo MVP — acompanhamento, não declaração:
 *  - Soma de IR por categoria a partir das fases 1-5.
 *  - Proventos classificados por tipo: dividendo BR / FII / JCP / outros.
 *  - NÃO inclui posição patrimonial em 31/12 de anos passados (exigiria
 *    reconstrução histórica). Para o ano corrente, o usuário consulta a
 *    aba carteira diretamente.
 *  - NÃO gera arquivo da DAA — apenas retorna os números pra transcrição
 *    manual.
 */

interface AnualResumo {
  year: number;
  asOf: string;
  irPorCategoria: {
    rendaVariavelBr: number; // ações + ETF + FII (DARF mensal)
    stocksUs: number; // ganho de capital ME
    cripto: number; // ganho de capital cripto
    comecotas: number; // só inclui cobranças DENTRO do ano
    rendaFixa: number; // sempre 0 — banco retém; informativo apenas
    total: number;
  };
  rendimentos: {
    isentos: {
      dividendosAcoesBr: number;
      rendimentosFii: number;
      total: number;
    };
    tributacaoExclusiva: {
      jcp: number; // 15% IRRF na fonte (já líquido) — declarável separadamente
      total: number;
    };
    totalRecebido: number;
  };
  observacoes: string[];
}

function categorizeBR(
  fromStockTable: boolean,
  ticker: string | null,
  assetType: string | null,
): RendaVariavelCategory | null {
  if (!ticker) return null;
  const upper = ticker.toUpperCase();
  if (fromStockTable) return upper.endsWith('11') ? 'fii' : 'acao_br';
  if (assetType === 'etf' && upper.endsWith('11')) return 'etf_br';
  return null;
}

interface StoredOperation {
  moeda?: string | null;
  cotacaoMoeda?: number | null;
}

function parseFx(notes: string | null): number | null {
  if (!notes) return null;
  try {
    const parsed = JSON.parse(notes) as { operation?: StoredOperation };
    const op = parsed.operation;
    if (!op || (op.moeda && op.moeda.toUpperCase() !== 'USD')) return null;
    return op.cotacaoMoeda && Number.isFinite(op.cotacaoMoeda) && op.cotacaoMoeda > 0
      ? op.cotacaoMoeda
      : null;
  } catch {
    return null;
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);
  const { searchParams } = new URL(request.url);
  const yearParam = searchParams.get('year');
  const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
  if (!Number.isFinite(year) || year < 1900 || year > 2200) {
    return NextResponse.json({ error: 'year inválido' }, { status: 400 });
  }

  // Carrega tudo de uma vez — apuração reusa os serviços puros das fases 1-5.
  const [transactions, portfolio, manualProventos] = await Promise.all([
    prisma.stockTransaction.findMany({
      where: { userId: targetUserId },
      include: { stock: true, asset: true },
      orderBy: { date: 'asc' },
    }),
    prisma.portfolio.findMany({
      where: { userId: targetUserId },
      include: { stock: true, asset: true },
    }),
    prisma.portfolioProvento.findMany({
      where: { userId: targetUserId },
    }),
  ]);

  // ---- Fase 2: Renda Variável BR (ações/FII/ETF) ----
  const rvTxs: RvTransaction[] = [];
  for (const tx of transactions) {
    if (tx.type !== 'compra' && tx.type !== 'venda') continue;
    const ticker = tx.stock?.ticker || tx.asset?.symbol || null;
    const fromStockTable = Boolean(tx.stock);
    const assetType = tx.asset?.type ?? null;
    const cat = categorizeBR(fromStockTable, ticker, assetType);
    if (!cat) continue;
    rvTxs.push({
      date: tx.date,
      type: tx.type,
      symbol: ticker as string,
      category: cat,
      quantity: tx.quantity,
      price: Number(tx.price),
      fees: tx.fees ? Number(tx.fees) : 0,
    });
  }
  const rvApur = apurarRendaVariavel(rvTxs);
  const rvAnual = rvApur.meses
    .filter((m) => m.year === year)
    .reduce((s, m) => s + m.irTotalDevido, 0);

  // ---- Fase 3: Stocks US/REIT ----
  const usTxs: UsTransaction[] = [];
  for (const tx of transactions) {
    if (tx.type !== 'compra' && tx.type !== 'venda') continue;
    const t = tx.asset?.type;
    if (t !== 'stock' && t !== 'reit') continue;
    const fx = parseFx(tx.notes);
    if (!fx) continue;
    usTxs.push({
      date: tx.date,
      type: tx.type,
      symbol: tx.asset?.symbol || 'UNKNOWN',
      quantity: tx.quantity,
      priceUsd: Number(tx.price),
      fxRate: fx,
      feesBrl: tx.fees ? Number(tx.fees) : 0,
    });
  }
  const usApur = apurarStocksUs(usTxs);
  const usAnual = usApur.meses.filter((m) => m.year === year).reduce((s, m) => s + m.irDevido, 0);

  // ---- Fase 4: Cripto ----
  const criptoTxs: CriptoTransaction[] = [];
  for (const tx of transactions) {
    if (tx.type !== 'compra' && tx.type !== 'venda') continue;
    const t = tx.asset?.type;
    if (t !== 'crypto' && t !== 'currency' && t !== 'metal' && t !== 'commodity') continue;
    criptoTxs.push({
      date: tx.date,
      type: tx.type,
      symbol: tx.asset?.symbol || 'UNKNOWN',
      quantity: tx.quantity,
      price: Number(tx.price),
      fees: tx.fees ? Number(tx.fees) : 0,
    });
  }
  const criptoApur = apurarCripto(criptoTxs);
  const criptoAnual = criptoApur.meses
    .filter((m) => m.year === year)
    .reduce((s, m) => s + m.irDevido, 0);

  // ---- Fase 5: Come-cotas — só conta se a cobrança CAI no ano consultado ----
  // Como projetarComecotas só calcula a próxima, aqui contamos as duas datas
  // (maio e novembro) que efetivamente cairiam no ano e que o pricer indica.
  // Mais simples: aproximamos como 0 quando year < currentYear (já passou,
  // não temos histórico) e a projeção corrente quando year === currentYear.
  // Refinar quando tivermos histórico de come-cotas cobradas.
  let comecotasAnual = 0;
  const currentYear = new Date().getFullYear();
  if (year === currentYear) {
    // Calcula rendimento de fundos hoje × 15% × (eventos restantes do ano).
    // Aproximação grosseira pra não duplicar lógica; o endpoint dedicado
    // /ir-comecotas tem a projeção completa.
    const today = new Date();
    let eventosRestantes = 0;
    if (today.getMonth() < 4)
      eventosRestantes = 2; // maio + novembro pela frente
    else if (today.getMonth() < 10) eventosRestantes = 1; // só novembro
    const rendimentoTotalFundos = portfolio
      .filter((p) => p.asset?.type === 'fund' || p.asset?.type === 'funds')
      .reduce((s, p) => {
        const vAplic = p.totalInvested || p.quantity * p.avgPrice;
        const cp = p.asset?.currentPrice ? Number(p.asset.currentPrice) : p.avgPrice;
        const vAtual = cp && p.quantity > 0 ? p.quantity * cp : vAplic;
        return s + Math.max(0, vAtual - vAplic);
      }, 0);
    // Aproximação: 15% × rendimento × (eventos restantes / 2). Nada preciso,
    // mas dá ordem de grandeza pro card "IR estimado no ano".
    comecotasAnual = round2(rendimentoTotalFundos * 0.15 * (eventosRestantes / 2));
  }

  // ---- Proventos do ano: classificação por tributação ----
  const blockedSymbols = ['RESERVA-EMERG', 'RESERVA-OPORT', 'PERSONALIZADO'];
  const isBlocked = (s: string) => blockedSymbols.some((p) => s.toUpperCase().startsWith(p));
  const yearStart = new Date(year, 0, 1).getTime();
  const yearEnd = new Date(year + 1, 0, 1).getTime() - 1;

  // BRAPI dividends por símbolo de ação/FII presente no portfolio
  type ProventoSlot = { dividendoAcao: number; rendimentoFii: number; jcp: number };
  const slots: ProventoSlot = { dividendoAcao: 0, rendimentoFii: 0, jcp: 0 };
  const portfolioStocks = portfolio.filter((p) => p.stock && !isBlocked(p.stock.ticker));
  await Promise.all(
    portfolioStocks.map(async (p) => {
      const symbol = p.stock!.ticker;
      const isFii = symbol.endsWith('11');
      const dividends = await getDividends(symbol, { useBrapiFallback: true });
      for (const d of dividends) {
        const ts = d.date.getTime();
        if (ts < yearStart || ts > yearEnd) continue;
        const valor = (p.quantity || 0) * d.valorUnitario;
        if (valor <= 0) continue;
        const tipo = (d.tipo || '').toLowerCase();
        if (tipo.includes('jcp') || tipo.includes('juros')) slots.jcp += valor;
        else if (isFii) slots.rendimentoFii += valor;
        else slots.dividendoAcao += valor;
      }
    }),
  );
  // Manuais: usa o tipo do PortfolioProvento
  for (const mp of manualProventos) {
    const ts = mp.dataPagamento.getTime();
    if (ts < yearStart || ts > yearEnd) continue;
    const tipo = (mp.tipo || '').toLowerCase();
    if (tipo.includes('jcp') || tipo.includes('juros')) slots.jcp += mp.valorTotal;
    else if (tipo.includes('rendimento') || tipo.includes('aluguel'))
      slots.rendimentoFii += mp.valorTotal;
    else slots.dividendoAcao += mp.valorTotal;
  }

  const isentosTotal = round2(slots.dividendoAcao + slots.rendimentoFii);
  const exclusivaTotal = round2(slots.jcp);
  const totalRecebido = round2(isentosTotal + exclusivaTotal);

  const observacoes: string[] = [];
  if (year !== currentYear) {
    observacoes.push(
      `Resumo de ${year} — come-cotas histórico aproximado (sem registro de cobranças passadas).`,
    );
  }
  observacoes.push(
    'IR de renda fixa não recolhido manualmente — banco/corretora retém na fonte no resgate.',
  );

  const resumo: AnualResumo = {
    year,
    asOf: new Date().toISOString(),
    irPorCategoria: {
      rendaVariavelBr: round2(rvAnual),
      stocksUs: round2(usAnual),
      cripto: round2(criptoAnual),
      comecotas: round2(comecotasAnual),
      rendaFixa: 0,
      total: round2(rvAnual + usAnual + criptoAnual + comecotasAnual),
    },
    rendimentos: {
      isentos: {
        dividendosAcoesBr: round2(slots.dividendoAcao),
        rendimentosFii: round2(slots.rendimentoFii),
        total: isentosTotal,
      },
      tributacaoExclusiva: {
        jcp: round2(slots.jcp),
        total: exclusivaTotal,
      },
      totalRecebido,
    },
    observacoes,
  };

  return NextResponse.json(resumo);
});
