import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MOTIVO_COM_COTACAO,
  MOTIVO_EM_REAIS,
  MOTIVO_SEM_COTACAO,
  MOTIVO_SEM_COTACAO_BOLSA,
  SUBGRUPO_EDITAVEL,
  SUBGRUPOS_POR_CATEGORIA,
  abaIdDaCategoria,
  categoriaBaseDaAba,
  destinosPermitidos,
  modeloDePreco,
  motivoNaoMovivel,
  rotuloCategoria,
  subgrupoPadrao,
  type AssetMovivelLike,
  type CategoriaMovivel,
  type MoverOpcoesResponse,
} from '../carteiraMover';
import {
  ACAO_DESTINO_IMPORTACAO,
  GRUPOS_DESTINO,
  MAX_ITENS_DESTINO,
  ROTULO_GRUPO_DESTINO,
  SITUACOES_DESTINO,
  aplicarDestinosSchema,
  destinosQuerySchema,
  escolhaValeParaItem,
  intersecaoDestinos,
  pluggyDestinosHabilitado,
  revisavelDoResumo,
  rotuloVia,
  type ResumoDestinos,
} from '../pluggyDestinos';

afterEach(() => {
  vi.unstubAllEnvs();
});

const a = (
  symbol: string,
  type: string,
  currency: string | null = 'BRL',
  name = symbol,
): AssetMovivelLike => ({ symbol, type, currency, name });

const FII = a('KNCA11', 'fii', 'BRL', 'Kinea Crédito Agro Fiagro');
const ACAO = a('PETR4', 'stock', 'BRL', 'Petrobras PN');
const ACAO_2 = a('WEGE3', 'stock', 'BRL', 'WEG ON');
const STOCK_USD = a('AAPL', 'stock', 'USD', 'Apple');
const FUNDO = a('CVM-12105992000109', 'multimercado', 'BRL', 'Kapitalo Zeta FIC FIM');
const CDB = a('RENDA-FIXA-1700-abc', 'bond', 'BRL', 'CDB XP 102% CDI');
const PREV = a('PREV-1', 'previdencia', 'BRL', 'XP Prev PGBL');

const UUID_1 = '11111111-1111-4111-8111-111111111111';
const UUID_2 = '22222222-2222-4222-8222-222222222222';

/**
 * Fixtures "reais": a mesma montagem de obterOpcoesMover/resumoDestinos, sobre
 * as regras de carteiraMover (destinosPermitidos e cia.) — motivos vêm de lá.
 */
function ctxDe(asset: AssetMovivelLike, liberado: boolean) {
  // Chave da fase 2 do mover (ligada em prod): a aba base do CDB depende dela.
  vi.stubEnv('MOVER_CAIXA_RF_HABILITADO', liberado ? 'true' : 'false');
  const temRendaFixa = asset.type === 'bond';
  const base = categoriaBaseDaAba(asset);
  const modelo = base ? modeloDePreco(asset, { temRendaFixa }) : 'fixo';
  const destinos = destinosPermitidos(asset, { temRendaFixa, caixaRfLiberado: liberado });
  return { base, modelo, destinos };
}

function resumoDe(asset: AssetMovivelLike, liberado: boolean): ResumoDestinos {
  const { base, modelo, destinos } = ctxDe(asset, liberado);
  const movivel = modelo !== 'fixo' && base !== null;
  return {
    movivel,
    ...(movivel ? {} : { motivo: motivoNaoMovivel('previdencia') }),
    atual: {
      categoria: base ?? 'previdencia',
      base,
      subgrupo: base ? subgrupoPadrao(base, { asset }) || null : null,
      override: false,
    },
    destinos: movivel
      ? destinos.map((d) => ({
          categoria: d.categoria,
          permitido: d.permitido,
          ...(d.motivo ? { motivo: d.motivo } : {}),
          subgrupoEditavel: SUBGRUPO_EDITAVEL[d.categoria],
          qtdSubgrupos: SUBGRUPOS_POR_CATEGORIA[d.categoria].length,
        }))
      : [],
  };
}

