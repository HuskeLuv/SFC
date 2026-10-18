/**
 * Abre o espelho de provento da Carteira (PortfolioProvento source 'brapi') nas parcelas do
 * histórico global, para a visão por DATA-COM da aba Proventos.
 *
 * `ensurePortfolioProventosFromMarket` grava UM PortfolioProvento por (pagamento, tipo) — a soma
 * das parcelas — com a data-com e a quantidade da parcela mais antiga. Desde o backtest de
 * 18/10/2026 o histórico guarda uma linha por data-com (SAPR11 26/06/2026: 1,4082 de 30/06/2025 +
 * 0,5524 de 30/12/2025; VIVT3 14/04/2026: 9 JCPs mensais de 2025). Sem abrir, a visão por data-com
 * punha o valor inteiro no mês da data-com mais antiga, enquanto o Resumo (resolveProventos) lança
 * cada parcela na sua data-com.
 *
 * O total do espelho (e o IR gravado) é repartido pelo peso de cada parcela (quantidade na data-com
 * × valor unitário), então a soma não muda. Linha 'manual' (edição do usuário) não se abre: o
 * override vale para o pagamento inteiro.
 */

export interface ParcelaHistorico {
  date: Date;
  dataCom: Date | null;
  tipo: string;
  valorUnitario: number;
}

export interface EspelhoProvento {
  id: string;
  source: string;
  tipo: string;
  dataPagamento: Date;
  dataCom: Date;
  valorTotal: number;
  impostoRenda: number | null;
  quantidadeBase: number;
}

const dia = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

export function abrirParcelasDoEspelho<T extends EspelhoProvento>(
  mp: T,
  historico: readonly ParcelaHistorico[],
  quantidadeNaDataCom: (dataComMs: number) => number,
): T[] {
  if (mp.source !== 'brapi') return [mp];
  const pag = dia(mp.dataPagamento);
  const parcelas = historico.filter(
    (h) => h.dataCom !== null && h.tipo === mp.tipo && dia(h.date) === pag,
  );
  const datasCom = new Set(parcelas.map((h) => dia(h.dataCom!)));
  if (datasCom.size < 2) return [mp];
  const pesos = parcelas.map((h) => {
    const q = quantidadeNaDataCom(h.dataCom!.getTime());
    return { h, q, peso: q > 0 ? q * h.valorUnitario : 0 };
  });
  const total = pesos.reduce((s, x) => s + x.peso, 0);
  if (!(total > 0)) return [mp];
  return pesos
    .filter((x) => x.peso > 0)
    .sort((a, b) => a.h.dataCom!.getTime() - b.h.dataCom!.getTime())
    .map((x, i) => {
      const f = x.peso / total;
      return {
        ...mp,
        id: `${mp.id}#${i}`,
        dataCom: new Date(dia(x.h.dataCom!)),
        quantidadeBase: x.q,
        valorTotal: mp.valorTotal * f,
        impostoRenda: mp.impostoRenda === null ? null : mp.impostoRenda * f,
      };
    });
}
