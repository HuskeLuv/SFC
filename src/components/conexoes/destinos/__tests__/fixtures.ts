/**
 * Fixtures "reais" da revisão de destinos: MoverOpcoesResponse montado como obterOpcoesMover,
 * sobre as regras de carteiraMover (destinosPermitidos e cia.) — motivos vêm de lá, com a
 * chave da fase 2 do mover LIGADA (como em prod).
 */
import {
  SUBGRUPO_EDITAVEL,
  SUBGRUPOS_POR_CATEGORIA,
  abaIdDaCategoria,
  categoriaBaseDaAba,
  destinosPermitidos,
  modeloDePreco,
  motivoNaoMovivel,
  rotuloCategoria,
  rotuloSubgrupo,
  subgrupoPadrao,
  type AssetMovivelLike,
  type CategoriaMovivel,
  type MoverOpcoesResponse,
} from '@/lib/carteiraMover';
import type {
  DestinoImportadoItem,
  GrupoDestino,
  SituacaoDestino,
  ViaSugestao,
} from '@/lib/pluggyDestinos';

const a = (
  symbol: string,
  type: string,
  currency: string | null,
  name: string,
): AssetMovivelLike => ({
  symbol,
  type,
  currency,
  name,
});

export const ASSETS = {
  PETR4: a('PETR4', 'stock', 'BRL', 'Petrobras PN'),
  WEGE3: a('WEGE3', 'stock', 'BRL', 'WEG ON'),
  KNCA11: a('KNCA11', 'fii', 'BRL', 'Kinea Crédito Agro Fiagro'),
  HGLG11: a('HGLG11', 'fii', 'BRL', 'CSHG Logística'),
  CDB: a('RENDA-FIXA-1700-abc', 'bond', 'BRL', 'CDB XP 102% CDI'),
  PREV: a('PREV-1', 'previdencia', 'BRL', 'XP Prev PGBL'),
};

/** Caixa RF liberada (MOVER_CAIXA_RF_HABILITADO ligada em prod). */
const LIBERADO = true;

export function opcoesDe(asset: AssetMovivelLike): MoverOpcoesResponse {
  const temRendaFixa = asset.type === 'bond';
  const prev = process.env.MOVER_CAIXA_RF_HABILITADO;
  process.env.MOVER_CAIXA_RF_HABILITADO = 'true';
  try {
    const base = categoriaBaseDaAba(asset);
    const modelo = base ? modeloDePreco(asset, { temRendaFixa }) : 'fixo';
    const destinos = destinosPermitidos(asset, { temRendaFixa, caixaRfLiberado: LIBERADO });
    const movivel = modelo !== 'fixo' && base !== null;
    const categoria = base ?? 'previdencia';
    const subgrupo = base ? subgrupoPadrao(base, { asset }) || null : null;
    return {
      item: {
        tipo: 'posicao',
        id: `p-${asset.symbol}`,
        assetId: `a-${asset.symbol}`,
        ticker: asset.symbol,
        nome: asset.name ?? asset.symbol,
        moeda: asset.currency ?? null,
        valorAtualBRL: 1000,
      },
      atual: {
        categoria,
        abaId: abaIdDaCategoria(categoria),
        subgrupo,
        subgrupoLabel: base && subgrupo ? rotuloSubgrupo(base, subgrupo) : null,
        override: false,
      },
      movido: null,
      original: null,
      modelo,
      movivel,
      ...(movivel ? {} : { motivo: motivoNaoMovivel('previdencia') }),
      destinos: movivel
        ? destinos.map((d) => ({
            categoria: d.categoria,
            abaId: abaIdDaCategoria(d.categoria),
            label: rotuloCategoria(d.categoria),
            permitido: d.permitido,
            ...(d.motivo ? { motivo: d.motivo } : {}),
            subgrupos: SUBGRUPOS_POR_CATEGORIA[d.categoria].map((s) => ({
              ...s,
              atual: d.categoria === base && s.id === subgrupo,
            })),
            subgrupoSugerido:
              d.categoria === base && subgrupo
                ? subgrupo
                : subgrupoPadrao(d.categoria as CategoriaMovivel, { asset }),
            avisos: [],
            subgrupoEditavel: SUBGRUPO_EDITAVEL[d.categoria],
          }))
        : [],
      avisos: [],
    };
  } finally {
    if (prev === undefined) delete process.env.MOVER_CAIXA_RF_HABILITADO;
    else process.env.MOVER_CAIXA_RF_HABILITADO = prev;
  }
}

let seq = 0;
const uuid = () => {
  seq += 1;
  return `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
};

export function itemDe(
  asset: AssetMovivelLike,
  over: Partial<DestinoImportadoItem> & { grupo: GrupoDestino },
): DestinoImportadoItem {
  const opcoes = opcoesDe(asset);
  const situacao: SituacaoDestino = over.situacao ?? 'para-revisar';
  const cat = opcoes.atual.categoria;
  const sub = opcoes.atual.subgrupoLabel;
  const label = rotuloCategoria(cat);
  return {
    bankInvestmentId: uuid(),
    portfolioId: uuid(),
    connectionId: 'c0000000-0000-4000-8000-000000000001',
    banco: 'XP Investimentos',
    nome: asset.name ?? asset.symbol,
    ticker: asset.type === 'bond' || asset.type === 'previdencia' ? null : asset.symbol,
    saldo: 1000,
    situacao,
    atual: {
      categoria: cat,
      abaId: opcoes.atual.abaId,
      label,
      subgrupoLabel: sub,
      rotulo: sub ? `${label} › ${sub}` : label,
    },
    via: null as ViaSugestao | null,
    confira: false,
    opcoes: situacao === 'para-revisar' ? opcoes : null,
    ...over,
  };
}

/** Lista típica da 1ª conexão (faixas Ações, FII's, Renda fixa, Previdência, Já estava, Cadastrar). */
export function listaPadrao() {
  const petr4 = itemDe(ASSETS.PETR4, { grupo: 'acoes', via: 'padrao', saldo: 11235 });
  const wege3 = itemDe(ASSETS.WEGE3, { grupo: 'acoes', via: 'padrao', saldo: 6420 });
  const hglg11 = itemDe(ASSETS.HGLG11, { grupo: 'fiis', via: 'catalogo', saldo: 6452 });
  const knca11 = itemDe(ASSETS.KNCA11, {
    grupo: 'fiis',
    via: 'padrao',
    confira: true,
    saldo: 9580,
  });
  const cdb = itemDe(ASSETS.CDB, { grupo: 'rf', via: 'indexador', saldo: 15000 });
  const prev = itemDe(ASSETS.PREV, {
    grupo: 'previdencia',
    situacao: 'fixo',
    texto: 'Fica em Previdência e Seguros',
    saldo: 32000,
  });
  const jaEstava = itemDe(ASSETS.PETR4, {
    grupo: 'ja-estava',
    situacao: 'ja-estava',
    nome: 'Itaú Unibanco PN',
    ticker: 'ITUB4',
    texto: 'Já estava na Carteira — continua onde está',
  });
  const semSuporte = itemDe(ASSETS.PREV, {
    grupo: 'sem-suporte',
    situacao: 'sem-suporte',
    nome: 'COE XP Bolsa Global',
    atual: null,
    texto: 'Cadastre à mão',
  });
  return {
    petr4,
    wege3,
    hglg11,
    knca11,
    cdb,
    prev,
    jaEstava,
    semSuporte,
    itens: [petr4, wege3, hglg11, knca11, cdb, prev, jaEstava, semSuporte],
  };
}