function opcoesDe(asset: AssetMovivelLike, liberado: boolean): MoverOpcoesResponse {
  const { base, modelo, destinos } = ctxDe(asset, liberado);
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
    },
    atual: {
      categoria,
      abaId: abaIdDaCategoria(categoria),
      subgrupo,
      subgrupoLabel: null,
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
          ...(liberado ? { subgrupoEditavel: SUBGRUPO_EDITAVEL[d.categoria] } : {}),
        }))
      : [],
    avisos: [],
  };
}

describe('pluggyDestinosHabilitado', () => {
  it('desligada por padrão; liga só com "true"', () => {
    vi.stubEnv('PLUGGY_DESTINOS_HABILITADO', '');
    expect(pluggyDestinosHabilitado()).toBe(false);
    vi.stubEnv('PLUGGY_DESTINOS_HABILITADO', '1');
    expect(pluggyDestinosHabilitado()).toBe(false);
    vi.stubEnv('PLUGGY_DESTINOS_HABILITADO', 'true');
    expect(pluggyDestinosHabilitado()).toBe(true);
  });

  it('constantes do contrato', () => {
    expect(ACAO_DESTINO_IMPORTACAO).toBe('investimento.destinoImportacao');
    expect(MAX_ITENS_DESTINO).toBe(200);
    expect(SITUACOES_DESTINO).toContain('para-revisar');
    expect(Object.keys(ROTULO_GRUPO_DESTINO).sort()).toEqual([...GRUPOS_DESTINO].sort());
    expect(rotuloVia('catalogo')).toBe('pelo catálogo da CVM');
    expect(rotuloVia('padrao')).toBe('estratégia padrão');
  });
});

describe('schemas', () => {
  it('query: connectionId uuid e paraRevisar=1', () => {
    expect(destinosQuerySchema.safeParse({}).success).toBe(true);
    expect(destinosQuerySchema.safeParse({ connectionId: UUID_1, paraRevisar: '1' }).success).toBe(
      true,
    );
    expect(destinosQuerySchema.safeParse({ connectionId: 'x' }).success).toBe(false);
    expect(destinosQuerySchema.safeParse({ paraRevisar: 'true' }).success).toBe(false);
  });

  it('recusa corpo vazio', () => {
    expect(aplicarDestinosSchema.safeParse({ itens: [] }).success).toBe(false);
    expect(aplicarDestinosSchema.safeParse({ itens: [], confirmarIds: [] }).success).toBe(false);
  });

  it('aceita só confirmarIds (Está tudo certo) e aplica o default', () => {
    const r = aplicarDestinosSchema.safeParse({ itens: [], confirmarIds: [UUID_1] });
    expect(r.success).toBe(true);
    const s = aplicarDestinosSchema.parse({ itens: [{ id: UUID_1, categoria: 'fimFia' }] });
    expect(s.confirmarIds).toEqual([]);
  });

  it('recusa mais de 200 itens', () => {
    const itens = Array.from({ length: MAX_ITENS_DESTINO + 1 }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      categoria: 'acoes',
    }));
    expect(aplicarDestinosSchema.safeParse({ itens }).success).toBe(false);
    expect(aplicarDestinosSchema.safeParse({ itens: itens.slice(0, 200) }).success).toBe(true);
    const confirmarIds = itens.map((i) => i.id);
    expect(aplicarDestinosSchema.safeParse({ itens: [], confirmarIds }).success).toBe(false);
  });

  it('recusa categoria inválida, id não uuid, subgrupo vazio e item repetido', () => {
    const ok = { id: UUID_1, categoria: 'fiis', subgrupo: 'tijolo' };
    expect(aplicarDestinosSchema.safeParse({ itens: [ok] }).success).toBe(true);
    expect(
      aplicarDestinosSchema.safeParse({ itens: [{ ...ok, categoria: 'previdencia' }] }).success,
    ).toBe(false);
    expect(aplicarDestinosSchema.safeParse({ itens: [{ ...ok, id: 'abc' }] }).success).toBe(false);
    expect(aplicarDestinosSchema.safeParse({ itens: [{ ...ok, subgrupo: '  ' }] }).success).toBe(
      false,
    );
    expect(aplicarDestinosSchema.safeParse({ itens: [ok, ok] }).success).toBe(false);
    expect(aplicarDestinosSchema.safeParse({ itens: [ok, { ...ok, id: UUID_2 }] }).success).toBe(
      true,
    );
  });

  it('aceita as 9 categorias movíveis (o servidor decide pela chave da fase 2)', () => {
    for (const categoria of ['reservaEmergencia', 'rendaFixaFundos', 'stocks']) {
      expect(aplicarDestinosSchema.safeParse({ itens: [{ id: UUID_1, categoria }] }).success).toBe(
        true,
      );
    }
  });
});

