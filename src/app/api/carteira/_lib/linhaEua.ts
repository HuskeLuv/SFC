/**
 * Linhas das abas Stocks e REIT's (Carteira EUA em US$, out/2026) — contrato
 * `LinhaEuaCampos`, compartilhado por /api/carteira/stocks e /api/carteira/reit.
 *
 * As abas são em US$. Toda conta é feita na unidade GRAVADA da posição
 * (posicaoEmDolar), sem depender da chave CARTEIRA_EUA_DOLAR_HABILITADO:
 *  - posição em US$ (REIT, stock com moedaRegistro 'USD'): avgPrice/totalInvested e a cotação
 *    BRAPI já estão em US$; o custo em R$ é totalInvestedBrl ?? totalInvested × câmbio.
 *  - posição em R$ (stock legado com moedaRegistro null, item BRL movido para a aba): a conta é
 *    feita em R$ (cotação em US$ × câmbio) e a linha é exibida ÷ câmbio, marcada `aproximado`.
 *    Sem câmbio a linha fica `semCambio`, zerada em US$ e fora dos totais.
 * Proventos: o evento vem na moeda nativa (ProventoEvent.moeda); ativo em dólar soma em US$,
 * ativo BRL é convertido ÷ câmbio.
 */
import { isAtivoEmDolar, posicaoEmDolar, type UnidadeValor } from '@/lib/ativoEmDolar';

/** Tipos cuja cotação já vem em R$ (mesma lista do itemValuation). */
const TIPOS_PRECO_EM_BRL: ReadonlySet<string> = new Set([
  'crypto',
  'currency',
  'metal',
  'commodity',
]);

export interface PosicaoEuaRef {
  quantity: number;
  avgPrice: number;
  totalInvested: number;
  moedaRegistro?: string | null;
  totalInvestedBrl?: number | null;
}

export interface AtivoEuaRef {
  type?: string | null;
  currency?: string | null;
}

export interface LinhaEuaCampos {
  /** Unidade em que a posição está gravada. */
  moedaRegistro: UnidadeValor;
  /** Posição em R$ exibida ÷ câmbio do dia (valores em US$ aproximados). */
  aproximado: boolean;
  /** Posição em R$ sem câmbio: zerada em US$ e fora dos totais. */
  semCambio: boolean;
  /** Valores da linha, em US$. */
  precoAquisicao: number;
  valorTotal: number;
  cotacaoAtual: number;
  valorAtualizado: number;
  /** Custo em R$ (câmbio de cada compra; legado = totalInvested). null = sem câmbio. */
  valorTotalBRL: number | null;
  /** Valor atual em R$ pelo câmbio do dia. null = sem câmbio. */
  valorAtualizadoBRL: number | null;
}

const positivo = (v: number | null | undefined): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0;

/** Valores de uma linha da aba (US$) a partir da posição gravada. */
export const valoresLinhaEua = ({
  item,
  asset,
  quote,
  cotacaoDolar,
}: {
  item: PosicaoEuaRef;
  asset: AtivoEuaRef | null | undefined;
  /** Cotação live na moeda nativa do Asset (getAssetPrices). */
  quote: number | null | undefined;
  cotacaoDolar: number | null | undefined;
}): LinhaEuaCampos => {
  const fx = positivo(cotacaoDolar) ? cotacaoDolar : null;
  const cotacao = positivo(quote) ? quote : null;

  if (posicaoEmDolar(item, asset)) {
    const cotacaoAtual = cotacao ?? item.avgPrice;
    const valorAtualizado = item.quantity * cotacaoAtual;
    return {
      moedaRegistro: 'USD',
      aproximado: false,
      semCambio: false,
      precoAquisicao: item.avgPrice,
      valorTotal: item.totalInvested,
      cotacaoAtual,
      valorAtualizado,
      valorTotalBRL: positivo(item.totalInvestedBrl)
        ? item.totalInvestedBrl
        : fx !== null
          ? item.totalInvested * fx
          : null,
      valorAtualizadoBRL: fx !== null ? valorAtualizado * fx : null,
    };
  }

  // Posição em R$: a conta é feita em R$ e só a exibição vai para US$ (÷ câmbio).
  const cotacaoEmUsd = asset?.currency === 'USD' && !TIPOS_PRECO_EM_BRL.has(asset?.type ?? '');
  const cotacaoBrl =
    cotacao === null ? item.avgPrice : cotacaoEmUsd ? (fx !== null ? cotacao * fx : null) : cotacao;

  if (fx === null || cotacaoBrl === null) {
    return {
      moedaRegistro: 'BRL',
      aproximado: false,
      semCambio: true,
      precoAquisicao: 0,
      valorTotal: 0,
      cotacaoAtual: 0,
      valorAtualizado: 0,
      valorTotalBRL: item.totalInvested,
      valorAtualizadoBRL: cotacaoBrl !== null ? item.quantity * cotacaoBrl : null,
    };
  }

  const valorAtualizadoBRL = item.quantity * cotacaoBrl;
  return {
    moedaRegistro: 'BRL',
    aproximado: true,
    semCambio: false,
    precoAquisicao: item.avgPrice / fx,
    valorTotal: item.totalInvested / fx,
    cotacaoAtual: cotacaoBrl / fx,
    valorAtualizado: valorAtualizadoBRL / fx,
    valorTotalBRL: item.totalInvested,
    valorAtualizadoBRL,
  };
};

