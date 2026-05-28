/**
 * Helpers compartilhados pra cálculo de percentuais de alocação.
 *
 * Bug #14: o cálculo de `percentualCarteira` por ativo ficou só na rota FII
 * por muito tempo (TODO "calcular depois" esquecido). A revisão pós-postmortem
 * v2 mostrou que acoes/etf/reit/stocks/opcoes/moedas-criptos/fim-fia tinham
 * o mesmo gap. Extraído pra reuso e pra que futuros tipos de ativo herdem o
 * pattern correto sem copiar.
 */

export const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Arredondar cada percentual individualmente NÃO garante soma=100
 * (3 ativos de mesmo valor: 33.33+33.33+33.33 = 99.99). Distribui o resto
 * da divisão no item com maior percentual — diferença de R$ 0.01
 * indistinguível visualmente mas a soma fecha 100,00 exato.
 */
export const distributeRoundedPercents = <T extends { percentual: number }>(items: T[]): T[] => {
  if (items.length === 0) return items;
  const total = items.reduce((acc, item) => acc + item.percentual, 0);
  if (total === 0) return items;
  const diff = round2(100 - total);
  if (diff === 0) return items;
  let maxIdx = 0;
  for (let i = 1; i < items.length; i++) {
    if (items[i].percentual > items[maxIdx].percentual) maxIdx = i;
  }
  items[maxIdx] = {
    ...items[maxIdx],
    percentual: round2(items[maxIdx].percentual + diff),
  };
  return items;
};
