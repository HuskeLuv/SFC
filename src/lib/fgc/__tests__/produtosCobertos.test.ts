import { describe, it, expect } from 'vitest';
import {
  aceitaEmissor,
  ehInstituicaoEmissora,
  isFgcCovered,
  produtoFgc,
  SUBTIPOS_PLUGGY_COM_EMISSOR,
} from '../produtosCobertos';

describe('isFgcCovered', () => {
  it.each(['CDB_PRE', 'LCI_HIB', 'RDC_PRE', 'LC_PRE', 'LCA_HIB', 'RDB_PRE', 'DPGE_PRE', 'LIG_HIB'])(
    '%s é coberto',
    (t) => expect(isFgcCovered(t)).toBe(true),
  );
  it.each(['LF_PRE', 'LFS_HIB', 'CRI_PRE', 'CRA_HIB'])('%s não é coberto', (t) =>
    expect(isFgcCovered(t)).toBe(false),
  );
  it('vazio/nulo não é coberto', () => {
    expect(isFgcCovered(null)).toBe(false);
    expect(isFgcCovered('')).toBe(false);
  });
  it('produtoFgc tira o sufixo', () => {
    expect(produtoFgc('LCI_HIB')).toBe('LCI');
  });
});

describe('aceitaEmissor', () => {
  it('falso com tesouroBondType preenchido', () => {
    expect(
      aceitaEmissor({ type: 'CDB_PRE', tesouroBondType: 'Tesouro Selic', assetSymbol: 'RF-1' }),
    ).toBe(false);
  });
  it.each(['DEBENTURE-123', 'FUNDO-ABC', 'TESOURO-SELIC-2029', 'PLUGGY-TD-1'])(
    'falso para símbolo %s',
    (assetSymbol) => expect(aceitaEmissor({ type: 'CDB_PRE', assetSymbol })).toBe(false),
  );
  it.each(['DEBENTURE', 'LF', 'CRI', null])('falso para PLUGGY-RF- com subtype %s', (sub) =>
    expect(
      aceitaEmissor({ type: 'CDB_PRE', assetSymbol: 'PLUGGY-RF-abc', pluggySubtype: sub }),
    ).toBe(false),
  );
  it('falso para produto não coberto', () => {
    expect(aceitaEmissor({ type: 'CRI_PRE', assetSymbol: 'RENDA-FIXA-1' })).toBe(false);
  });
  it('verdadeiro para RESERVA- CDB', () => {
    expect(aceitaEmissor({ type: 'CDB_PRE', assetSymbol: 'RESERVA-EMERG-123' })).toBe(true);
  });
  it('verdadeiro para RF manual CDB', () => {
    expect(aceitaEmissor({ type: 'CDB_HIB', assetSymbol: 'RENDA-FIXA-1730000000000' })).toBe(true);
    expect(aceitaEmissor({ type: 'LCA_PRE', assetSymbol: null })).toBe(true);
  });
  it('verdadeiro para PLUGGY-RF- com subtype CDB (qualquer caixa)', () => {
    expect(
      aceitaEmissor({ type: 'CDB_PRE', assetSymbol: 'PLUGGY-RF-abc', pluggySubtype: 'CDB' }),
    ).toBe(true);
    expect(
      aceitaEmissor({ type: 'LCI_PRE', assetSymbol: 'PLUGGY-RF-abc', pluggySubtype: 'lci' }),
    ).toBe(true);
  });
  it('subtipos do Pluggy com emissor', () => {
    expect([...SUBTIPOS_PLUGGY_COM_EMISSOR].sort()).toEqual(
      ['CDB', 'LC', 'LCA', 'LCI', 'LIG', 'RDB'].sort(),
    );
  });
});

describe('ehInstituicaoEmissora', () => {
  it('N2 → false', () =>
    expect(ehInstituicaoEmissora({ tipoBacen: 'N2', codigo: '102' })).toBe(false));
  it('N4 → false', () => expect(ehInstituicaoEmissora({ tipoBacen: 'N4' })).toBe(false));
  it('NAO_EMISSOR → false', () =>
    expect(ehInstituicaoEmissora({ tipoBacen: 'NAO_EMISSOR', codigo: '999' })).toBe(false));
  it('COR-AGORA sem tipo → false', () =>
    expect(ehInstituicaoEmissora({ tipoBacen: null, codigo: 'COR-AGORA' })).toBe(false));
  it('RESERVA-<ts> sem tipo → false', () =>
    expect(ehInstituicaoEmissora({ codigo: 'RESERVA-1730000000000' })).toBe(false));
  it.each(['B1', 'B2', 'B3S', 'B3C', 'B4', 'N1'])('%s → true', (tipoBacen) =>
    expect(ehInstituicaoEmissora({ tipoBacen, codigo: 'COR-X' })).toBe(true),
  );
  it('null sem prefixo → null', () =>
    expect(ehInstituicaoEmissora({ tipoBacen: null, codigo: '341' })).toBeNull());
});
