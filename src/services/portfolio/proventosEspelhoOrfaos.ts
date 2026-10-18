/**
 * Espelhos ÓRFÃOS da Carteira: PortfolioProvento source 'brapi' cujo (pagamento, tipo) não existe
 * mais no histórico global (`getDividends`). `ensurePortfolioProventosFromMarket` só cria ou
 * atualiza o que está no histórico; quando a fonte troca um provento de data (a limpeza do backtest
 * de 18/10/2026 apaga 'versao_antiga'; o refresh da BRAPI apaga o YAHOO redundante), a cópia antiga
 * fica. O Resumo e a rentabilidade (resolveProventos) não a contam, mas a aba Proventos e o
 * IR (ir-resumo-anual) contam — e quase sempre ao lado de uma irmã igual com a data nova (PRIO3
 * R$ 363,22 em 21/12 e em 22/12/2023; HFOF11 'Dividendo' do dia 1º × 'RENDIMENTO' do dia 15).
 *
 * Nunca toca em linha 'manual', dispensada (dismissed) nem em símbolo sem histórico (sem prova de
 * que a fonte trocou). Linha já creditada no Caixa para Investir fica (o crédito não se desfaz) e é
 * listada à parte.
 */

export interface LinhaEspelho {
  id: string;
  source: string;
  dismissed: boolean;
  tipo: string;
  dataPagamento: Date;
  valorTotal: number;
  caixaCreditadoEm: Date | null;
}

export interface EntradaHistorico {
  date: Date;
  tipo: string;
}

const dia = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

export function planejarRemocaoEspelhosOrfaos<T extends LinhaEspelho>(
  linhas: readonly T[],
  historico: readonly EntradaHistorico[],
  hoje: Date,
): { apagar: T[]; creditadasNoCaixa: T[] } {
  const apagar: T[] = [];
  const creditadasNoCaixa: T[] = [];
  if (historico.length === 0) return { apagar, creditadasNoCaixa };
  const chaves = new Set(historico.map((h) => `${dia(h.date)}\0${h.tipo}`));
  const hojeMs = dia(hoje);
  for (const l of linhas) {
    if (l.source !== 'brapi' || l.dismissed || dia(l.dataPagamento) > hojeMs) continue;
    if (chaves.has(`${dia(l.dataPagamento)}\0${l.tipo}`)) continue;
    (l.caixaCreditadoEm ? creditadasNoCaixa : apagar).push(l);
  }
  return { apagar, creditadasNoCaixa };
}
