import type { DestinoOpcao, MoverOpcoesResponse } from '@/lib/carteiraMover';
import { SUBGRUPOS_POR_CATEGORIA, type CategoriaMovivel } from '@/lib/carteiraMover';

const destino = (
  categoria: CategoriaMovivel,
  label: string,
  abaId: string,
  extra: Partial<DestinoOpcao> = {},
  atual?: string,
): DestinoOpcao => ({
  categoria,
  abaId,
  label,
  permitido: true,
  subgrupos: SUBGRUPOS_POR_CATEGORIA[categoria].map((s) => ({ ...s, atual: s.id === atual })),
  subgrupoSugerido: SUBGRUPOS_POR_CATEGORIA[categoria][0].id,
  avisos: [],
  ...extra,
});

/** KDIF11 (FII em reais) em FII's › FOF. */
export function opcoesKdif(over: Partial<MoverOpcoesResponse> = {}): MoverOpcoesResponse {
  return {
    item: {
      tipo: 'posicao',
      id: 'pf-kdif',
      assetId: 'a-kdif',
      ticker: 'KDIF11',
      nome: 'Kinea Infra',
      moeda: 'BRL',
    },
    atual: {
      categoria: 'fiis',
      abaId: 'fiis',
      subgrupo: 'fofi',
      subgrupoLabel: 'FOF (Fundos de Fundos)',
      override: false,
    },
    movido: null,
    original: null,
    modelo: 'b3-brl',
    movivel: true,
    destinos: [
      destino('fimFia', 'Fundos', 'fim-fia', {
        subgrupoSugerido: 'fip-infra',
        avisos: [
          'A aba é só organização: o IR continua pelo tipo do ativo (FII)',
          'O objetivo (%) volta para 0 na aba nova',
        ],
      }),
      destino('fiis', "FII's", 'fiis', { subgrupoSugerido: 'infra' }, 'fofi'),
      destino('acoes', 'Ações', 'acoes', { avisos: ['O objetivo (%) volta para 0 na aba nova'] }),
      destino('stocks', 'Stocks', 'stocks', {
        permitido: false,
        motivo: 'Em reais — esta aba é em dólar',
      }),
      destino('reits', "REIT's", 'reit', {
        permitido: false,
        motivo: 'Em reais — esta aba é em dólar',
      }),
      destino('etfs', "ETF's", 'etf', { avisos: ['O objetivo (%) volta para 0 na aba nova'] }),
    ],
    avisos: [],
    ...over,
  };
}

/** CDB em Renda Fixa: não movível. */
export function opcoesCdb(): MoverOpcoesResponse {
  return {
    item: {
      tipo: 'posicao',
      id: 'pf-cdb',
      assetId: 'a-cdb',
      ticker: 'CDB Inter',
      nome: 'CDB Inter',
      moeda: 'BRL',
    },
    atual: {
      categoria: 'rendaFixaFundos',
      abaId: 'renda-fixa',
      subgrupo: null,
      subgrupoLabel: null,
      override: false,
    },
    movido: null,
    original: null,
    modelo: 'fixo',
    movivel: false,
    motivo: 'Renda Fixa ainda não pode ser movida para outra aba',
    destinos: [],
    avisos: [],
  };
}

/** HGLG11 movido de Fundos para FII's › Tijolo. */
export function opcoesHglgMovido(): MoverOpcoesResponse {
  const base = opcoesKdif();
  return {
    ...base,
    item: { ...base.item, id: 'pf-hglg', ticker: 'HGLG11', nome: 'CSHG Logística' },
    atual: {
      categoria: 'fiis',
      abaId: 'fiis',
      subgrupo: 'tijolo',
      subgrupoLabel: 'Tijolo',
      override: true,
    },
    movido: { em: '2026-09-12T15:00:00.000Z', viaConsultant: false },
    original: { categoria: 'fimFia', subgrupo: 'fim', label: 'Fundos › FIM' },
  };
}

/** ETF BRL (IVVB11) em ETF's › Brasil: as duas regiões ficam livres. */
export function opcoesIvvb(): MoverOpcoesResponse {
  const base = opcoesKdif();
  return {
    ...base,
    item: { ...base.item, id: 'pf-ivvb', ticker: 'IVVB11', nome: 'iShares S&P 500' },
    atual: {
      categoria: 'etfs',
      abaId: 'etf',
      subgrupo: 'brasil',
      subgrupoLabel: 'Brasil',
      override: false,
    },
    destinos: base.destinos.map((d) =>
      d.categoria === 'etfs'
        ? {
            ...d,
            avisos: [],
            subgrupos: d.subgrupos.map((s) => ({ ...s, atual: s.id === 'brasil' })),
          }
        : d.categoria === 'fiis'
          ? { ...d, subgrupos: d.subgrupos.map((s) => ({ ...s, atual: false })) }
          : d,
    ),
  };
}