/**
 * Proventos da linha em US$: ativo em dólar já vem em US$ (moeda nativa do evento); ativo BRL
 * movido para a aba é convertido ÷ câmbio (sem câmbio = 0, fora da soma).
 */
export const proventoDaLinhaEmUsd = (
  valorNativo: number,
  asset: AtivoEuaRef | null | undefined,
  cotacaoDolar: number | null | undefined,
): number => {
  if (isAtivoEmDolar(asset)) return valorNativo;
  return positivo(cotacaoDolar) ? valorNativo / cotacaoDolar : 0;
};

export interface TotaisEua {
  totalUSD: {
    valorAplicado: number;
    valorAtualizado: number;
    proventos: number;
    rendimento: number;
    rentabilidade: number;
  };
  /** Equivalente em R$ (aplicado pelo câmbio de cada compra; atual pelo do dia). null = sem câmbio. */
  totalBRL: {
    valorAplicado: number;
    valorAtualizado: number;
    proventos: number;
    rendimento: number;
    rentabilidade: number;
  } | null;
  /** Linhas fora da soma por falta de câmbio. */
  posicoesSemCambio: number;
}

/** Totais da aba em US$ e o equivalente em R$. Caixa (R$) nunca entra aqui. */
export const totaisEua = (
  linhas: ReadonlyArray<
    Partial<LinhaEuaCampos> & { valorTotal: number; valorAtualizado: number; proventos?: number }
  >,
  cotacaoDolar: number | null | undefined,
): TotaisEua => {
  const fx = positivo(cotacaoDolar) ? cotacaoDolar : null;
  let aplicado = 0;
  let atual = 0;
  let proventos = 0;
  let aplicadoBrl = 0;
  let atualBrl = 0;
  let semCambio = 0;
  for (const l of linhas) {
    if (l.semCambio) {
      semCambio += 1;
      continue;
    }
    aplicado += l.valorTotal;
    atual += l.valorAtualizado;
    proventos += l.proventos ?? 0;
    aplicadoBrl += l.valorTotalBRL ?? (fx !== null ? l.valorTotal * fx : 0);
    atualBrl += l.valorAtualizadoBRL ?? (fx !== null ? l.valorAtualizado * fx : 0);
  }
  const rent = (a: number, v: number, p: number) => (a > 0 ? ((v + p - a) / a) * 100 : 0);
  return {
    totalUSD: {
      valorAplicado: aplicado,
      valorAtualizado: atual,
      proventos,
      rendimento: atual + proventos - aplicado,
      rentabilidade: rent(aplicado, atual, proventos),
    },
    totalBRL:
      fx === null
        ? null
        : {
            valorAplicado: aplicadoBrl,
            valorAtualizado: atualBrl,
            proventos: proventos * fx,
            rendimento: atualBrl + proventos * fx - aplicadoBrl,
            rentabilidade: rent(aplicadoBrl, atualBrl, proventos * fx),
          },
    posicoesSemCambio: semCambio,
  };
};
