import { beforeAll, describe, expect, it } from 'vitest';
import type { FiiTrimestreBruto } from '@/services/analiseAtivos/fii/parserInformeTrimestral';
import { SCORING_PARAMS_V1 as P } from '@/services/analiseAtivos/params/scoringParamsV1';
import { agregarImoveis, prazoMedioAproximado } from '@/services/analiseAtivos/regras/fii/imoveis';
import { CNPJ, trimestralFixture } from './fixturesFii';

let tri: FiiTrimestreBruto[] = [];
beforeAll(async () => {
  tri = await trimestralFixture({
    imovel: 'inf_trimestral_fii_imovel_2026_amostra.csv',
    complemento: 'inf_trimestral_fii_complemento_2026_amostra.csv',
  });
});
const de = (cnpj: string) => tri.find((t) => t.cnpj === cnpj)!;

describe('agregarImoveis — 2T26 real', () => {
  it('HGLG11: 37 imóveis de renda, área ≈ 2,07 mi m², vacância física ≈ 2,4% (fração ×100)', () => {
    const r = agregarImoveis(de(CNPJ.HGLG).imoveis, P, { tipoVigente: 'tijolo' });
    expect(r.nImoveisRenda).toBe(37);
    expect(r.areaM2! / 1e6).toBeCloseTo(2.066, 2);
    expect(r.vacanciaFisicaCvmPct.estado).toBe('ok');
    expect(r.vacanciaFisicaCvmPct.estado === 'ok' && r.vacanciaFisicaCvmPct.valor).toBeCloseTo(
      2.41,
      1,
    );
    expect(r.flags).not.toContain('area_nao_abl');
  });

  it('XPLG11: vacância física 18,3% (fonte CVM)', () => {
    const r = agregarImoveis(de(CNPJ.XPLG).imoveis, P, { tipoVigente: 'tijolo' });
    expect(r.vacanciaFisicaCvmPct.estado === 'ok' && r.vacanciaFisicaCvmPct.valor).toBeCloseTo(
      18.3,
      1,
    );
  });

  it('RECR11 (papel) com 1 imóvel 100% vago ⇒ vacância não se aplica', () => {
    const imoveis = de(CNPJ.RECR).imoveis;
    expect(imoveis).toHaveLength(1);
    expect(imoveis[0].vacanciaPct).toBe(100);
    const r = agregarImoveis(imoveis, P, { tipoVigente: 'papel' });
    expect(r.vacanciaFisicaCvmPct).toMatchObject({
      estado: 'nao_se_aplica',
      motivo: 'papel_sem_imoveis',
    });
  });

  it('área de um imóvel > 500 mil m² ⇒ flag area_nao_abl', () => {
    const r = agregarImoveis(
      [
        {
          classe: 'Imóveis para renda acabados',
          area: 600_000,
          vacanciaPct: 0,
          inadimplenciaPct: 0,
          receitaPct: 100,
        },
      ],
      P,
    );
    expect(r.flags).toContain('area_nao_abl');
    expect(r.areaMaiorImovelM2).toBe(600_000);
  });

  it('Σ %receita > 105 ⇒ inadimplência ausente (escala errada no fundo todo)', () => {
    const linha = (receitaPct: number) => ({
      classe: 'Imóveis para renda acabados',
      area: 1000,
      vacanciaPct: 0,
      inadimplenciaPct: 1,
      receitaPct,
    });
    const r = agregarImoveis([linha(500), linha(500)], P);
    expect(r.inadimplenciaCvmPct.estado).toBe('ausente');
    expect(r.flags).toContain('soma_pct_receita_invalida');
    const ok = agregarImoveis([linha(50), linha(50)], P);
    expect(ok.inadimplenciaCvmPct).toEqual({ estado: 'ok', valor: 1 });
  });

  it('tijolo sem imóvel de renda ⇒ vacância ausente (dados incompletos), não zero', () => {
    const r = agregarImoveis([], P, { tipoVigente: 'tijolo' });
    expect(r.vacanciaFisicaCvmPct.estado).toBe('ausente');
    expect(r.nImoveisRenda).toBe(0);
  });
});

describe('prazoMedioAproximado', () => {
  it('HGLG11 2T26 ≈ 3,4 anos (faixa > 36 meses = 5 anos)', () => {
    const r = prazoMedioAproximado(de(CNPJ.HGLG).faixas!);
    expect(r.prazoMedioAnos).toBeCloseTo(3.4, 1);
    expect(r.vencAte12mPct).toBeGreaterThan(0);
  });
  it('sem faixas ⇒ nulls', () => {
    expect(prazoMedioAproximado({})).toEqual({
      prazoMedioAnos: null,
      vencAte12mPct: null,
      vencAcima36mPct: null,
    });
  });
});
