import { getAssetHistory } from '@/services/pricing/assetPriceService';
import { isHolidayB3, nextBusinessDayB3 } from '@/utils/feriadosB3';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import {
  APPLICABLE_CORPORATE_ACTION_TYPES,
  isCorporateActionAuditTx,
} from '@/services/portfolio/corporateActions';
import type { Prisma } from '@prisma/client';

const DAY_MS = 24 * 60 * 60 * 1000;

export type FixedIncomeAssetWithAsset = {
  id: string;
  userId: string;
  assetId: string;
  type: string;
  description: string;
  startDate: Date;
  maturityDate: Date;
  investedAmount: number;
  annualRate: number;
  indexer: string | null;
  indexerPercent: number | null;
  liquidityType: string | null;
  taxExempt: boolean;
  tesouroBondType?: string | null;
  tesouroMaturity?: Date | null;
  /**
   * Quantidade da posição (cotas para Tesouro). Quando presente, o pricer
   * usa `investedAmount / qty` como preço efetivo de aquisição em vez do PU
   * oficial — alinha com o comportamento do Kinvo (1 cota × R$ pago).
   */
  qty?: number;
  asset: { symbol: string; name: string; type?: string | null } | null;
};

export type InvestmentCashflowItem = {
  name: string | null;
  values?: Array<{ year: number; month: number; value: number }>;
};

// Consolidação Stock → Asset (Sprint 5): include só `asset`. A relação `stock`
// foi removida do schema na migration 20260512000000_drop_stock_table.
export type PortfolioWithRelations = Prisma.PortfolioGetPayload<{
  include: { asset: true };
}>;

export type StockTransactionWithRelations = Prisma.StockTransactionGetPayload<{
  include: { asset: true };
}>;

export const normalizeDateStart = (date: Date) => {
  // Datas calendário (YYYY-MM-DD) são armazenadas no DB como UTC midnight via
  // `new Date('YYYY-MM-DD')`. Normalizar via setHours/getDay locais shifta o
  // calendar day em fusos negativos (em BRT, BACEN-segunda → key local-domingo,
  // que é filtrada como fim-de-semana → ~1 dia de CDI perdido por semana →
  // CDB 100% CDI rende ~10% abaixo do CDI real em 3 anos). Ancorar em UTC
  // mantém o alinhamento entre timeline e map de índices independente do fuso.
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};

/**
 * Mapeia uma data de transação para o dia útil em que ela passa a "valer" no
 * timeline. Transações em fim de semana ou feriado nacional (B3 fechada) são
 * empurradas para o próximo dia útil; do contrário ficariam órfãs —
 * `buildDailyTimeline` filtra ambos, então `appliedDeltasByDay.get(day)` para
 * um sábado/feriado nunca é consultado e o aporte some silenciosamente da série.
 *
 * Convenção D+next ANBIMA: cashflows em D não-útil contam em D+next BD.
 */
export const shiftToBusinessDay = (ts: number): number => nextBusinessDayB3(ts);

export const buildDailyTimeline = (startDate: Date, endDate: Date) => {
  const start = normalizeDateStart(startDate).getTime();
  const end = normalizeDateStart(endDate).getTime();
  const timeline: number[] = [];

  for (let day = start; day <= end; day += DAY_MS) {
    const d = new Date(day);
    const dow = d.getUTCDay();
    // Pula fim-de-semana E feriados nacionais B3/BACEN. Feriados são críticos pra
    // FI pré-fixada/IPCA-híbrida: sem o filtro, `dailyPreFactor` compõe ~10-13×/ano
    // a mais, inflando saldo bruto em ~3% em 6 anos vs Kinvo/ANBIMA. Para CDI puro
    // o filtro é redundante (BACEN não publica em feriado, get(day) já é undefined).
    if (dow === 0 || dow === 6) continue;
    if (isHolidayB3(d)) continue;
    timeline.push(day);
  }

  return timeline;
};

export const getTransactionValue = (transaction: {
  total: number;
  quantity: number;
  price: number;
}) => {
  const total = Number(transaction.total);
  if (Number.isFinite(total) && total > 0) {
    return total;
  }

  const fallback = Number(transaction.quantity) * Number(transaction.price);
  return Number.isFinite(fallback) ? fallback : 0;
};

// F1.10 / flag "dinheiro já estava investido" (reinvestimento de provento,
// rolagem, troca, posição pré-existente): o dinheiro NÃO transitou pelo caixa
// rastreado da carteira. Efeitos no builder (ticket 20/08/2026):
// - CAIXA da série (aportesByDay/cashBalance): operação marcada fica FORA —
//   sem isto, a compra marcada debitava o caixa sem o crédito do aporte e a
//   série exibia só o rendimento (posição pré-existente de 110k aparecia como
//   R$ 398 no gráfico).
// - Fluxos externos do TWR/MWR (cashFlowsByDay): operação marcada CONTA —
//   capital entrando/saindo do universo medido precisa ser neutralizado, senão
//   o valor da posição aparecendo vira retorno espúrio (+133% no ticket). O
//   provento reinvestido não é dobrado: a renda já entra uma única vez no dia
//   do booking via incomeByDay (na arquitetura antiga, com o caixa acumulado
//   DENTRO da base, contar o fluxo deflava o TWR — por isso a exclusão de
//   maio/2026; a base atual é só posições, e a conta se inverteu).
// Imóveis & Bens (ticket 20/08/2026): patrimônio, não investimento. Ficam na
// Carteira Consolidada (cards/donut via portfolioLiveTotals) e no Balanço
// Patrimonial, mas FORA das séries de rentabilidade/patrimônio investido —
// valor parado dilui o TWR e o aporte não é fluxo de investimento.
const isImovelAssetType = (type: string | null | undefined): boolean => type === 'imovel';

export const isReinvestimentoTransaction = (notes: string | null | undefined): boolean => {
  if (!notes) return false;
  try {
    const parsed = JSON.parse(notes);
    return parsed?.operation?.action === 'reinvestimento';
  } catch {
    return false;
  }
};

/**
 * Gap acima disso entre dois pontos de preço conhecidos não é "mercado fechado"
 * — é ausência de dado (ex.: fundo CVM comprado em 2020 cujas cotas INF_DIARIO
 * só existem a partir de ago/2026). Forward-fill plano nesses trechos concentra
 * toda a valorização no primeiro dia com dado real: o fundo salta +87% num dia
 * e o TWR do mês ganha um degrau artificial (+3,8pp, qa.teste.gorila
 * 01/09/2026). Nesses gaps o preço é interpolado geometricamente entre os dois
 * pontos, distribuindo o retorno pelo período sem dado. Gaps curtos (fim de
 * semana, feriado, ativo ilíquido) continuam com forward-fill.
 */
export const PRICE_GAP_INTERPOLATION_MIN_DAYS = 30;

export const buildDailyPriceMap = (
  history: Array<{ date: number; value: number }>,
  timeline: number[],
  initialPrice?: number,
) => {
  const sorted = [...history]
    .filter((item) => Number.isFinite(item.value) && item.value > 0)
    .map((item) => ({
      date: normalizeDateStart(new Date(item.date)).getTime(),
      value: item.value,
    }))
    .sort((a, b) => a.date - b.date);
  const map = new Map<number, number>();

  let lastPrice =
    Number.isFinite(initialPrice) && initialPrice && initialPrice > 0 ? initialPrice : undefined;
  let lastPriceDate: number | null = null;
  let historyIndex = 0;

  for (const day of timeline) {
    while (historyIndex < sorted.length && sorted[historyIndex].date <= day) {
      lastPrice = sorted[historyIndex].value;
      lastPriceDate = sorted[historyIndex].date;
      historyIndex += 1;
    }

    if (!Number.isFinite(lastPrice) || !lastPrice || lastPrice <= 0) continue;

    let price = lastPrice;
    const next = historyIndex < sorted.length ? sorted[historyIndex] : undefined;
    if (
      next &&
      lastPriceDate != null &&
      day > lastPriceDate &&
      next.date - lastPriceDate > PRICE_GAP_INTERPOLATION_MIN_DAYS * DAY_MS
    ) {
      const t = (day - lastPriceDate) / (next.date - lastPriceDate);
      price = lastPrice * Math.pow(next.value / lastPrice, t);
    }
    map.set(day, price);
  }

  return map;
};

