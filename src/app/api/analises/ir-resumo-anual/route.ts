import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { resolveProventoEvents } from '@/services/portfolio/resolveProventos';
import {
  apurarRendaVariavel,
  type RvTransaction,
  type RendaVariavelCategory,
} from '@/services/ir/rendaVariavelIR';
import { apurarStocksUs, montarTransacoesUs } from '@/services/ir/stocksUsIR';
import { apurarCripto, type CriptoTransaction } from '@/services/ir/criptoIR';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { isFundoType } from '@/lib/fundoTypes';
import { isAtivoEmDolar, type AtivoMoedaRef } from '@/lib/ativoEmDolar';
import {
  ROTULO_FONTE_CAMBIO,
  carregarSerieCambio,
  cotacaoMoedaDasNotes,
  type SerieCambio,
} from '@/services/market/cambioUsdBrl';

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
 *
 * Carteira EUA em US$ (out/2026): stocks/REITs em dólar (isAtivoEmDolar) entram só no
 * ganho de capital em ME (preço pela unidade gravada, sem dupla conversão) e os proventos
 * deles saem dos isentos BR para `rendimentos.exterior` (tributáveis), convertidos em R$
 * pelo câmbio de mercado da data de pagamento. Sem câmbio, o provento fica fora da soma.
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
    /** Proventos de stocks/REITs EUA (tributáveis no Brasil, fora dos isentos), em R$. */
    exterior: {
      proventos: number;
      total: number;
      /** Proventos em US$ sem câmbio na data (fora da soma). */
      semCambio: number;
    };
    totalRecebido: number;
  };
  observacoes: string[];
}

// Padrão B3 (PETR4, ITUB4, BBAS3) — distinguir de stocks US (AAPL, MSFT).
const isB3StockTicker = (ticker: string): boolean =>
  /^[A-Z][A-Z0-9]{3}[0-9]$/.test(ticker.toUpperCase());

