import { describe, expect, it } from 'vitest';
import {
  idsIngestaoHabilitados,
  obterFonte,
  rotulosFontes,
} from '@/services/analiseAtivos/fontes/fundamentos/registro';

describe('registro das fontes (contrato da fatia 0)', () => {
  it("'exemplo' é recusado em produção", () => {
    expect(() => obterFonte('exemplo', 'production')).toThrow(/fora de produção/);
    expect(() => obterFonte('exemplo', 'test')).not.toThrow();
    expect(obterFonte('nao_existe', 'test')).toBeNull();
  });

  it('ANALISE_FONTES_INGESTAO: vazio = nenhum; cvm nunca entra; id inválido = erro', () => {
    expect(idsIngestaoHabilitados({})).toEqual([]);
    expect(idsIngestaoHabilitados({ ANALISE_FONTES_INGESTAO: ' exemplo, cvm ,exemplo' })).toEqual([
      'exemplo',
    ]);
    expect(() => idsIngestaoHabilitados({ ANALISE_FONTES_INGESTAO: 'x;y' })).toThrow(/inválido/);
  });

  it('rótulos para a frase de fonte', () => {
    expect(rotulosFontes()).toMatchObject({ cvm: 'CVM' });
  });
});