export const calculateFixedIncomeValue = (
  fixedIncome: FixedIncomeAssetWithAsset,
  referenceDate: Date,
) => {
  const start = normalizeDateStart(new Date(fixedIncome.startDate));
  const maturity = normalizeDateStart(new Date(fixedIncome.maturityDate));
  const current = normalizeDateStart(referenceDate);
  const endDate = current.getTime() > maturity.getTime() ? maturity : current;
  if (endDate.getTime() <= start.getTime()) {
    return fixedIncome.investedAmount;
  }
  const days = Math.floor((endDate.getTime() - start.getTime()) / DAY_MS);
  const rate = fixedIncome.annualRate / 100;
  const valorAtual = fixedIncome.investedAmount * Math.pow(1 + rate, days / 365);
  return Math.round(valorAtual * 100) / 100;
};

export const getDayKey = (ts: number): number => {
  // Mesmo invariante de normalizeDateStart: ancorar em UTC. setHours local em
  // BRT (UTC-3) shifta UTC-midnight pro dia anterior, desalinhando dayKey
  // entre tx.date (UTC) e timeline iterator. Foi a causa do "ativo cai no
  // dia anterior" em séries de patrimônio/MWR no fuso brasileiro.
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

/**
 * % do indexador efetivo de um FI pós-fixado.
 *
 * Legado (F1.6, mai/2026 → ticket 25/08/2026): o wizard de pós-fixada gravava
 * `indexerPercent = 100` fixo e a "Taxa sobre o Indexador (%)" digitada caía em
 * `annualRate` (ignorado em pós-fixada). Uma LCI 135% CDI rendia 100% do CDI.
 * Para emissão bancária pós-fixada (não híbrida, não Tesouro) com indexerPercent
 * ausente/100 e annualRate diferente de 100, o annualRate é o % contratado —
 * auto-cura os registros antigos sem migração de dados.
 */
export function resolveIndexerPercent(
  fi: Pick<FixedIncomeAssetWithAsset, 'annualRate' | 'indexerPercent' | 'tesouroBondType'>,
  indexer: string,
  isHibrido: boolean,
): number {
  const stored = fi.indexerPercent != null ? Number(fi.indexerPercent) : null;
  const annualRate = Number(fi.annualRate);
  const isPosBancaria =
    (indexer === 'CDI' || indexer === 'IPCA') && !isHibrido && !fi.tesouroBondType;
  if (
    isPosBancaria &&
    (stored == null || stored === 100) &&
    Number.isFinite(annualRate) &&
    annualRate > 0 &&
    annualRate !== 100
  ) {
    return annualRate;
  }
  return stored ?? 100;
}

/** Taxa diária do CDI (fração decimal, ex.: 0.000521 para ~13.65% a.a.) indexada por dayKey. */
export type CdiDaily = Map<number, number>;

/** Taxa mensal do IPCA (fração decimal, ex.: 0.005 para 0.5% no mês) indexada por 'YYYY-MM'. */
export type IpcaMonthly = Map<string, number>;

/** Preço Unitário (PU) diário de um título do Tesouro Direto indexado por dayKey. */
export type TesouroPU = Map<number, number>;

export interface FixedIncomeFactorContext {
  cdi?: CdiDaily;
  ipca?: IpcaMonthly;
  tesouroPU?: TesouroPU;
  /** PU do Tesouro na data de aplicação (ou o primeiro PU disponível após ela). */
  tesouroPUAtStart?: number;
}

const BUSINESS_DAYS_PER_YEAR = 252;

const monthKeyOf = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

/** Distância em meses entre 'YYYY-MM' a (mais antigo) e b (mais recente). >= 0. */
const monthDistance = (a: string, b: string): number => {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
};

/**
 * Constrói a série diária de fatores de rentabilidade acumulados para um ativo de renda fixa.
 *
 * Retorna um `Map<dayKey, factor>` em que `factor` é o multiplicador do principal na data:
 * `saldoBruto(day) = investedAmount * factor(day)`.
 *
 * O `timeline` deve ser composto por dias úteis (o helper `buildDailyTimeline` já filtra
 * fim de semana). Para correção do TWR ao longo do período exibido, passe um timeline que
 * comece na `fi.startDate` real; o chamador pode então "fatiar" para exibição.
 *
 * Regras de acréscimo (aplicadas a cada dia útil após a data de aplicação e até o vencimento):
 * - **PRE**: `factor *= (1 + annualRate)^(1/252)`
 * - **CDI**: `factor *= 1 + cdi_dia * indexerPercent` (carrega o último CDI conhecido em gaps)
 * - **IPCA**: `factor *= (1 + annualRate)^(1/252)` (spread) + aplica IPCA do mês ao cruzar
 *   para o mês seguinte
 * - **Tesouro Direto** (`tesouroBondType` preenchido e PU disponível): `factor = pu_dia / pu_start`
 *   (carrega o último PU conhecido em gaps). Se nunca houve PU, cai no `indexer` do registro.
 *
 * Após a data de vencimento, o fator é congelado no valor apurado no vencimento.
 */
/** Janela em que dias úteis sem CDI publicado carregam o último CDI (B3). */
const CDI_CARRY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export const buildFixedIncomeFactorSeries = (
  fi: FixedIncomeAssetWithAsset,
  timeline: number[],
  ctx: FixedIncomeFactorContext = {},
): Map<number, number> => {
  const result = new Map<number, number>();
  if (timeline.length === 0) return result;

  const startTs = normalizeDateStart(new Date(fi.startDate)).getTime();
  const maturityTs = normalizeDateStart(new Date(fi.maturityDate)).getTime();

  const annualRate = Number(fi.annualRate) / 100;
  const indexer = (fi.indexer || 'PRE').toUpperCase();
  const isHibrido = String(fi.type || '')
    .toUpperCase()
    .endsWith('_HIB');
  const indexerPercent = resolveIndexerPercent(fi, indexer, isHibrido) / 100;
  const hasTesouroPU =
    Boolean(fi.tesouroBondType) &&
    Boolean(ctx.tesouroPU) &&
    typeof ctx.tesouroPUAtStart === 'number' &&
    ctx.tesouroPUAtStart > 0;

  const dailyPreFactor =
    1 + annualRate > 0 ? Math.pow(1 + annualRate, 1 / BUSINESS_DAYS_PER_YEAR) : 1;

  // Quando o timeline pedido começa DEPOIS da data de aplicação (ex.: maxHistoricoMonths
  // trunca um CDB iniciado em 2020 para um timeline que começa em 2023), precisamos
  // primeiro acumular o factor sobre o gap pré-timeline. Sem isso o factor reseta em 1
  // no início do timeline e perde anos de rentabilidade — defasagem que era "consertada"
  // pelo patch live no último dia, gerando spike artificial no TWR.
  const requestedStart = timeline[0];
  const requestedEnd = timeline[timeline.length - 1];
  const requested = new Set(timeline);
  const fullStart = startTs < requestedStart ? new Date(startTs) : new Date(requestedStart);
  const fullTimeline =
    startTs < requestedStart ? buildDailyTimeline(fullStart, new Date(requestedEnd)) : timeline;

  let factor = 1;
  let lastCdi = 0;
  // Último dia com CDI publicado e "hoje" (UTC) — base do carry-forward recente.
  let ultimoCdiPublicado = Number.NEGATIVE_INFINITY;
  ctx.cdi?.forEach((rate, dayKey) => {
    if (rate != null && Number.isFinite(rate) && dayKey > ultimoCdiPublicado) {
      ultimoCdiPublicado = dayKey;
    }
  });
  const hojeUtc = normalizeDateStart(new Date()).getTime();
  let lastTesouroPU = ctx.tesouroPUAtStart ?? 0;
  // Pre-popula lastTesouroPU com o PU mais recente publicado (<= startTs).
  // Sem isso, posições compradas em dias sem publicação de PU (D+1 do BACEN
  // ainda em atraso, fim de semana, feriado) usariam o `tesouroPUAtStart`
  // como factor — ignorando o PU oficial mais recente. Especialmente
  // importante quando `tesouroPUAtStart` é o preço pago (qty=1) em vez do
  // PU oficial (qty fracional), caso em que lastTesouroPU = preço pago dá
  // factor=1 sem refletir o ganho de mercado.
  if (hasTesouroPU && ctx.tesouroPU) {
    const sortedKeys = Array.from(ctx.tesouroPU.keys())
      .filter((k) => k <= startTs)
      .sort();
    const latest = sortedKeys[sortedKeys.length - 1];
    const pu = latest !== undefined ? ctx.tesouroPU.get(latest) : undefined;
    if (pu && pu > 0) lastTesouroPU = pu;
  }
  // Inicia no mês da aplicação para que o IPCA do mês em curso não seja aplicado
  // quando cruzarmos para o próximo mês (seria cobrar IPCA retroativo da fração pré-aplicação).
  let lastMonthApplied = monthKeyOf(startTs);
  // Fila de meses esperando IPCA: cobre 2 cenários:
  //  (a) BACEN publica IPCA ~10 dias após fechar o mês — durante a janela
  //      de espera, mês fica pendente e é aplicado retroativamente quando taxa chega.
  //  (b) Mês permanentemente sem IPCA (gap histórico no economic_index) — fica
  //      pendente até `IPCA_MAX_PENDING_MONTHS`, depois é descartado pra não
  //      bloquear meses subsequentes (bug histórico: lastMonthApplied travava em "2020-05"
  //      e nenhum IPCA pós-2021 era aplicado).
  const pendingIpcaMonths: string[] = [];
  const IPCA_MAX_PENDING_MONTHS = 3; // descarta após 3 meses sem publicação

  const tryApplyPendingIpca = (currentMonth: string): number => {
    if (!ctx.ipca || pendingIpcaMonths.length === 0) return 1;
    let mult = 1;
    const remaining: string[] = [];
    for (const month of pendingIpcaMonths) {
      const rate = ctx.ipca.get(month);
      if (rate != null && Number.isFinite(rate)) {
        mult *= 1 + rate;
      } else {
        // Não publicou ainda — calcula idade do pendente vs currentMonth.
        // Se exceder janela, descarta (sem multiplicar). Senão mantém pra retry.
        const ageMonths = monthDistance(month, currentMonth);
        if (ageMonths < IPCA_MAX_PENDING_MONTHS) {
          remaining.push(month);
        }
      }
    }
    pendingIpcaMonths.length = 0;
    pendingIpcaMonths.push(...remaining);
    return mult;
  };

  for (const day of fullTimeline) {
    if (day < startTs) {
      if (requested.has(day)) result.set(day, 1);
      continue;
    }

    if (day > maturityTs) {
      // Fator congelado no valor apurado até o vencimento
      if (requested.has(day)) result.set(day, factor);
      continue;
    }

    if (hasTesouroPU) {
      const pu = ctx.tesouroPU!.get(day);
      if (pu && pu > 0) {
        lastTesouroPU = pu;
      }
      if (lastTesouroPU > 0 && ctx.tesouroPUAtStart! > 0) {
        factor = lastTesouroPU / ctx.tesouroPUAtStart!;
      }
    } else if (indexer === 'CDI' && day >= startTs) {
      // CDI compõe a partir do próprio dia da aplicação (D+0) — alinha com
      // Kinvo e outras plataformas. Convenção D+1 (`day > startTs`) criava
      // gap visual de 2 dias entre compra e primeiro rendimento (1 dia da
      // regra + 1 dia de defasagem da publicação BACEN).
      // Só compõe em dias em que o BACEN realmente publicou taxa — sem
      // carry-forward em feriados (que gerava ~10 compoundings extras/ano).
      const cdiRate = ctx.cdi?.get(day);
      // Exceção (auditoria Pedro 25/08/2026, item B3): o BACEN publica o CDI
      // de D só em D+1 e o cron roda 06:00, então o acrual ficava sempre 1 dia
      // útil atrás do Gorila (LCI −R$ 41,62 = exatamente 1 fator diário). Nos
      // dias úteis RECENTES (janela de 7 dias, até ontem) depois do último CDI
      // publicado, carrega o último CDI conhecido — quando o dado real chega, o
      // recálculo diário substitui. Gaps históricos continuam sem compor.
      const carregaCdiRecente =
        cdiRate == null &&
        lastCdi > 0 &&
        day > ultimoCdiPublicado &&
        day < hojeUtc &&
        day >= hojeUtc - CDI_CARRY_WINDOW_MS &&
        !isHolidayB3(day);
      if (cdiRate != null && Number.isFinite(cdiRate)) {
        lastCdi = cdiRate;
      }
      if ((cdiRate != null && Number.isFinite(cdiRate)) || carregaCdiRecente) {
        factor *= 1 + lastCdi * indexerPercent;
        // Para híbrido (CDI + X%), o spread (annualRate) é aplicado diariamente.
        // Em pós-fixada o annualRate é overload do "% do indexador" no wizard, então
        // aplicar dailyPreFactor lá causaria dupla contagem. Restringe-se a _HIB.
        if (isHibrido && annualRate > 0) {
          factor *= dailyPreFactor;
        }
      }
    } else if (day > startTs) {
      // IPCA: ao cruzar pra novo mês, enfileira o mês recém-fechado pra aplicação.
      // Tenta drenar a fila imediatamente (BACEN pode ter publicado a taxa via cron).
      // `lastMonthApplied` AGORA SEMPRE avança — meses sem IPCA ficam na fila
      // (até IPCA_MAX_PENDING_MONTHS) e depois são descartados, evitando bloqueio
      // permanente quando há gap histórico no economic_index (bug pré-fix).
      if (indexer === 'IPCA') {
        const currentMonth = monthKeyOf(day);
        if (currentMonth !== lastMonthApplied) {
          pendingIpcaMonths.push(lastMonthApplied);
          lastMonthApplied = currentMonth;
        }
        factor *= tryApplyPendingIpca(currentMonth);
        // Spread do híbrido (IPCA + X%) compõe diariamente.
        factor *= dailyPreFactor;
      } else {
        // PRE (default) — segue D+1 (rendimento começa no dia útil seguinte).
        factor *= dailyPreFactor;
      }
    }

    if (requested.has(day)) result.set(day, factor);
  }

  return result;
};

export const calculateHistoricoTWR = (
  patrimonioSeries: Array<{ data: number; saldoBruto: number }>,
  cashFlowsByDay: Map<number, number>,
  /**
   * Renda (proventos líquidos) POR DIA — entra no retorno do dia em que foi
   * recebida e NÃO permanece na base dos dias seguintes. Metodologia padrão
   * de retorno total (Gorila/Kinvo/GIPS): antes o builder somava o acumulado
   * de proventos ao saldo de TODOS os dias (série-sombra), o que diluía cada
   * retorno diário pelo fator V/(V+C) — numa carteira pagadora de dividendos
   * o TWR de 5 anos saía ~12pp abaixo do padrão da indústria.
   */
  incomeByDay?: Map<number, number>,
  options?: {
    /**
     * O 1º ponto é uma ÂNCORA sintética (patrimônio de fechamento do dia
     * anterior ao início da janela) e não um dia real: retorno 0, sem olhar
     * fluxo nem renda — mesmo que a âncora caia na mesma data de um ponto
     * real (o aporte desse dia é contado no ponto real, uma única vez).
     */
    anchoredStart?: boolean;
  },
): Array<{ data: number; value: number }> => {
  if (patrimonioSeries.length === 0) return [];

  const result: Array<{ data: number; value: number }> = [];
  let cumulative = 1;

  for (let i = 0; i < patrimonioSeries.length; i++) {
    const valorFinal = patrimonioSeries[i].saldoBruto;
    const dayKey = getDayKey(patrimonioSeries[i].data);
    const fluxo = cashFlowsByDay.get(dayKey) ?? cashFlowsByDay.get(patrimonioSeries[i].data) ?? 0;
    const renda = incomeByDay?.get(dayKey) ?? incomeByDay?.get(patrimonioSeries[i].data) ?? 0;

    let retornoDia = 0;
    if (i === 0 && options?.anchoredStart) {
      retornoDia = 0;
    } else if (i === 0) {
      // Primeiro ponto: usa o cashflow do dia (aporte) como base, capturando
      // o ganho instantâneo entre o preço pago e o preço de mercado naquele
      // dia. Sem isso, o TWR forçava 0 no início e descartava a diferença —
      // padrão Kinvo/B3 inclui esse ganho na rentabilidade do período.
      if (fluxo > 0) {
        retornoDia = (valorFinal + renda - fluxo) / fluxo;
        // Clamp mais largo no primeiro ponto: ganho instantâneo de até ±100%
        // pode acontecer quando o preço pago foge muito do preço de mercado
        // (CSVs de teste, doações, herança, retomada de posição antiga sem PU).
        //
        // ⚠️ Limite inclusivo em -1: retornoDia = -1 exato (cenário "comprou
        // mas saldo zero no dia") zera `cumulative` PARA SEMPRE — qualquer
        // multiplicação subsequente continua dando 0. Caso real observado em
        // usuário com transaction 2017 e FixedIncomeAsset.startDate 2020:
        // saldoBruto=0 e fluxo=50k geravam retornoDia=-1, contaminando toda
        // a série posterior com -100%. O limite anterior era `< -1`
        // (estritamente menor), deixando -1 passar.
        if (!Number.isFinite(retornoDia) || retornoDia >= 1 || retornoDia <= -1) {
          retornoDia = 0;
        }
      }
    } else {
      const valorInicial = patrimonioSeries[i - 1].saldoBruto;
      // Aporte pondera no INÍCIO do dia: o denominador inclui o fluxo positivo
      // (mesma convenção do primeiro ponto e do padrão Gorila/Kinvo). Sem isso,
      // um aporte comparável ao tamanho da carteira comprado acima/abaixo do
      // mercado tinha o ganho instantâneo dividido só pelo capital antigo —
      // no backtest Gorila a compra de HFOF11 a 99,45 (mercado ~76) saía como
      // -17,8% no dia contra -10,2% da mesma conta com o fluxo na base.
      // Resgate (fluxo < 0) segue fim-do-dia: base = valorInicial.
      const base = valorInicial + Math.max(fluxo, 0);
      if (base > 0 && valorInicial > 0) {
        retornoDia = (valorFinal + renda - valorInicial - fluxo) / base;
        if (!Number.isFinite(retornoDia) || retornoDia > 0.5 || retornoDia < -0.5) {
          retornoDia = 0;
        }
      } else if (valorFinal > 0 && fluxo > 0) {
        retornoDia = 0;
      }
    }

    cumulative *= 1 + retornoDia;
    result.push({
      data: patrimonioSeries[i].data,
      value: Math.round((cumulative - 1) * 10000) / 100,
    });
  }

  return result;
};

/**
 * TWR acumulado de uma JANELA [periodStart, fim da série] sobre a série de
 * patrimônio completa. Usado pelo builder (série live) e pelo leitor de
 * snapshots — mesma regra nos dois caminhos.
 *
 * - Início no dia 1 da carteira (ou antes): a janela É a série inteira —
 *   calcula igual ao TWR "desde o início" (1º ponto com o aporte como base),
 *   sem ponto sintético. Ticket 03/09/2026 (Pedro × Gorila, personalizado
 *   05/02/2020–01/09/2026): a âncora sintética era criada na MESMA data do 1º
 *   dia real e os dois pontos liam o mesmo aporte — o dia 1 saía como
 *   −aporte/(saldo+aporte) ≈ −50% e o acumulado caía de 208,97% pra 54,49%.
 *   Presets ("12 meses", "No ano") em carteiras mais novas que o preset
 *   caíam no mesmo caso (o front clampa o início ao 1º investimento).
 * - Início no meio da vida: âncora sintética em `periodStart` com o
 *   patrimônio do último fechamento anterior (retorno 0, sem fluxo — ver
 *   `anchoredStart`) e os pontos reais a partir daí.
 */
export const calculateHistoricoTWRPeriodo = (
  patrimonioSeries: Array<{ data: number; saldoBruto: number }>,
  cashFlowsByDay: Map<number, number>,
  incomeByDay: Map<number, number> | undefined,
  periodStart: number,
): Array<{ data: number; value: number }> => {
  const periodPatrimonio = patrimonioSeries.filter((p) => p.data >= periodStart);
  if (periodPatrimonio.length === 0) return [];
  const periodCashFlows = new Map<number, number>();
  periodPatrimonio.forEach((p) => {
    const cf = cashFlowsByDay.get(p.data);
    if (cf !== undefined && cf !== 0) periodCashFlows.set(p.data, cf);
  });

  const beforePeriod = patrimonioSeries.filter((p) => p.data < periodStart);
  if (beforePeriod.length === 0) {
    return calculateHistoricoTWR(periodPatrimonio, periodCashFlows, incomeByDay);
  }
  const anchor = {
    data: periodStart,
    saldoBruto: beforePeriod[beforePeriod.length - 1].saldoBruto,
  };
  return calculateHistoricoTWR([anchor, ...periodPatrimonio], periodCashFlows, incomeByDay, {
    anchoredStart: true,
  });
};

const fetchAssetHistoryFromDb = async (
  symbol: string,
  startDate?: Date,
): Promise<Array<{ date: number; value: number }>> => {
  const start = startDate
    ? new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
    : new Date(Date.now() - 365 * DAY_MS);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return getAssetHistory(symbol, start, end, { useBrapiFallback: true });
};

export type BuildPatrimonioHistoricoParams = {
  portfolio: PortfolioWithRelations[];
  fixedIncomeAssets: FixedIncomeAssetWithAsset[];
  stockTransactions: StockTransactionWithRelations[];
  investmentsExclReservas: InvestmentCashflowItem[];
  saldoBrutoAtual: number;
  valorAplicadoAtual: number;
  twrStartDate?: number;
  /** null/undefined = sem limite (snapshots / backfill) */
  maxHistoricoMonths?: number | null;
  /** Se true, último ponto da série usa saldoBrutoAtual/valorAplicadoAtual (comportamento da API). */
  patchLastDayWithLiveTotals: boolean;
  /**
   * Builder opcional que devolve a série diária de valor (`investedAmount * fator`) para um FI,
   * usando marcação na curva (CDI/IPCA/Tesouro PU). Sem ele, o histórico aplica apenas o
   * `annualRate` simples — CDB 100% CDI fica estagnado no histórico. Use o `createFixedIncomePricer`
   * para criar e passe o `buildValueSeriesForAsset`.
   */
  fixedIncomeValueSeriesBuilder?: (
    fi: FixedIncomeAssetWithAsset,
    timeline: number[],
  ) => Array<{ date: number; value: number }>;
  /**
   * Builder opcional que devolve a série diária de valor para uma posição que rende
   * CDI implícito (reservas de emergência/oportunidade, previdência/seguros) — para
   * que essas posições não fiquem estagnadas no histórico. Default: 100% do CDI.
   */
  implicitCdiValueSeriesBuilder?: (
    startDate: Date,
    investedAmount: number,
    indexerPercent: number,
    timeline: number[],
  ) => Array<{ date: number; value: number }>;
  /** Fim da linha do tempo (ex.: ontem no job diário). Default: hoje. */
  timelineEndDate?: Date;
  /**
   * Proventos BRUTOS por dia (chave = dia normalizado UTC, valor = soma do dia;
   * booking na DATA-COM, incl. provisionados — convenção Gorila 31/08/2026).
   * Entram no RETORNO como renda DO DIA do booking (incomeByDay do
   * calculateHistoricoTWR), NÃO como fluxo de caixa nem como caixa acumulado na
   * base — dividendo é retorno interno do período. Sem isso a série de
   * rentabilidade fica só com o preço (ex.: FII que caiu 11% mas pagou 18% de
   * dividendo aparecia como -11% no gráfico).
   */
  proventosByDay?: Map<number, number>;
};

export type BuildPatrimonioHistoricoResult = {
  historicoPatrimonio: Array<{ data: number; valorAplicado: number; saldoBruto: number }>;
  historicoTWR: Array<{ data: number; value: number }>;
  historicoTWRPeriodo: Array<{ data: number; value: number }>;
  /** Fluxo de caixa por dia para TWR (aportes/resgates + cashflow manual); útil com snapshots pré-carregados. */
  cashFlowsByDay: Map<number, number>;
  /**
   * Proventos acumulados até cada dia da timeline. A série de patrimônio
   * exibida (historicoPatrimonio) NÃO embute proventos — este map permite aos
   * consumidores (TWR/MWR, persistência de snapshots) reconstruir a série de
   * retorno total (patrimônio + proventos) quando precisarem.
   */
  proventosAcumuladosByDay: Map<number, number>;
};

// Re-export do util leve para preservar back-compat de consumers que importam
// daqui. Novas rotas devem importar diretamente de `@/utils/cashflowFilters`
// (não puxa as ~1k linhas deste arquivo).
export { filterInvestmentsExclReservas } from '@/utils/cashflowFilters';

export const buildPatrimonioHistorico = async (
  params: BuildPatrimonioHistoricoParams,
): Promise<BuildPatrimonioHistoricoResult> => {
  const {
    portfolio,
    fixedIncomeAssets,
    stockTransactions: stockTransactionsRaw,
    investmentsExclReservas,
    saldoBrutoAtual,
    valorAplicadoAtual,
    twrStartDate,
    maxHistoricoMonths = 24,
    fixedIncomeValueSeriesBuilder,
    implicitCdiValueSeriesBuilder,
    patchLastDayWithLiveTotals,
    timelineEndDate,
    proventosByDay,
  } = params;

  // Transação com data FUTURA (além do fim da timeline) fica fora do cômputo:
  // não existe fluxo realizado no futuro, e uma linha assim (legado pré-guard
  // isDataFutura, ex.: resgate digitado como 01/09 na conta qa.teste2, ago/26)
  // contaminava a série do cron E do caminho live. O guard de API bloqueia
  // novas; este filtro blinda contra as que já existem ou entram por script.
  const timelineEndGuard = normalizeDateStart(timelineEndDate ?? new Date());
  const stockTransactions = stockTransactionsRaw.filter((tx) => {
    const isFuture = normalizeDateStart(new Date(tx.date)) > timelineEndGuard;
    if (isFuture) {
      logger.warn(
        `[patrimonioHistorico] transação futura ignorada na série: id=${tx.id} date=${new Date(tx.date).toISOString().slice(0, 10)}`,
      );
    }
    return !isFuture;
  });

  const historicoPatrimonio: Array<{ data: number; valorAplicado: number; saldoBruto: number }> =
    [];
  const historicoTWR: Array<{ data: number; value: number }> = [];
  let historicoTWRPeriodo: Array<{ data: number; value: number }> = [];

  const fixedIncomeByAssetId = new Map<string, FixedIncomeAssetWithAsset>();
  fixedIncomeAssets.forEach((fi) => {
    fixedIncomeByAssetId.set(fi.assetId, fi);
  });

  const hasHistoricoData =
    stockTransactions.length > 0 || investmentsExclReservas.length > 0 || portfolio.length > 0;

  if (!hasHistoricoData) {
    return {
      historicoPatrimonio,
      historicoTWR,
      historicoTWRPeriodo,
      cashFlowsByDay: new Map(),
      proventosAcumuladosByDay: new Map(),
    };
  }

  const hoje = normalizeDateStart(timelineEndDate ?? new Date());

  const portfolioBySymbol = new Map<
    string,
    { quantity: number; avgPrice: number; isManual: boolean }
  >();
  portfolio.forEach((item) => {
    const symbol = item.asset?.symbol;
    if (!symbol) return;
    if (isImovelAssetType(item.asset?.type)) return;

    const isFixedIncome = item.assetId ? fixedIncomeByAssetId.has(item.assetId) : false;
    const isManual =
      item.asset?.type === 'emergency' ||
      item.asset?.type === 'opportunity' ||
      item.asset?.type === 'personalizado' ||
      item.asset?.type === 'imovel' ||
      symbol.startsWith('RESERVA-EMERG') ||
      symbol.startsWith('RESERVA-OPORT') ||
      symbol.startsWith('PERSONALIZADO') ||
      isFixedIncome;

    portfolioBySymbol.set(symbol, {
      quantity: item.quantity,
      avgPrice: item.avgPrice,
      isManual,
    });
  });

  const manualValuesByDay = new Map<number, number>();
  investmentsExclReservas.forEach((investment) => {
    (investment.values || []).forEach((value) => {
      const day = shiftToBusinessDay(
        normalizeDateStart(new Date(value.year, value.month, 1)).getTime(),
      );
      manualValuesByDay.set(day, (manualValuesByDay.get(day) || 0) + value.value);
    });
  });

  const transactionsBySymbol = new Map<string, Map<number, number>>();
  const cashDeltasByDay = new Map<number, number>();
  const appliedDeltasByDay = new Map<number, number>();
  const aportesByDay = new Map<number, number>();
  // F1.10/flag: cashDelta de operações marcadas rastreado em separado para que
  // o CAIXA da série as ignore (o dinheiro nunca esteve no caixa rastreado).
  // Nos fluxos externos do TWR/MWR elas CONTAM (ver comentário do helper).
  const reinvestimentoCashDeltasByDay = new Map<number, number>();
  const pricePointsBySymbol = new Map<string, Array<{ date: number; value: number }>>();
  const firstTransactionBySymbol = new Map<string, number>();
  // Custo aplicado por símbolo/dia (compra soma, venda subtrai) — base do
  // fallback de custo replayado para posições FI antes do startDate do registro.
  const appliedDeltasBySymbol = new Map<string, Map<number, number>>();

  stockTransactions.forEach((transaction) => {
    const symbol = transaction.asset?.symbol;
    if (!symbol) return;
    if (isImovelAssetType(transaction.asset?.type)) return;

    // Linhas de auditoria de evento corporativo são DISPLAY-ONLY (extrato). O
    // split já é aplicado via fator (cumulativeFactorAfter); somar o delta da
    // auditoria aqui contaria o evento DUAS vezes.
    if (isCorporateActionAuditTx(transaction.notes)) return;

    const day = shiftToBusinessDay(normalizeDateStart(transaction.date).getTime());
    const qtyDelta = transaction.type === 'compra' ? transaction.quantity : -transaction.quantity;

    if (!transactionsBySymbol.has(symbol)) {
      transactionsBySymbol.set(symbol, new Map());
    }
    const symbolDeltas = transactionsBySymbol.get(symbol)!;
    symbolDeltas.set(day, (symbolDeltas.get(day) || 0) + qtyDelta);

    const totalValue = getTransactionValue(transaction);
    const cashDelta = transaction.type === 'compra' ? -totalValue : totalValue;
    const appliedDelta = transaction.type === 'compra' ? totalValue : -totalValue;
    // F1.10 generalizado (ticket 19/08/2026): a flag vale para compra E venda
    // — resgate marcado como troca/rolagem também não é fluxo externo.
    const isReinvest = isReinvestimentoTransaction(transaction.notes);
    if (transaction.type === 'compra' && !isReinvest) {
      aportesByDay.set(day, (aportesByDay.get(day) || 0) + totalValue);
    }
    if (isReinvest) {
      reinvestimentoCashDeltasByDay.set(
        day,
        (reinvestimentoCashDeltasByDay.get(day) || 0) + cashDelta,
      );
    }
    cashDeltasByDay.set(day, (cashDeltasByDay.get(day) || 0) + cashDelta);
    appliedDeltasByDay.set(day, (appliedDeltasByDay.get(day) || 0) + appliedDelta);
    if (!appliedDeltasBySymbol.has(symbol)) {
      appliedDeltasBySymbol.set(symbol, new Map());
    }
    const symbolApplied = appliedDeltasBySymbol.get(symbol)!;
    symbolApplied.set(day, (symbolApplied.get(day) || 0) + appliedDelta);

    const priceValue =
      transaction.price > 0
        ? transaction.price
        : transaction.quantity > 0
          ? totalValue / transaction.quantity
          : 0;
    if (priceValue > 0) {
      if (!pricePointsBySymbol.has(symbol)) {
        pricePointsBySymbol.set(symbol, []);
      }
      pricePointsBySymbol.get(symbol)!.push({ date: day, value: priceValue });
    }

    if (!firstTransactionBySymbol.has(symbol)) {
      firstTransactionBySymbol.set(symbol, day);
    }
  });

  portfolio.forEach((item) => {
    const symbol = item.asset?.symbol;
    if (!symbol) return;
    if (isImovelAssetType(item.asset?.type)) return;
    if (transactionsBySymbol.has(symbol)) return;

    const day = shiftToBusinessDay(normalizeDateStart(item.lastUpdate || new Date()).getTime());
    if (!transactionsBySymbol.has(symbol)) {
      transactionsBySymbol.set(symbol, new Map());
    }
    const symbolDeltas = transactionsBySymbol.get(symbol)!;
    symbolDeltas.set(day, (symbolDeltas.get(day) || 0) + item.quantity);

    const investedValue =
      item.totalInvested > 0 ? item.totalInvested : item.quantity * item.avgPrice;
    const cashDelta = -investedValue;
    const appliedDelta = investedValue;
    cashDeltasByDay.set(day, (cashDeltasByDay.get(day) || 0) + cashDelta);
    appliedDeltasByDay.set(day, (appliedDeltasByDay.get(day) || 0) + appliedDelta);
    aportesByDay.set(day, (aportesByDay.get(day) || 0) + investedValue);

    if (item.avgPrice > 0) {
      if (!pricePointsBySymbol.has(symbol)) {
        pricePointsBySymbol.set(symbol, []);
      }
      pricePointsBySymbol.get(symbol)!.push({ date: day, value: item.avgPrice });
    }

    if (!firstTransactionBySymbol.has(symbol)) {
      firstTransactionBySymbol.set(symbol, day);
    }
  });

  const allSymbols = new Set<string>([
    ...Array.from(transactionsBySymbol.keys()),
    ...Array.from(portfolioBySymbol.keys()),
  ]);

  // Eventos corporativos (split/grupamento/bonificação) por símbolo/dia.
  // Os preços do histórico (BRAPI) são split-ADJUSTED, então a quantidade
  // histórica precisa ser normalizada pós-split — senão `qty_crua × preço_ajustado`
  // fica 10× errado em ações que sofreram desdobramento (ex.: HFOF11 10:1).
  // Carregamos aqui (1 query) pra que TODOS os callers do builder fiquem corretos.
  const corporateFactorsBySymbol = new Map<string, Map<number, number>>();
  if (allSymbols.size > 0) {
    const caRows = await prisma.assetCorporateAction.findMany({
      where: {
        symbol: { in: Array.from(allSymbols) },
        type: { in: Array.from(APPLICABLE_CORPORATE_ACTION_TYPES) },
      },
      orderBy: { date: 'asc' },
      select: { symbol: true, date: true, factor: true },
    });
    for (const ca of caRows) {
      if (!Number.isFinite(ca.factor) || ca.factor <= 0 || ca.factor === 1) continue;
      const day = shiftToBusinessDay(normalizeDateStart(ca.date).getTime());
      if (!corporateFactorsBySymbol.has(ca.symbol)) {
        corporateFactorsBySymbol.set(ca.symbol, new Map());
      }
      const m = corporateFactorsBySymbol.get(ca.symbol)!;
      // Eventos no mesmo dia normalizado compõem multiplicativamente.
      m.set(day, (m.get(day) ?? 1) * ca.factor);
    }
  }

  // Produto dos fatores de eventos ESTRITAMENTE APÓS `dayMs` — usado pra
  // des-ajustar o preço (BRAPI vem split-adjusted) de volta pra escala "crua"
  // daquela data, casando com a quantidade real (que o loop multiplica pelo
  // fator no dia do evento). Assim `qtd_real × preço_cru` é contínuo no split.
  const cumulativeFactorAfter = (symbol: string, dayMs: number): number => {
    const m = corporateFactorsBySymbol.get(symbol);
    if (!m) return 1;
    let f = 1;
    for (const [evDay, factor] of m) if (evDay > dayMs) f *= factor;
    return f;
  };

  const timelineStartCandidates: number[] = [];
  const txSemImovel = stockTransactions.filter((t) => !isImovelAssetType(t.asset?.type));
  if (txSemImovel.length > 0) {
    timelineStartCandidates.push(normalizeDateStart(txSemImovel[0].date).getTime());
  }
  if (manualValuesByDay.size > 0) {
    timelineStartCandidates.push(Math.min(...Array.from(manualValuesByDay.keys())));
  }
  const portfolioSemImovel = portfolio.filter((item) => !isImovelAssetType(item.asset?.type));
  if (portfolioSemImovel.length > 0) {
    const earliestPortfolioDate = Math.min(
      ...portfolioSemImovel
        .map((item) => normalizeDateStart(item.lastUpdate || new Date()).getTime())
        .filter((value) => Number.isFinite(value)),
    );
    if (Number.isFinite(earliestPortfolioDate)) {
      timelineStartCandidates.push(earliestPortfolioDate);
    }
  }
  if (fixedIncomeAssets.length > 0) {
    const earliestFixedIncomeDate = Math.min(
      ...fixedIncomeAssets
        .map((item) => normalizeDateStart(new Date(item.startDate)).getTime())
        .filter((value) => Number.isFinite(value)),
    );
    if (Number.isFinite(earliestFixedIncomeDate)) {
      timelineStartCandidates.push(earliestFixedIncomeDate);
    }
  }
  const rawTimelineStart =
    timelineStartCandidates.length > 0
      ? new Date(Math.min(...timelineStartCandidates))
      : new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1);

  let timelineStart = rawTimelineStart;
  if (maxHistoricoMonths != null && Number.isFinite(maxHistoricoMonths)) {
    const minStart = new Date(hoje.getFullYear(), hoje.getMonth() - maxHistoricoMonths, 1);
    timelineStart = rawTimelineStart.getTime() < minStart.getTime() ? minStart : rawTimelineStart;
  }

  const timeline = buildDailyTimeline(timelineStart, hoje);

  // Cada FI symbol tem uma série de VALOR TOTAL DA POSIÇÃO por dia (investedAmount × factor),
  // não preço unitário. Mantemos isolado de pricesBySymbol pra evitar que o builder
  // multiplique por qty (qty>1 quando o usuário cadastrou cotas como qty num fundo
  // erroneamente classificado como FI, inflando o saldo em quantity vezes).
  const fixedIncomeValuesBySymbol = new Map<string, Map<number, number>>();
  fixedIncomeAssets.forEach((fixedIncome) => {
    const symbol = fixedIncome.asset?.symbol;
    if (!symbol) return;
    // Quando disponível, usa marcação na curva (CDI/IPCA/Tesouro PU) — caso contrário, cai
    // no fallback simples baseado em annualRate (estagnado para CDBs 100% CDI).
    const points = fixedIncomeValueSeriesBuilder
      ? fixedIncomeValueSeriesBuilder(fixedIncome, timeline)
      : timeline.map((day) => ({
          date: day,
          value: calculateFixedIncomeValue(fixedIncome, new Date(day)),
        }));
    const valueByDay = new Map<number, number>();
    points.forEach((p) => valueByDay.set(p.date, p.value));

    // Posição com transação NUNCA vale 0 na série. Quando o FixedIncomeAsset
    // foi criado depois das primeiras compras (registro nascido num aporte
    // posterior, importação, QA), a curva valora 0 antes do startDate — mas o
    // fluxo da compra conta no TWR, gerando um degrau de −F/(V+F) no dia da
    // compra e o salto simétrico quando o startDate "começa" (bug qa.teste2
    // ago/2026: −13,43% e +13,63% num dia). No intervalo [1ª transação,
    // startDate) a posição vale o CUSTO replayado das transações.
    const fiStartTs = normalizeDateStart(new Date(fixedIncome.startDate)).getTime();
    const firstTxTs = firstTransactionBySymbol.get(symbol);
    if (firstTxTs != null && firstTxTs < fiStartTs) {
      const applied = appliedDeltasBySymbol.get(symbol);
      let custoReplayado = 0;
      for (const day of timeline) {
        if (day >= fiStartTs) break;
        custoReplayado += applied?.get(day) ?? 0;
        if (day >= firstTxTs && custoReplayado > 0 && (valueByDay.get(day) ?? 0) === 0) {
          valueByDay.set(day, Math.round(custoReplayado * 100) / 100);
        }
      }
    }

    fixedIncomeValuesBySymbol.set(symbol, valueByDay);
  });

  // Curva CDI 100% implícita para Reservas (emergência/oportunidade) e Previdência/Seguros:
  // não temos um FixedIncomeAsset registrado pra elas, mas o usuário espera que rendam.
  // Default 100% do CDI até cadastro explícito do indexador no asset.
  if (implicitCdiValueSeriesBuilder) {
    portfolio.forEach((item) => {
      const symbol = item.asset?.symbol;
      if (!symbol) return;
      // Skip se já temos curva FI explícita (ex.: reserva alocada num CDB cadastrado).
      if (fixedIncomeValuesBySymbol.has(symbol)) return;
      const isReserva =
        item.asset?.type === 'emergency' ||
        item.asset?.type === 'opportunity' ||
        symbol.startsWith('RESERVA-EMERG') ||
        symbol.startsWith('RESERVA-OPORT');
      const isPrevidenciaSeguro = item.asset?.type === 'previdencia';
      if (!isReserva && !isPrevidenciaSeguro) return;
      const investedAmount =
        item.totalInvested > 0 ? item.totalInvested : item.quantity * item.avgPrice;
      if (investedAmount <= 0) return;
      const firstTxTs = firstTransactionBySymbol.get(symbol);
      const startDate = firstTxTs
        ? new Date(firstTxTs)
        : item.lastUpdate
          ? new Date(item.lastUpdate)
          : new Date(timelineStart);
      const points = implicitCdiValueSeriesBuilder(startDate, investedAmount, 100, timeline);
      const valueByDay = new Map<number, number>();
      points.forEach((p) => valueByDay.set(p.date, p.value));
      fixedIncomeValuesBySymbol.set(symbol, valueByDay);
    });
  }

  const pricesBySymbol = new Map<string, Map<number, number>>();
  const fallbackPriceBySymbol = new Map<string, number>();

  const symbolsToFetch = [...allSymbols].filter(
    (s) => !(portfolioBySymbol.get(s)?.isManual ?? false),
  );
  const fetchedHistories = await Promise.all(
    symbolsToFetch.map((symbol) => fetchAssetHistoryFromDb(symbol, timelineStart)),
  );
  const historyBySymbol = new Map(symbolsToFetch.map((s, i) => [s, fetchedHistories[i] ?? []]));

  for (const symbol of allSymbols) {
    // Símbolos com curva FI são contabilizados via valor total da posição
    // (fixedIncomeValuesBySymbol) — não popular pricesBySymbol pra eles, senão o
    // valor total entraria como "preço unitário" e seria multiplicado por qty.
    if (fixedIncomeValuesBySymbol.has(symbol)) continue;

    const portfolioInfo = portfolioBySymbol.get(symbol);
    const isManual = portfolioInfo?.isManual ?? false;
    // Preço pago na transação é CRU; o histórico BRAPI é split-adjusted. Ajusta
    // o preço da transação (÷ fator dos eventos após a data) pra ficar na mesma
    // escala do histórico — senão o dia da compra vira um spike.
    const pricePoints = (pricePointsBySymbol.get(symbol) || []).map((p) => {
      const f = cumulativeFactorAfter(symbol, p.date);
      return f !== 1 ? { date: p.date, value: p.value / f } : p;
    });

    let history: Array<{ date: number; value: number }> = [];
    if (!isManual) {
      // Preço de mercado (brapi/AssetPriceHistory) tem prioridade sobre o
      // preço pago no tx. Sem isso, comprar 30 ações ITUB4 a R$33 num dia em
      // que o mercado fecha em R$44 sobrescrevia o priceMap pra R$33 — o
      // saldo "perdia" R$11 × posição_total nesse dia, distorcendo o TWR.
      // Pricepoints só preenchem dias em que a brapi não publicou cotação.
      // getAssetHistory já devolve preço split-ADJUSTED consistente (normaliza as
      // linhas cruas do COTAHIST), na mesma escala da quantidade normalizada e do
      // preço da transação des-ajustado (÷ fator) acima.
      const brapi = historyBySymbol.get(symbol) ?? [];
      const brapiDays = new Set(brapi.map((h) => normalizeDateStart(new Date(h.date)).getTime()));
      const supplemental = pricePoints.filter((p) => !brapiDays.has(p.date));
      history = [...brapi, ...supplemental];
    } else {
      history = [...pricePoints];
    }

    const initialPrice = pricePoints.length > 0 ? pricePoints[0]?.value : portfolioInfo?.avgPrice;

    if (isManual && portfolioInfo?.avgPrice && portfolioInfo.avgPrice > 0) {
      // Reservas/personalizados/imóveis sem curva: linha plana no avgPrice.
      history = [
        { date: timelineStart.getTime(), value: portfolioInfo.avgPrice },
        { date: hoje.getTime(), value: portfolioInfo.avgPrice },
      ];
    } else if (history.length === 0 && initialPrice && initialPrice > 0) {
      history.push({ date: timelineStart.getTime(), value: initialPrice });
    }

    if (initialPrice && initialPrice > 0) {
      fallbackPriceBySymbol.set(symbol, initialPrice);
    }

    pricesBySymbol.set(symbol, buildDailyPriceMap(history, timeline, initialPrice));
  }

  const quantitiesBySymbol = new Map<string, number>();
  const timelineStartTs = timeline.length > 0 ? timeline[0] : hoje.getTime();
  allSymbols.forEach((symbol) => {
    const portfolioInfo = portfolioBySymbol.get(symbol);
    const firstTx = firstTransactionBySymbol.get(symbol);
    // Use portfolio quantity when there are no transactions, OR when all
    // transactions are before the timeline start (e.g. maxHistoricoMonths
    // truncated the timeline past the purchase date).
    const allTxBeforeTimeline = firstTx !== undefined && firstTx < timelineStartTs;
    const hasNoTransactionsInTimeline =
      !firstTransactionBySymbol.has(symbol) || allTxBeforeTimeline;

    if (portfolioInfo && hasNoTransactionsInTimeline) {
      quantitiesBySymbol.set(symbol, portfolioInfo.quantity);
    } else {
      quantitiesBySymbol.set(symbol, 0);
    }
  });

  const rendimentosByDay = new Map<number, number>();
  let cashBalance = 0;
  let rendimentosAcumulados = 0;
  let proventosAcumulados = 0;
  let manualInvestmentsValue = 0;
  let valorAplicadoDia = 0;
  // Série EXIBIDA: só valor de mercado (patrimônio de fato, bate com o card
  // Saldo Bruto). Proventos ficam fora — iam pra série e o gráfico terminava
  // acima do card (ex.: +23% no QA).
  const patrimonioSeries: Array<{ data: number; valorAplicado: number; saldoBruto: number }> = [];
  // Acumulado por dia continua exposto (MWR de retorno total + persistência de
  // snapshots). O TWR NÃO usa mais o acumulado: consome a série de patrimônio
  // com o provento do dia como renda (ver calculateHistoricoTWR/incomeByDay).
  const proventosAcumuladosByDay = new Map<number, number>();

  // Pre-seed valorAplicado and cashBalance from transactions before the timeline.
  // Without this, assets bought years ago but with maxHistoricoMonths truncation
  // would show as having zero invested capital, distorting TWR.
  for (const [day, delta] of appliedDeltasByDay) {
    if (day < timelineStartTs) valorAplicadoDia += delta;
  }
  for (const [day, delta] of aportesByDay) {
    if (day < timelineStartTs) cashBalance += delta;
  }
  for (const [day, delta] of cashDeltasByDay) {
    // Operação marcada (flag "já investido") não passa pelo caixa da série.
    if (day < timelineStartTs) cashBalance += delta - (reinvestimentoCashDeltasByDay.get(day) || 0);
  }
  // Proventos recebidos antes do início da janela já contam como retorno acumulado.
  if (proventosByDay) {
    for (const [day, valor] of proventosByDay) {
      if (day < timelineStartTs) proventosAcumulados += valor;
    }
  }

  for (const day of timeline) {
    if (manualValuesByDay.has(day)) {
      manualInvestmentsValue = manualValuesByDay.get(day) || 0;
    }

    if (aportesByDay.has(day)) {
      cashBalance += aportesByDay.get(day) || 0;
    }

    if (cashDeltasByDay.has(day)) {
      // Operação marcada (flag "já investido") não passa pelo caixa da série:
      // sem o desconto, a compra marcada debitava −X sem o aporte +X e a série
      // perdia o principal (ficava só o rendimento).
      cashBalance +=
        (cashDeltasByDay.get(day) || 0) - (reinvestimentoCashDeltasByDay.get(day) || 0);
    }

    if (rendimentosByDay.has(day)) {
      const rendimento = rendimentosByDay.get(day) || 0;
      cashBalance += rendimento;
      rendimentosAcumulados += rendimento;
    }

    if (appliedDeltasByDay.has(day)) {
      valorAplicadoDia += appliedDeltasByDay.get(day) || 0;
    }

    if (proventosByDay?.has(day)) {
      proventosAcumulados += proventosByDay.get(day) || 0;
    }

    transactionsBySymbol.forEach((deltas, symbol) => {
      const qtyDelta = deltas.get(day);
      if (!qtyDelta) return;
      // Normaliza o delta pra escala pós-split (× fator dos eventos APÓS a data),
      // pra a quantidade ficar constante em termos atuais e casar com o preço
      // ajustado (BRAPI) — saldo contínuo no split, sem 10× errado.
      const norm = qtyDelta * cumulativeFactorAfter(symbol, day);
      quantitiesBySymbol.set(symbol, (quantitiesBySymbol.get(symbol) || 0) + norm);
    });

    let valorMercadoAtivos = 0;
    allSymbols.forEach((symbol) => {
      // FI: valor total da posição já vem do pricer (investedAmount × factor).
      // Não multiplicar por qty aqui — ignora o quantity arbitrário do portfolio
      // (qty=1 pra FI normal, qty=N quando o user cadastrou cotas indevidamente).
      const fiValues = fixedIncomeValuesBySymbol.get(symbol);
      if (fiValues) {
        const v = fiValues.get(day);
        if (v && Number.isFinite(v) && v > 0) valorMercadoAtivos += v;
        return;
      }

      const quantity = quantitiesBySymbol.get(symbol) || 0;
      if (!quantity) return;

      const priceMap = pricesBySymbol.get(symbol);
      const price = priceMap?.get(day) ?? fallbackPriceBySymbol.get(symbol);
      if (!price || !Number.isFinite(price) || price <= 0) return;
      valorMercadoAtivos += quantity * price;
    });

    const saldoBrutoDia =
      valorMercadoAtivos + manualInvestmentsValue + cashBalance + rendimentosAcumulados;

    const valorAplicadoRounded2 = Math.round(valorAplicadoDia * 100) / 100;
    patrimonioSeries.push({
      data: day,
      valorAplicado: valorAplicadoRounded2,
      saldoBruto: Math.round(saldoBrutoDia * 100) / 100,
    });
    proventosAcumuladosByDay.set(day, Math.round(proventosAcumulados * 100) / 100);
  }

  // Backfill: se todos os saldoBruto são 0 mas o valor atual é > 0 (sem histórico de preços no DB),
  // preenche a série com o valor atual para evitar linha invisível no gráfico
  const allSaldoZero =
    patrimonioSeries.length > 0 && patrimonioSeries.every((p) => p.saldoBruto === 0);
  if (allSaldoZero && saldoBrutoAtual > 0) {
    const rounded = Math.round(saldoBrutoAtual * 100) / 100;
    patrimonioSeries.forEach((p) => {
      p.saldoBruto = rounded;
    });
  }

  const saldoBrutoRounded =
    Math.round((saldoBrutoAtual > 0 ? saldoBrutoAtual : valorAplicadoAtual) * 100) / 100;
  const valorAplicadoRounded = Math.round(valorAplicadoAtual * 100) / 100;
  if (patrimonioSeries.length > 0) {
    if (patchLastDayWithLiveTotals) {
      const last = patrimonioSeries.length - 1;
      patrimonioSeries[last].saldoBruto = saldoBrutoRounded;
      patrimonioSeries[last].valorAplicado = valorAplicadoRounded;
    }
  } else {
    const acumFinal = Math.round(proventosAcumulados * 100) / 100;
    patrimonioSeries.push({
      data: hoje.getTime(),
      valorAplicado: valorAplicadoRounded,
      saldoBruto: saldoBrutoRounded,
    });
    proventosAcumuladosByDay.set(hoje.getTime(), acumFinal);
  }

  historicoPatrimonio.push(...patrimonioSeries);

  const cashFlowsByDay = new Map<number, number>();
  timeline.forEach((day) => {
    const cashDelta = cashDeltasByDay.get(day) ?? 0;
    // Operação marcada (flag "já investido") CONTA como fluxo externo: capital
    // entrando/saindo do universo medido é neutralizado no TWR/MWR — senão o
    // valor da posição aparecendo na série vira retorno espúrio (ticket 20/08:
    // posição pré-existente de 110k lida como +133% de TWR). O provento
    // reinvestido continua contado uma única vez, como renda no booking
    // (incomeByDay).
    const manualVal = manualValuesByDay.get(day) ?? 0;
    cashFlowsByDay.set(day, -cashDelta + manualVal);
  });

  // TWR: série de patrimônio (valor de mercado) + provento do dia como RENDA
  // (incomeByDay). O provento entra no retorno do dia do booking e sai da base
  // nos dias seguintes — retorno total padrão Gorila/Kinvo, sem a diluição do
  // caixa acumulado que a série-sombra antiga (patrimônio + acumulado) causava.
  historicoTWR.push(...calculateHistoricoTWR(patrimonioSeries, cashFlowsByDay, proventosByDay));

  if (typeof twrStartDate === 'number' && Number.isFinite(twrStartDate) && twrStartDate > 0) {
    const periodStart = normalizeDateStart(new Date(twrStartDate)).getTime();
    const periodEnd = hoje.getTime();
    if (periodStart <= periodEnd) {
      historicoTWRPeriodo = calculateHistoricoTWRPeriodo(
        patrimonioSeries,
        cashFlowsByDay,
        proventosByDay,
        periodStart,
      );
    }
  }

  return {
    historicoPatrimonio,
    historicoTWR,
    historicoTWRPeriodo,
    cashFlowsByDay,
    proventosAcumuladosByDay,
  };
};

