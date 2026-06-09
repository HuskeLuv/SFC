import { prisma } from '@/lib/prisma';

export interface ProventosByDayResult {
  /** Proventos recebidos por dia (chave = dia normalizado UTC, valor = soma líquida de IRRF). */
  proventosByDay: Map<number, number>;
  /** Total recebido no período (líquido de IRRF). */
  total: number;
}

/**
 * Carrega os proventos recebidos (PortfolioProvento, líquidos de IRRF, não
 * dispensados, até hoje) de um usuário, agrupados por dia de pagamento.
 *
 * Usado para que a SÉRIE de rentabilidade (historicoTWR/MWR) seja retorno TOTAL
 * (capital + renda), igual à metodologia do Kinvo e ao número do card. Sem isso,
 * um ativo que caiu de preço mas pagou dividendos aparecia só com o retorno de
 * capital no gráfico (ex.: FII -11% no preço, mas +7% total com proventos).
 */
export const loadProventosByDay = async (userId: string): Promise<ProventosByDayResult> => {
  const rows = await prisma.portfolioProvento.findMany({
    where: { userId, dismissed: false, dataPagamento: { lte: new Date() } },
    select: { dataPagamento: true, valorTotal: true, impostoRenda: true },
  });
  const proventosByDay = new Map<number, number>();
  let total = 0;
  for (const r of rows) {
    const net = (r.valorTotal ?? 0) - (r.impostoRenda ?? 0);
    total += net;
    if (!r.dataPagamento) continue;
    const d = r.dataPagamento;
    const key = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    proventosByDay.set(key, (proventosByDay.get(key) ?? 0) + net);
  }
  return { proventosByDay, total };
};