function categorizeBR(
  ticker: string | null,
  asset: AtivoMoedaRef | null | undefined,
): RendaVariavelCategory | null {
  if (!ticker) return null;
  // Stock/REIT em dólar é ganho de capital em ME (Fase 3), nunca renda variável BR.
  if (isAtivoEmDolar(asset)) return null;
  const assetType = asset?.type ?? null;
  const upper = ticker.toUpperCase();
  if (assetType === 'fii') return 'fii';
  if (assetType === 'stock' && isB3StockTicker(upper)) return 'acao_br';
  if (assetType === 'etf' && upper.endsWith('11')) return 'etf_br';
  return null;
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
  const [transactions, portfolio] = await Promise.all([
    prisma.stockTransaction.findMany({
      where: { userId: targetUserId },
      include: { asset: true },
      orderBy: { date: 'asc' },
    }),
    prisma.portfolio.findMany({
      where: { userId: targetUserId },
      include: { asset: true },
    }),
  ]);

  // ---- Fase 2: Renda Variável BR (ações/FII/ETF) ----
  const rvTxs: RvTransaction[] = [];
  for (const tx of transactions) {
    if (tx.type !== 'compra' && tx.type !== 'venda') continue;
    const ticker = tx.asset?.symbol || null;
    const cat = categorizeBR(ticker, tx.asset);
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

  // ---- Fase 3: Stocks US/REIT (só isAtivoEmDolar; preço pela unidade gravada) ----
  // A série USD-BRL (fallback do câmbio das operações e câmbio dos proventos) só é
  // carregada quando há ativo em dólar.
  const temAtivoEmDolar =
    transactions.some((tx) => isAtivoEmDolar(tx.asset)) ||
    portfolio.some((p) => isAtivoEmDolar(p.asset));
  const serie: SerieCambio | null = temAtivoEmDolar ? await carregarSerieCambio() : null;
  const usMontagem = montarTransacoesUs(transactions, {
    cotacaoGravada: cotacaoMoedaDasNotes,
    serie,
  });
  const usApur = apurarStocksUs(usMontagem.transactions);
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
    // Fundos sem come-cotas (FIA tributa no resgate, FIP tabela regressiva no
    // resgate, FIP-Infra isento pra PF) não somam pro evento semestral.
    const SEM_COMECOTAS_TYPES = new Set(['fia', 'fip', 'fip-infra']);
    const rendimentoTotalFundos = portfolio
      .filter((p) => isFundoType(p.asset?.type) && !SEM_COMECOTAS_TYPES.has(p.asset?.type ?? ''))
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
  // paymentDay do resolvedor é UTC 00:00.
  const yearStart = Date.UTC(year, 0, 1);
  const yearEnd = Date.UTC(year + 1, 0, 1) - 1;

  // Totais por tributação (isento, exclusiva, exterior).
  type ProventoSlot = {
    dividendoAcao: number;
    rendimentoFii: number;
    jcp: number;
    exterior: number;
    exteriorSemCambio: number;
  };
  const slots: ProventoSlot = {
    dividendoAcao: 0,
    rendimentoFii: 0,
    jcp: 0,
    exterior: 0,
    exteriorSemCambio: 0,
  };
  // Provento de ativo em dólar: valor nativo em US$ (mesma regra de moeda do contrato
  // ProventoEvent.moeda) → R$ pelo câmbio da data de pagamento; sem câmbio, fora da soma.
  const somarExterior = (valorUsd: number, dataPagamento: Date) => {
    const taxa = serie?.(dataPagamento) ?? null;
    if (taxa === null) {
      slots.exteriorSemCambio += 1;
      return;
    }
    slots.exterior += valorUsd * taxa;
  };
  // Proventos pela mesma fonte do Resumo e da rentabilidade (resolveProventoEvents): histórico
  // global × quantidade na data-com, edição manual substitui o evento e o espelho 'brapi' de
  // portfolio_proventos é ignorado — somar o espelho junto do histórico contava tudo 2×.
  // Só o que já foi pago (paymentDay ≤ hoje); JCP pelo líquido (como a DIRPF pede).
  const { events: proventos } = await resolveProventoEvents(targetUserId);
  const tipoPorSymbol = new Map<string, string | null | undefined>();
  for (const tx of transactions)
    if (tx.asset?.symbol) tipoPorSymbol.set(tx.asset.symbol, tx.asset.type);
  for (const p of portfolio) if (p.asset?.symbol) tipoPorSymbol.set(p.asset.symbol, p.asset.type);
  const hojeMs = Date.now();
  for (const e of proventos) {
    if (e.paymentDay < yearStart || e.paymentDay > yearEnd || e.paymentDay > hojeMs) continue;
    if (isBlocked(e.symbol)) continue;
    // Ativo em dólar (REIT, stock EUA): linha Exterior, bruto em US$ → R$.
    if (e.moeda === 'USD') {
      somarExterior(e.gross, new Date(e.paymentDay));
      continue;
    }
    const tipoAtivo = tipoPorSymbol.get(e.symbol);
    if (tipoAtivo !== 'stock' && tipoAtivo !== 'fii') continue;
    const tipo = (e.tipo || '').toLowerCase();
    if (tipo.includes('jcp') || tipo.includes('juros')) slots.jcp += e.net;
    else if (tipoAtivo === 'fii') slots.rendimentoFii += e.gross;
    else slots.dividendoAcao += e.gross;
  }

  const isentosTotal = round2(slots.dividendoAcao + slots.rendimentoFii);
  const exclusivaTotal = round2(slots.jcp);
  const exteriorTotal = round2(slots.exterior);
  const totalRecebido = round2(isentosTotal + exclusivaTotal + exteriorTotal);

  const observacoes: string[] = [];
  if (year !== currentYear) {
    observacoes.push(
      `Resumo de ${year} — come-cotas histórico aproximado (sem registro de cobranças passadas).`,
    );
  }
  observacoes.push(
    'IR de renda fixa não recolhido manualmente — banco/corretora retém na fonte no resgate.',
  );
  if (exteriorTotal > 0 || slots.exteriorSemCambio > 0) {
    const fmt = (n: number) =>
      n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
    observacoes.push(
      `Exterior (tributável): ${fmt(exteriorTotal)} em proventos de Stocks/REITs EUA, fora dos isentos — convertidos pelo ${ROTULO_FONTE_CAMBIO} da data de pagamento (aproximado). Regra anual da Lei 14.754 em revisão; confira com seu contador.`,
    );
  }
  if (slots.exteriorSemCambio > 0) {
    observacoes.push(
      `${slots.exteriorSemCambio} provento(s) de Stocks/REITs EUA sem câmbio na data ficaram fora da soma.`,
    );
  }
  if (usMontagem.comCambioAproximado > 0) {
    observacoes.push(
      `Stocks EUA: ${usMontagem.comCambioAproximado} operação(ões) sem cotação gravada usaram o ${ROTULO_FONTE_CAMBIO} da data (aproximado).`,
    );
  }

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
      exterior: {
        proventos: exteriorTotal,
        total: exteriorTotal,
        semCambio: slots.exteriorSemCambio,
      },
      totalRecebido,
    },
    observacoes,
  };

  return NextResponse.json(resumo);
});
