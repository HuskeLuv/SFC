import prisma from '@/lib/prisma';
import { overrideEfetivo, type CategoriaMovivel } from '@/lib/carteiraMover';

/**
 * Fonte única dos aportes/resgates mensais derivados das transações reais da
 * carteira. Consumida pela rota `GET /api/cashflow/investimentos` (linha
 * Aporte/Resgate da planilha) e pelo cálculo/snapshot da Evolução do
 * Patrimônio — as duas visões precisam da MESMA semântica de sinal, taxas e
 * exclusão de reinvestimentos.
 */

export const mapTransactionToTipo = (transaction: {
  asset?: { type?: string | null; symbol?: string | null } | null;
}) => {
  const assetType = transaction.asset?.type || '';
  if (assetType === 'stock') return 'stock';
  if (assetType === 'fii') return 'fii';
  switch (assetType) {
    case 'emergency':
      return 'emergency';
    case 'opportunity':
      return 'opportunity';
    case 'personalizado':
      return 'personalizado';
    case 'imovel':
      return 'real_estate';
    case 'crypto':
      return 'crypto';
    case 'currency':
      return 'currency';
    case 'etf':
      return 'etf';
    case 'reit':
      return 'reit';
    case 'bdr':
      return 'bdr';
    case 'fund':
      return 'fund';
    case 'bond':
      return 'bond';
    // Tesouro Direto e debêntures são renda fixa → mesmo bucket "Renda Fixa &
    // Fundos Renda Fixa". Sem estes cases, aportes em Tesouro/debênture entravam
    // na carteira mas SUMIAM do fluxo de caixa (caíam no default 'outros').
    case 'tesouro-direto':
      return 'bond';
    case 'debenture':
      return 'bond';
    case 'insurance':
      return 'insurance';
    // O catálogo usa o type 'previdencia'; o item de cashflow é 'insurance'
    // ("Previdência e Seguros"). Sem este case, aportes de previdência sumiam.
    case 'previdencia':
      return 'insurance';
    case 'cash':
      return 'cash';
    default:
      return assetType || 'outros';
  }
};

/**
 * Decisão 5 do mover na Carteira (01/10/2026): aportes e resgates de um ativo
 * movido de ABA vão para a linha da aba nova em todos os meses (o total não
 * muda, só a linha). Troca só de seção não mexe no Fluxo.
 */
export const FLUXO_SEGUE_ABA = true;

/** Aba escolhida no mover → linha do Aporte/Resgate (tipos de `mapTransactionToTipo`). */
export const TIPO_FLUXO_DA_CATEGORIA: Record<CategoriaMovivel, string> = {
  acoes: 'stock',
  stocks: 'stock',
  fiis: 'fii',
  etfs: 'etf',
  reits: 'reit',
  fimFia: 'fund',
  // Fase 2 do mover (Reservas + Renda Fixa, atrás de MOVER_CAIXA_RF_HABILITADO). Só a
  // entrada: a precedência override × tesouroDestino no loop é da Fatia C.
  reservaEmergencia: 'emergency',
  reservaOportunidade: 'opportunity',
  rendaFixaFundos: 'bond',
};

/**
 * Linha do Aporte/Resgate de um ativo movido de aba. null quando o override
 * não vale (nulo, igual à aba base, inválido ou ativo fora das abas movíveis):
 * aí vale `mapTransactionToTipo` — inclusive a troca só de seção, BDR e
 * fia/multimercado sem override.
 */
export const tipoFluxoDoOverride = (
  asset: { symbol?: string | null; type?: string | null; currency?: string | null } | null,
  categoriaOverride: string | null | undefined,
): string | null => {
  if (!FLUXO_SEGUE_ABA || !asset) return null;
  const movido = overrideEfetivo({ ...asset, symbol: asset.symbol ?? '' }, categoriaOverride);
  return movido ? TIPO_FLUXO_DA_CATEGORIA[movido] : null;
};