describe('revisavelDoResumo', () => {
  it.each([true, false])('fixo (previdência) → false (fase 2 %s)', (liberado) => {
    expect(revisavelDoResumo(resumoDe(PREV, liberado))).toBe(false);
  });

  it.each([true, false])('FII e ação → true (fase 2 %s)', (liberado) => {
    expect(revisavelDoResumo(resumoDe(FII, liberado))).toBe(true);
    expect(revisavelDoResumo(resumoDe(ACAO, liberado))).toBe(true);
  });

  it('fundo: só a seção, com mais de 1 → true', () => {
    const r = resumoDe(FUNDO, true);
    expect(r.destinos.filter((d) => d.permitido).map((d) => d.categoria)).toEqual(['fimFia']);
    expect(revisavelDoResumo(r)).toBe(true);
  });

  it('fundo com a aba sem seção escolhível → false', () => {
    const r = resumoDe(FUNDO, true);
    r.destinos = r.destinos.map((d) =>
      d.categoria === 'fimFia' ? { ...d, subgrupoEditavel: false } : d,
    );
    expect(revisavelDoResumo(r)).toBe(false);
    r.destinos = r.destinos.map((d) =>
      d.categoria === 'fimFia' ? { ...d, subgrupoEditavel: true, qtdSubgrupos: 1 } : d,
    );
    expect(revisavelDoResumo(r)).toBe(false);
  });

  it('CDB (trio RF ↔ Reservas): fase 2 ligada → true; desligada → fixo → false', () => {
    const ligada = resumoDe(CDB, true);
    expect(ligada.atual.categoria).toBe('rendaFixaFundos');
    expect(revisavelDoResumo(ligada)).toBe(true);
    expect(revisavelDoResumo(resumoDe(CDB, false))).toBe(false);
  });
});

describe('escolhaValeParaItem', () => {
  it('destino bloqueado devolve o motivo do mover', () => {
    expect(escolhaValeParaItem(opcoesDe(STOCK_USD, true), 'acoes')).toEqual({
      ok: false,
      motivo: expect.stringContaining('dólar'),
    });
    expect(escolhaValeParaItem(opcoesDe(FII, true), 'stocks')).toEqual({
      ok: false,
      motivo: MOTIVO_EM_REAIS,
    });
    expect(escolhaValeParaItem(opcoesDe(FII, true), 'reservaEmergencia')).toEqual({
      ok: false,
      motivo: MOTIVO_COM_COTACAO,
    });
    expect(escolhaValeParaItem(opcoesDe(FUNDO, true), 'acoes')).toEqual({
      ok: false,
      motivo: MOTIVO_SEM_COTACAO,
    });
    expect(escolhaValeParaItem(opcoesDe(CDB, true), 'acoes')).toEqual({
      ok: false,
      motivo: MOTIVO_SEM_COTACAO_BOLSA,
    });
  });

  it('item não movível → motivo do item', () => {
    const r = escolhaValeParaItem(opcoesDe(PREV, true), 'acoes');
    expect(r).toEqual({ ok: false, motivo: motivoNaoMovivel('previdencia') });
  });

  it('aba não oferecida (fase 2 desligada) → motivo null', () => {
    expect(escolhaValeParaItem(opcoesDe(FII, false), 'reservaEmergencia')).toEqual({
      ok: false,
      motivo: null,
    });
  });

  it('seção válida passa; inexistente ou ausente cai no subgrupoSugerido', () => {
    const o = opcoesDe(FII, true);
    const fimFia = o.destinos.find((d) => d.categoria === 'fimFia')!;
    expect(escolhaValeParaItem(o, 'fimFia', 'fiagro')).toEqual({ ok: true, subgrupo: 'fiagro' });
    expect(escolhaValeParaItem(o, 'fimFia', 'nao-existe')).toEqual({
      ok: true,
      subgrupo: fimFia.subgrupoSugerido,
    });
    expect(escolhaValeParaItem(o, 'fimFia')).toEqual({
      ok: true,
      subgrupo: fimFia.subgrupoSugerido,
    });
  });

  it('fase 2 desligada (sem subgrupoEditavel): seção continua escolhível', () => {
    const o = opcoesDe(FII, false);
    expect(o.destinos[0].subgrupoEditavel).toBeUndefined();
    expect(escolhaValeParaItem(o, 'fimFia', 'fiagro')).toEqual({ ok: true, subgrupo: 'fiagro' });
  });

  it('Reservas/RF: sem seção escolhível → subgrupo null', () => {
    const o = opcoesDe(CDB, true);
    expect(escolhaValeParaItem(o, 'reservaEmergencia', 'x')).toEqual({ ok: true, subgrupo: null });
    expect(escolhaValeParaItem(o, 'rendaFixaFundos')).toEqual({ ok: true, subgrupo: null });
  });
});

