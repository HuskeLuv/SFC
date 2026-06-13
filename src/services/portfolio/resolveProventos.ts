import { prisma } from '@/lib/prisma';
import { getDividends, isJcpType, getJcpIrrfRate } from '@/services/pricing/dividendService';
import { nextBusinessDayB3 } from '@/utils/feriadosB3';
import {
  APPLICABLE_CORPORATE_ACTION_TYPES,
  buildQuantityTimeline,
  isCorporateActionAuditTx,
  quantityAtDate,
} from '@/services/portfolio/corporateActions';

/** Tipos de ativo de renda variável que pagam proventos (dividendo/JCP/rendimento). */
const PROVENTO_ASSET_TYPES = ['stock', 'fii', 'etf', 'reit', 'fim-fia', 'bdr'];

// UTC-safe: setHours(0) é local-TZ e gera offsets diferentes entre ambientes.
const normalizeDateStart = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

export interface ProventoEvent {
  symbol: string;
  /** Dia de pagamento normalizado (UTC 00:00) em ms. */
  paymentDay: number;
  /**
   * Dia da DATA-EX normalizado (UTC 00:00) em ms — pregão seguinte à data-com,
   * quando o preço do ativo cai descontando o provento. INFORMATIVO: a série de
   * rentabilidade NÃO provisiona mais aqui (ver `bookingDay`). Mantido para
   * referência/auditoria. Fallback = `paymentDay` quando a data-com é desconhecida.
   */
  exDay: number;
  /**
   * Dia em que a SÉRIE de rentabilidade provisiona o provento — data de PAGAMENTO
   * snapada pro pregão B3 (on-or-after). Espelha a metodologia do Kinvo, que credita
   * o provento no PAGAMENTO (não na data-ex). Trade-off aceito: reintroduz um pequeno
   * "dente" entre a data-ex (quando o preço cai) e o pagamento; em troca, a linha bate
   * com o Kinvo. O snap pro pregão é CRÍTICO: a timeline do builder só tem dias úteis,
   * então um pagamento em fim de semana/feriado seria descartado da série.
   */
  bookingDay: number;
  tipo: string;
  /** Valor recebido líquido de IRRF (R$). */
  net: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * Data-ex = PRÓXIMO PREGÃO após a data-com (último dia COM direito). O preço cai
 * aqui. CRÍTICO usar `nextBusinessDayB3`: a data-com cai numa sexta com frequência
 * → +1 dia de calendário daria sábado, que NÃO está na timeline de dias úteis do
 * builder → o provento seria DESCARTADO (regressão real: série perdia ~metade dos
 * dividendos). Alinhando ao pregão, o dia bate com a timeline e o provento entra.
 */
const exDayFromDataCom = (dataCom: Date | null, fallbackMs: number): number =>
  dataCom ? nextBusinessDayB3(normalizeDateStart(dataCom).getTime() + DAY_MS) : fallbackMs;

export interface ResolveProventosResult {
  events: ProventoEvent[];
  /** Soma líquida de todos os eventos até hoje (R$). */
  total: number;
}

const overrideKey = (symbol: string, paymentDay: number, tipo: string): string =>
  `${symbol}|${paymentDay}|${tipo}`;

/**
 * Resolve os proventos recebidos por um usuário a partir do HISTÓRICO GLOBAL
 * (`asset_dividend_history`, populado para todo símbolo pelo cron + fallback
 * BRAPI), em vez da materialização por-usuário (`PortfolioProvento`).
 *
 * Motivação: a série de rentabilidade (TWR retorno-total) somava proventos lendo
 * `PortfolioProvento`, que só é materializado ao visitar o editor do ativo ou no
 * cron diário. Usuário novo via "drawdown-fantasma" (queda na data-ex sem o
 * provento compensatório) até a materialização rodar. Lendo do histórico global
 * — que já tem todo o backfill — a janela some na raiz, para todos os usuários.
 *
 * `PortfolioProvento` é rebaixado a camada de OVERRIDE:
 *   - `source='manual'` (criado/editado pelo usuário): substitui/adiciona o evento;
 *   - `dismissed=true`: suprime o evento-base correspondente (delete do usuário);
 *   - `source='brapi'`: ignorado (o histórico global é a fonte da verdade).
 *
 * O cálculo qty×valor+IRRF espelha EXATAMENTE `ensurePortfolioProventosFromMarket`
 * (mesmo arredondamento, mesma alíquota JCP por data, mesma timeline split-aware)
 * para manter paridade centavo-a-centavo com os valores antes materializados
 * (validado contra Kinvo, R$ 634,62).
 */
export const resolveProventoEvents = async (userId: string): Promise<ResolveProventosResult> => {
  const hojeMs = normalizeDateStart(new Date()).getTime();

  // Transações de RV — fonte da quantidade detida em cada data-ex. Inclui
  // posições já zeradas: proventos durante o período em que foram detidas contam
  // (quantityAtDate retorna 0 após a venda total, então datas-ex pós-venda são
  // naturalmente ignoradas).
  const txs = await prisma.stockTransaction.findMany({
    where: { userId, asset: { type: { in: PROVENTO_ASSET_TYPES } } },
    select: {
      date: true,
      type: true,
      quantity: true,
      notes: true,
      asset: { select: { symbol: true } },
    },
    orderBy: { date: 'asc' },
  });

  const txBySymbol = new Map<string, Array<{ date: Date; type: string; quantity: number }>>();
  for (const t of txs) {
    const symbol = t.asset?.symbol;
    if (!symbol) continue;
    // Linhas de auditoria de evento corporativo são display-only (o fator já é
    // aplicado na timeline); somá-las contaria o split duas vezes.
    if (isCorporateActionAuditTx(t.notes)) continue;
    if (!txBySymbol.has(symbol)) txBySymbol.set(symbol, []);
    txBySymbol.get(symbol)!.push({ date: t.date, type: t.type, quantity: t.quantity });
  }

  const symbols = [...txBySymbol.keys()];
  if (symbols.length === 0) return { events: [], total: 0 };

  // Overrides do usuário, mapeados por (symbol|dia|tipo).
  const overrideRows = await prisma.portfolioProvento.findMany({
    where: { userId },
    select: {
      dataPagamento: true,
      tipo: true,
      valorTotal: true,
      impostoRenda: true,
      source: true,
      dismissed: true,
      portfolio: { select: { asset: { select: { symbol: true } } } },
    },
  });

  const dismissedKeys = new Set<string>();
  const manualOverrides = new Map<
    string,
    { net: number; symbol: string; paymentDay: number; tipo: string }
  >();
  for (const r of overrideRows) {
    const symbol = r.portfolio?.asset?.symbol;
    if (!symbol || !r.dataPagamento) continue;
    const day = normalizeDateStart(r.dataPagamento).getTime();
    const key = overrideKey(symbol, day, r.tipo);
    if (r.dismissed) {
      dismissedKeys.add(key);
      continue;
    }
    if (r.source === 'manual') {
      const net = (r.valorTotal ?? 0) - (r.impostoRenda ?? 0);
      manualOverrides.set(key, { net, symbol, paymentDay: day, tipo: r.tipo });
    }
  }

  // Dividendos + eventos corporativos por símbolo, em paralelo.
  const perSymbol = await Promise.all(
    symbols.map(async (symbol): Promise<ProventoEvent[]> => {
      const transactions = txBySymbol.get(symbol)!;
      const compraTimes = transactions
        .filter((t) => t.type === 'compra')
        .map((t) => t.date.getTime());
      if (compraTimes.length === 0) return [];
      const firstPurchase = Math.min(...compraTimes);

      const [corporateActions, dividends] = await Promise.all([
        prisma.assetCorporateAction.findMany({
          where: { symbol, type: { in: Array.from(APPLICABLE_CORPORATE_ACTION_TYPES) } },
          orderBy: { date: 'asc' },
          select: { date: true, type: true, factor: true },
        }),
        getDividends(symbol),
      ]);
      if (dividends.length === 0) return [];

      const timeline = buildQuantityTimeline(transactions, corporateActions);
      const out: ProventoEvent[] = [];
      for (const d of dividends) {
        const payDay = normalizeDateStart(d.date);
        const dMs = payDay.getTime();
        if (dMs > hojeMs || dMs < firstPurchase) continue;
        const exMs = exDayFromDataCom(d.dataCom, dMs);
        // A série provisiona no PAGAMENTO (espelha o Kinvo), snapado pro pregão B3.
        const bookingMs = nextBusinessDayB3(dMs);

        const key = overrideKey(symbol, dMs, d.tipo);
        if (dismissedKeys.has(key)) continue; // usuário deletou explicitamente

        const manual = manualOverrides.get(key);
        if (manual) {
          // Edição manual vence; consome o override para não duplicar abaixo.
          manualOverrides.delete(key);
          out.push({
            symbol,
            paymentDay: dMs,
            exDay: exMs,
            bookingDay: bookingMs,
            tipo: d.tipo,
            net: manual.net,
          });
          continue;
        }

        const qty = quantityAtDate(timeline, d.date.getTime());
        if (qty <= 0) continue;
        // Espelha ensurePortfolioProventosFromMarket: valorTotal arredondado a
        // 1e6, IRRF de JCP arredondado a centavo pela alíquota da data de pgto.
        const valorTotal = Math.round(qty * d.valorUnitario * 1e6) / 1e6;
        const imposto = isJcpType(d.tipo)
          ? Math.round(valorTotal * getJcpIrrfRate(payDay) * 100) / 100
          : 0;
        out.push({
          symbol,
          paymentDay: dMs,
          exDay: exMs,
          bookingDay: bookingMs,
          tipo: d.tipo,
          net: valorTotal - imposto,
        });
      }
      return out;
    }),
  );

  const events = perSymbol.flat();

  // Overrides manuais sem evento-base correspondente (provento que o usuário
  // adicionou e não existe no histórico global) entram como eventos próprios.
  for (const m of manualOverrides.values()) {
    if (m.paymentDay > hojeMs) continue;
    // Override órfão (sem evento-base): sem data-com → ancora no pagamento.
    events.push({
      symbol: m.symbol,
      paymentDay: m.paymentDay,
      exDay: m.paymentDay,
      bookingDay: nextBusinessDayB3(m.paymentDay),
      tipo: m.tipo,
      net: m.net,
    });
  }

  const total = events.reduce((sum, e) => sum + e.net, 0);
  return { events, total };
};