/**
 * Resgate total apaga o Portfolio (e o override junto). A rota de resgate grava
 * a aba do item movido em `notes.operation.categoriaOverride` da venda; para o
 * ativo que não tem mais posição, o Fluxo usa a da venda mais recente — assim o
 * histórico (inclusive a própria venda) não volta para a linha da aba base.
 * Ativo com posição de novo (recomprado): vale o Portfolio atual.
 */
export const overrideDaVenda = (notes: string | null | undefined): string | null => {
  if (!notes) return null;
  try {
    const parsed = JSON.parse(notes);
    const valor = parsed?.operation?.categoriaOverride;
    return typeof valor === 'string' && valor ? valor : null;
  } catch {
    return null;
  }
};

async function completarOverrideDeVendidos(
  userId: string,
  overridePorAsset: Map<string, string>,
): Promise<void> {
  // A venda MAIS RECENTE de cada ativo decide: se ela não gravou aba (o item
  // tinha voltado para a aba base antes do resgate), o Fluxo usa a aba base.
  const vendas = await prisma.stockTransaction.findMany({
    where: { userId, type: 'venda', assetId: { not: null } },
    select: { assetId: true, notes: true },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    distinct: ['assetId'],
  });
  const daVenda = new Map<string, string>();
  const vistos = new Set<string>();
  for (const venda of vendas) {
    if (!venda.assetId || vistos.has(venda.assetId)) continue;
    vistos.add(venda.assetId);
    const override = overrideDaVenda(venda.notes);
    if (override) daVenda.set(venda.assetId, override);
  }
  if (daVenda.size === 0) return;
  const comPosicao = await prisma.portfolio.findMany({
    where: { userId, assetId: { in: [...daVenda.keys()] } },
    select: { assetId: true },
  });
  const ativos = new Set(comPosicao.map((p) => p.assetId));
  for (const [assetId, override] of daVenda) {
    if (!ativos.has(assetId) && !overridePorAsset.has(assetId)) {
      overridePorAsset.set(assetId, override);
    }
  }
}

/**
 * F1.10: detecta reinvestimento de proventos a partir do JSON `notes` da
 * StockTransaction. Operações marcadas com `notes.operation.action =
 * 'reinvestimento'` são compras feitas com dividendo/JCP/rendimento recebido
 * — o dinheiro não é capital novo. Ficam segregadas em uma categoria
 * "Reinvestimentos de Proventos", fora das somas normais de aporte/resgate.
 */
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
 * Conversão USD→BRL dos totais de transação para a planilha (100% BRL).
 *
 * Convenção de gravação HOJE (rota operacao): stocks convertem na ESCRITA
 * (total/price já em BRL); REIT grava total na moeda de origem (USD) — a aba
 * REIT converte no display — e o câmbio da compra fica em notes.cotacaoMoeda.
 * Sem esta conversão, um aporte de US$ 300 entrava como R$ 300 no
 * Aporte/Resgate, na Evolução do Patrimônio e na base aplicada.
 *
 * Vendas (rota resgate) não gravam câmbio: usa o último câmbio conhecido do
 * mesmo ativo (compra anterior, iterando em ordem cronológica); sem nenhum,
 * mantém o valor bruto (melhor aproximação disponível).
 */
export interface TransacaoParaConversao {
  total: number;
  fees?: number | null;
  notes?: string | null;
  assetId?: string | null;
  asset?: { type?: string | null; currency?: string | null } | null;
}

const cotacaoMoedaFromNotes = (notes: string | null | undefined): number | null => {
  if (!notes) return null;
  try {
    const parsed = JSON.parse(notes);
    const rate = Number(parsed?.cotacaoMoeda ?? parsed?.operation?.cotacaoMoeda);
    return Number.isFinite(rate) && rate > 0 ? rate : null;
  } catch {
    return null;
  }
};

const isUsdStoredTransaction = (t: TransacaoParaConversao): boolean =>
  t.asset?.type === 'reit' && t.asset?.currency === 'USD';