describe('intersecaoDestinos', () => {
  it('vazio → []', () => {
    expect(intersecaoDestinos([])).toEqual([]);
  });

  it('FII + ação → abas de bolsa em reais e Fundos, com todas as seções comuns', () => {
    const r = intersecaoDestinos([opcoesDe(FII, true), opcoesDe(ACAO, true)]);
    expect(r.map((d) => d.categoria).sort()).toEqual(['acoes', 'etfs', 'fiis', 'fimFia']);
    const fiis = r.find((d) => d.categoria === 'fiis')!;
    expect(fiis.label).toBe(rotuloCategoria('fiis'));
    expect(fiis.subgrupos.map((s) => s.id)).toEqual(SUBGRUPOS_POR_CATEGORIA.fiis.map((s) => s.id));
  });

  it('duas ações → mesmas abas de uma ação sozinha', () => {
    const uma = intersecaoDestinos([opcoesDe(ACAO, true)]);
    const duas = intersecaoDestinos([opcoesDe(ACAO, true), opcoesDe(ACAO_2, true)]);
    expect(duas).toEqual(uma);
  });

  it('CDB + ação → []', () => {
    expect(intersecaoDestinos([opcoesDe(CDB, true), opcoesDe(ACAO, true)])).toEqual([]);
  });

  it('ação em reais + stock em dólar → []', () => {
    expect(intersecaoDestinos([opcoesDe(ACAO, true), opcoesDe(STOCK_USD, true)])).toEqual([]);
  });

  it('CDBs: trio sem seção escolhível', () => {
    const r = intersecaoDestinos([opcoesDe(CDB, true), opcoesDe(CDB, true)]);
    expect(r.map((d) => d.categoria)).toEqual([
      'reservaEmergencia',
      'reservaOportunidade',
      'rendaFixaFundos',
    ]);
    expect(r.every((d) => d.subgrupos.length === 0)).toBe(true);
  });

  it('só seções comuns a todos', () => {
    const o1 = opcoesDe(FII, true);
    const o2 = opcoesDe(FII, true);
    o2.destinos = o2.destinos.map((d) =>
      d.categoria === 'fiis' ? { ...d, subgrupos: d.subgrupos.slice(0, 1) } : d,
    );
    const fiis = intersecaoDestinos([o1, o2]).find((d) => d.categoria === 'fiis')!;
    expect(fiis.subgrupos).toHaveLength(1);
  });

  it('item não movível zera a interseção', () => {
    expect(intersecaoDestinos([opcoesDe(FII, true), opcoesDe(PREV, true)])).toEqual([]);
  });
});