/**
 * Apenas mapa de fluxos de caixa (sem preços / série de patrimônio). Para TWR em cima de snapshots.
 */
export const buildPatrimonioCashFlowsByDayOnly = (
  portfolio: PortfolioWithRelations[],
  _fixedIncomeAssets: FixedIncomeAssetWithAsset[],
  stockTransactions: StockTransactionWithRelations[],
  investmentsExclReservas: InvestmentCashflowItem[],
  timeline: number[],
): Map<number, number> => {
  const manualValuesByDay = new Map<number, number>();
  investmentsExclReservas.forEach((investment) => {
    (investment.values || []).forEach((value) => {
      const day = shiftToBusinessDay(
        normalizeDateStart(new Date(value.year, value.month, 1)).getTime(),
      );
      manualValuesByDay.set(day, (manualValuesByDay.get(day) || 0) + value.value);
    });
  });

  const cashDeltasByDay = new Map<number, number>();

  stockTransactions.forEach((transaction) => {
    const symbol = transaction.asset?.symbol;
    if (!symbol) return;
    if (isImovelAssetType(transaction.asset?.type)) return;

    const day = shiftToBusinessDay(normalizeDateStart(transaction.date).getTime());
    const totalValue = getTransactionValue(transaction);
    const cashDelta = transaction.type === 'compra' ? -totalValue : totalValue;
    // Operações marcadas (flag "já investido") CONTAM como fluxo externo do
    // TWR/MWR — mesma semântica do builder principal (ver comentário do helper
    // isReinvestimentoTransaction). A exclusão antiga fazia o valor da posição
    // marcada virar retorno espúrio no caminho dos snapshots (ticket 20/08).
    cashDeltasByDay.set(day, (cashDeltasByDay.get(day) || 0) + cashDelta);
  });

  portfolio.forEach((item) => {
    const symbol = item.asset?.symbol;
    if (!symbol) return;
    if (isImovelAssetType(item.asset?.type)) return;

    const hasTx = stockTransactions.some((t) => t.asset?.symbol === symbol);
    if (hasTx) return;

    const day = shiftToBusinessDay(normalizeDateStart(item.lastUpdate || new Date()).getTime());
    const investedValue =
      item.totalInvested > 0 ? item.totalInvested : item.quantity * item.avgPrice;
    const cashDelta = -investedValue;
    cashDeltasByDay.set(day, (cashDeltasByDay.get(day) || 0) + cashDelta);
  });

  const cashFlowsByDay = new Map<number, number>();
  timeline.forEach((day) => {
    const cashDelta = cashDeltasByDay.get(day) ?? 0;
    const manualVal = manualValuesByDay.get(day) ?? 0;
    cashFlowsByDay.set(day, -cashDelta + manualVal);
  });

  return cashFlowsByDay;
};