/** Total + taxas da transação em BRL. Atualiza `lastRateByAsset` quando a
 * transação carrega câmbio próprio (compras), para reuso nas vendas. */
export function totalBRLTransacao(
  t: TransacaoParaConversao,
  lastRateByAsset: Map<string, number>,
): number {
  const bruto = t.total + (t.fees || 0);
  if (!isUsdStoredTransaction(t)) return bruto;
  const rateFromNotes = cotacaoMoedaFromNotes(t.notes);
  if (rateFromNotes && t.assetId) lastRateByAsset.set(t.assetId, rateFromNotes);
  const rate = rateFromNotes ?? (t.assetId ? lastRateByAsset.get(t.assetId) : undefined);
  return rate ? bruto * rate : bruto;
}

export interface InvestimentosPorMes {
  /** { tipoAtivo: { mes(0-11): valor } } — inclui buckets 'reinvestimento' e 'planejamento'. */
  porTipo: Record<string, Record<number, number>>;
  /** Aportes (+) / resgates (−) somados por mês, SEM reinvestimentos nem planejamento. */
  totaisPorMes: number[];
  /**
   * Líquido mensal dos ativos VINCULADOS A SONHO (Portfolio.planejamentoObjetivoId).
   * Esses aportes viram o realizado da linha-espelho do sonho (despesa do grupo
   * Planejamento Financeiro) — por isso saem de `totaisPorMes` (senão o mesmo
   * dinheiro seria subtraído 2× do Fluxo de Caixa Livre). A Evolução do
   * Patrimônio soma `totaisPorMes + planejamentoPorMes + reinvestimentoPorMes`
   * (série cheia).
   */
  planejamentoPorMes: number[];
  /**
   * Líquido mensal das operações marcadas com a flag "dinheiro já estava
   * investido" (action 'reinvestimento': reinvestimento de proventos, rolagem,
   * trade, posição pré-existente). Fora do Aporte/Resgate e do Fluxo de Caixa
   * Livre (não é dinheiro que passou pelo caixa), mas o aporte nominal É
   * patrimônio — a Evolução do Patrimônio precisa desta série; sem ela a
   * compra marcada sumia do ano e reaparecia só na base aplicada da virada.
   */
  reinvestimentoPorMes: number[];
  /** Tipos de ativo com movimento (inclui 'reinvestimento'/'planejamento' quando houver). */
  tipos: Set<string>;
}

/**
 * Agrega compra/venda (total + taxas, venda negativa) por tipo de ativo × mês
 * para um ano. Reinvestimentos e ativos vinculados a sonho vão para buckets
 * dedicados e ficam fora de `totaisPorMes` (preserva a semântica Aporte/Resgate
 * do fluxo de caixa e evita dupla contagem com a linha do sonho).
 */
