import { describe, expect, it } from 'vitest';
import {
  credenciaisDaFonte,
  FONTES,
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

  it('registro preenchido: CVM (leitura local) e exemplo (ingestão, fora de produção)', () => {
    expect(Object.keys(FONTES).sort()).toEqual(['cvm', 'exemplo']);
    expect(obterFonte('cvm', 'production')).toMatchObject({ modo: 'leitura_local' });
    expect(FONTES.cvm.seriesOferecidas).toContain('vacancy_physical');
    // a CVM não publica o lucro descontado nem a qualidade da carteira de crédito
    for (const s of ['net_income_adjusted', 'default_pct', 'ltv_avg'] as const) {
      expect(FONTES.cvm.seriesOferecidas).not.toContain(s);
    }
    expect(obterFonte('exemplo', 'test')).toMatchObject({ modo: 'ingestao' });
  });

  it('credenciais ANALISE_FONTE_<ID>_* só da fonte pedida', () => {
    expect(
      credenciaisDaFonte('provedor_x', {
        ANALISE_FONTE_PROVEDOR_X_API_KEY: 'k',
        ANALISE_FONTE_OUTRA_API_KEY: 'n',
        ANALISE_FONTE_PROVEDOR_X_VAZIA: '',
      }),
    ).toEqual({ API_KEY: 'k' });
  });
});