/**
 * Início bruto da linha do tempo (sem cap de meses). Usado para leitura de snapshots.
 */
export const getRawPatrimonioTimelineStart = (
  stockTransactions: StockTransactionWithRelations[],
  portfolio: PortfolioWithRelations[],
  investmentsExclReservas: InvestmentCashflowItem[],
  fixedIncomeAssets: FixedIncomeAssetWithAsset[],
  fallbackWhenEmpty: Date,
): Date => {
  const manualValuesByDay = new Map<number, number>();
  investmentsExclReservas.forEach((investment) => {
    (investment.values || []).forEach((value) => {
      const day = normalizeDateStart(new Date(value.year, value.month, 1)).getTime();
      manualValuesByDay.set(day, (manualValuesByDay.get(day) || 0) + value.value);
    });
  });

  const timelineStartCandidates: number[] = [];
  if (stockTransactions.length > 0) {
    timelineStartCandidates.push(normalizeDateStart(stockTransactions[0].date).getTime());
  }
  if (manualValuesByDay.size > 0) {
    timelineStartCandidates.push(Math.min(...Array.from(manualValuesByDay.keys())));
  }
  if (portfolio.length > 0) {
    const earliestPortfolioDate = Math.min(
      ...portfolio
        .map((item) => normalizeDateStart(item.lastUpdate || new Date()).getTime())
        .filter((value) => Number.isFinite(value)),
    );
    if (Number.isFinite(earliestPortfolioDate)) {
      timelineStartCandidates.push(earliestPortfolioDate);
    }
  }
  if (fixedIncomeAssets.length > 0) {
    const earliestFixedIncomeDate = Math.min(
      ...fixedIncomeAssets
        .map((item) => normalizeDateStart(new Date(item.startDate)).getTime())
        .filter((value) => Number.isFinite(value)),
    );
    if (Number.isFinite(earliestFixedIncomeDate)) {
      timelineStartCandidates.push(earliestFixedIncomeDate);
    }
  }
  if (timelineStartCandidates.length === 0) {
    return fallbackWhenEmpty;
  }
  return new Date(Math.min(...timelineStartCandidates));
};
