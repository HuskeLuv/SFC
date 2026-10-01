/**
 * Sequência de anos com lucro: ano ausente no meio da série não é prejuízo (achado qa-dados 30/09).
 * CXSE3: consolidado de FY2023/FY2024 com controladora_zero (lucroAtribuivel NULL) e individual com
 * R$ 3,58 bi e R$ 3,77 bi (asset_fundamentals_period do dev); lucro todo ano desde 2015.
 */
import { describe, expect, it } from 'vitest';
import {
  anosLucroConsecutivos,
  anosLucroConsecutivosDetalhado,
  lucroParaSequencia,
} from '@/services/analiseAtivos/regras/calculo/sequencias';
import { ausente, ok } from '@/services/analiseAtivos/regras/comum/valor';

const LUCRO_CXSE3: Record<number, number> = {
  2015: 1_000e6,
  2016: 1_050e6,
  2017: 1_100e6,
  2018: 1_150e6,
  2019: 1_200e6,
  2020: 1_300e6,
  2021: 1_896.152e6,
  2022: 2_952.84e6,
  2023: 3_582.244e6,
  2024: 3_765.184e6,
  2025: 4_291.56e6,
};

function fysCxse3(comIndividual: boolean) {
  return Object.entries(LUCRO_CXSE3).map(([a, v]) => {
    const ano = Number(a);
    const controladoraZero = ano === 2023 || ano === 2024;
    return {
      anoFiscal: ano,
      lucroAtribuivel: controladoraZero ? null : v,
      lucroAtribuivelIndividual: controladoraZero && comIndividual ? v : undefined,
      flags: controladoraZero ? ['controladora_zero'] : [],
    };
  });
}

describe('anosLucroConsecutivos — três estados', () => {
  it('CXSE3: controladora_zero em 2023/2024 usa o lucro do individual ⇒ 11 anos, sem lacuna', () => {
    const serie = fysCxse3(true).map((f) => ({
      anoFiscal: f.anoFiscal,
      lucro: lucroParaSequencia(f),
    }));
    expect(anosLucroConsecutivosDetalhado(serie)).toEqual({ valor: ok(11), lacuna: null });
  });

  it('CXSE3 sem individual: para em 2024 mas marca a lacuna (antes: ok(1) como se fosse prejuízo)', () => {
    const serie = fysCxse3(false).map((f) => ({
      anoFiscal: f.anoFiscal,
      lucro: lucroParaSequencia(f),
    }));
    expect(serie.find((s) => s.anoFiscal === 2024)!.lucro).toEqual(ausente('controladora_zero'));
    expect(anosLucroConsecutivosDetalhado(serie)).toEqual({ valor: ok(1), lacuna: 2024 });
  });

  it('prejuízo no meio da série continua parando a contagem, sem lacuna', () => {
    const serie = [
      { anoFiscal: 2023, lucro: ok(10) },
      { anoFiscal: 2024, lucro: ok(-5) },
      { anoFiscal: 2025, lucro: ok(8) },
    ];
    expect(anosLucroConsecutivosDetalhado(serie)).toEqual({ valor: ok(1), lacuna: null });
    expect(anosLucroConsecutivos(serie)).toEqual(ok(1));
  });

  it('último FY ausente ⇒ ausente (inalterado)', () => {
    const serie = [
      { anoFiscal: 2024, lucro: ok(10) },
      { anoFiscal: 2025, lucro: ausente('controladora_zero') },
    ];
    expect(anosLucroConsecutivos(serie)).toMatchObject({
      estado: 'ausente',
      motivo: 'controladora_zero',
    });
  });

  it('lucroParaSequencia: individual só entra com controladora_zero', () => {
    expect(lucroParaSequencia({ lucroAtribuivel: 5, flags: [] })).toEqual(ok(5));
    expect(
      lucroParaSequencia({ lucroAtribuivel: null, lucroAtribuivelIndividual: 7, flags: [] }),
    ).toEqual(ausente('sem_dado_fonte'));
  });
});
