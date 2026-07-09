import prisma from '@/lib/prisma';

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
   * Patrimônio soma `totaisPorMes + planejamentoPorMes` (série cheia).
   */
  planejamentoPorMes: number[];
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
  const [transacoes, vinculados] = await Promise.all([
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
  ]);

  const assetsDeSonho = new Set(
    vinculados.map((p) => p.assetId).filter((id): id is string => id != null),
  );

  const porTipo: Record<string, Record<number, number>> = {};
  const tipos = new Set<string>();

  for (const transacao of transacoes) {
    if (!transacao.asset) continue;

    const mes = transacao.date.getMonth();
    const valor = (transacao.total + (transacao.fees || 0)) * (transacao.type === 'venda' ? -1 : 1);
    const tipoAtivo = isReinvestimentoTransaction(transacao.notes)
      ? 'reinvestimento'
      : transacao.assetId && assetsDeSonho.has(transacao.assetId)
        ? 'planejamento'
        : mapTransactionToTipo(transacao);

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

  return { porTipo, totaisPorMes, planejamentoPorMes, tipos };
}