export async function computeInvestimentosPorMes(
  userId: string,
  year: number,
): Promise<InvestimentosPorMes> {
  const [transacoes, vinculados, comprasTesouro, movidos] = await Promise.all([
    prisma.stockTransaction.findMany({
      where: {
        userId,
        type: { in: ['compra', 'venda'] },
        date: {
          gte: new Date(Date.UTC(year, 0, 1)),
          lt: new Date(Date.UTC(year + 1, 0, 1)),
        },
      },
      include: { asset: true },
      orderBy: { date: 'asc' },
    }),
    prisma.portfolio.findMany({
      where: { userId, planejamentoObjetivoId: { not: null } },
      select: { assetId: true },
    }),
    // Compras de Tesouro de CATÁLOGO do usuário (qualquer ano): o destino
    // (reserva × renda fixa) vive nas notes da compra, não no Asset.
    prisma.stockTransaction.findMany({
      where: { userId, type: 'compra', notes: { not: null }, asset: { type: 'tesouro-direto' } },
      select: { assetId: true, notes: true },
    }),
    // Posições movidas de aba (mover na Carteira): a linha segue a aba nova.
    FLUXO_SEGUE_ABA
      ? prisma.portfolio.findMany({
          where: { userId, categoriaOverride: { not: null } },
          select: { assetId: true, categoriaOverride: true },
        })
      : Promise.resolve([] as { assetId: string | null; categoriaOverride: string | null }[]),
  ]);

  const overridePorAsset = new Map<string, string>();
  for (const p of movidos) {
    if (p.assetId && p.categoriaOverride) overridePorAsset.set(p.assetId, p.categoriaOverride);
  }
  if (FLUXO_SEGUE_ABA) await completarOverrideDeVendidos(userId, overridePorAsset);

  const assetsDeSonho = new Set(
    vinculados.map((p) => p.assetId).filter((id): id is string => id != null),
  );

  // Tesouro de catálogo comprado como RESERVA: o Asset é compartilhado e mantém
  // type 'tesouro-direto' — mapTransactionToTipo mandava aporte E resgate pra
  // linha Renda Fixa do Aporte/Resgate (report 10/08: "lançamento Reserva
  // Oportunidade indo para Renda Fixa"). Marca por ATIVO usando o mesmo
  // critério das abas de reserva (notes.tesouroDestino da compra) — por ativo,
  // e não por transação, porque as VENDAS não carregam o destino nas notes.
  const reservaTesouroPorAsset = new Map<string, 'emergency' | 'opportunity'>();
  for (const compra of comprasTesouro) {
    if (!compra.assetId || !compra.notes) continue;
    try {
      const parsed = JSON.parse(compra.notes);
      const destino = parsed?.tesouroDestino ?? parsed?.operation?.tesouroDestino;
      if (destino === 'reserva-emergencia') {
        reservaTesouroPorAsset.set(compra.assetId, 'emergency');
      } else if (destino === 'reserva-oportunidade') {
        reservaTesouroPorAsset.set(compra.assetId, 'opportunity');
      }
    } catch {
      // notas malformadas: segue a classificação por asset.type
    }
  }

  const porTipo: Record<string, Record<number, number>> = {};
  const tipos = new Set<string>();
  const lastRateByAsset = new Map<string, number>();

  for (const transacao of transacoes) {
    if (!transacao.asset) continue;

    const mes = transacao.date.getMonth();
    const valor =
      totalBRLTransacao(transacao, lastRateByAsset) * (transacao.type === 'venda' ? -1 : 1);
    const tipoReservaTesouro = transacao.assetId
      ? reservaTesouroPorAsset.get(transacao.assetId)
      : undefined;
    const tipoAtivo = isReinvestimentoTransaction(transacao.notes)
      ? 'reinvestimento'
      : transacao.assetId && assetsDeSonho.has(transacao.assetId)
        ? 'planejamento'
        : (tipoReservaTesouro ??
          (transacao.assetId
            ? tipoFluxoDoOverride(transacao.asset, overridePorAsset.get(transacao.assetId))
            : null) ??
          mapTransactionToTipo(transacao));

    tipos.add(tipoAtivo);
    porTipo[tipoAtivo] = porTipo[tipoAtivo] || {};
    porTipo[tipoAtivo][mes] = (porTipo[tipoAtivo][mes] || 0) + valor;
  }

  const somaMes = (filtro: (tipo: string) => boolean) =>
    Array.from({ length: 12 }, (_, mes) => {
      const total = Object.entries(porTipo).reduce(
        (sum, [tipo, valores]) => (filtro(tipo) ? sum + (valores[mes] || 0) : sum),
        0,
      );
      return Math.round(total * 100) / 100;
    });

  const totaisPorMes = somaMes((tipo) => tipo !== 'reinvestimento' && tipo !== 'planejamento');
  const planejamentoPorMes = somaMes((tipo) => tipo === 'planejamento');
  const reinvestimentoPorMes = somaMes((tipo) => tipo === 'reinvestimento');

  return { porTipo, totaisPorMes, planejamentoPorMes, reinvestimentoPorMes, tipos };
}
