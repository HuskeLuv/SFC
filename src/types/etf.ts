// Tipos para ETF (Exchange-Traded Funds)

import {
  BaseQuantityAtivo,
  BaseSecao,
  BaseQuantitySecaoTotals,
  BaseResumo,
  BaseQuantityTotalGeral,
  AlocacaoAtivo,
  TabelaAuxiliar,
} from './base';

export type RegiaoEtf = 'brasil' | 'estados_unidos';

export type IndiceRastreado =
  | 'ibovespa'
  | 'sp500'
  | 'nasdaq'
  | 'dow_jones'
  | 'small_caps'
  | 'dividendos'
  | 'tecnologia'
  | 'energia'
  | 'materiais'
  | 'financeiro'
  | 'saude'
  | 'consumo'
  | 'outros';

/**
 * ETF americano em US$ (nov/2026, docs/carteira-eua-dolar/etf/desenho.json): a moeda é da
 * LINHA (moedaRegistro), nunca da região/seção. Na linha USD os campos base (precoAquisicao,
 * cotacaoAtual, valorTotal, valorAtualizado, proventos, rentabilidade) estão em R$ — é o que
 * as somas, o % da aba e o Assistente leem — e os *USD são só de exibição. A linha BRL (IVVB11,
 * BOVA11…) não traz nenhum destes campos.
 */
export interface EtfCamposLinhaUsd {
  /** Asset.symbol cru (ativo manual: 'VOO-<ts>-<rnd>'); `ticker` é o de exibição. */
  symbol?: string;
  /** 'USD' = posição gravada em US$ (posicaoEmDolar). Ausente na linha BRL. */
  moedaRegistro?: 'USD' | 'BRL';
  precoAquisicaoUSD?: number;
  valorTotalUSD?: number;
  /** Cotação em US$ (ETF manual: congelada no preço médio). */
  cotacaoAtualUSD?: number;
  valorAtualizadoUSD?: number;
  proventosUSD?: number;
  /** Sem câmbio do dia: a linha fica zerada em R$ e fora das somas. */
  semCambio?: boolean;
}

export interface EtfAtivo extends BaseQuantityAtivo, EtfCamposLinhaUsd {
  indiceRastreado: IndiceRastreado;
  regiao: RegiaoEtf;
}

export interface EtfSecao extends BaseSecao<EtfAtivo>, BaseQuantitySecaoTotals {
  regiao: RegiaoEtf;
}

export interface EtfResumo extends BaseResumo {
  necessidadeAporteTotal: number;
  valorAtualizado: number;
}

export interface EtfTabelaAuxiliar extends TabelaAuxiliar {
  ticker: string;
  nome: string;
}

export interface EtfAlocacaoAtivo extends AlocacaoAtivo {
  ticker: string;
  cor: string;
}

export interface EtfData {
  /** R$ por US$ 1 do dia (getCotacaoDolarHoje). Só vem quando a aba tem linha USD. */
  cotacaoDolar?: number | null;
  /** Dia da taxa (YYYY-MM-DD). Só vem quando a aba tem linha USD. */
  taxaData?: string | null;
  /** Linhas USD fora das somas por falta de câmbio. Só vem quando a aba tem linha USD. */
  posicoesSemCambio?: number;
  resumo: EtfResumo;
  secoes: EtfSecao[];
  tabelaAuxiliar: EtfTabelaAuxiliar[];
  alocacaoAtivo: EtfAlocacaoAtivo[];
  totalGeral: BaseQuantityTotalGeral & {
    percentualCarteira: number;
  };
}
