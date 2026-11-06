import { describe, expect, it } from 'vitest';
import { relatorioExemplo } from '../__fixtures__/relatorioExemplo';

describe('fixture relatorioExemplo (números do protótipo)', () => {
  it('ritmo do mês: 74% do orçado lançado', () => {
    const r = relatorioExemplo(1, 'adv');
    expect(Math.round(r.orcamento.ritmo!.pctOrcadoLancado!)).toBe(74);
    expect(r.orcamento.meses).toHaveLength(1);
    expect(r.carteira!.historico).toHaveLength(6);
    expect(r.carteira!.patrimonio).toBeCloseTo(1173751.92, 2);
  });

  it('dívidas com os juros do Pedro e quitação', () => {
    const r = relatorioExemplo(3, 'basic');
    const rot = r.dividas.itens.find((d) => d.sistema === 'Rotativo')!;
    expect(rot.parcelaMes).toBeCloseTo(345, 6);
    expect(rot.jurosAteQuitar).toBeNull();
    expect(r.dividas.itens.find((d) => d.sistema === 'PRICE')!.quitacao).toBe('2029-06');
    expect(r.carteira).toBeNull();
    expect(r.irGancho!.economiaMaxima).toBe(6151.2);
  });

  it('12 meses: Dez/25 a Nov/26', () => {
    const r = relatorioExemplo(12, 'pro');
    expect(r.periodo.rotulo).toBe('Dez/25 a Nov/26 · 12 meses');
    expect(r.orcamento.meses.map((m) => m.mes)).toEqual([
      '2025-12',
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
    ]);
    expect(r.planejamento!.serie).toHaveLength(12);
    expect(r.saude).toBeNull();
  });

  it('retorno diário: n×21 pregões + o ponto inicial', () => {
    const r = relatorioExemplo(6, 'adv');
    const rd = r.carteiraAvancada!.retornoDiario;
    expect(rd.carteira).toHaveLength(6 * 21 + 1);
    expect(rd.datas).toHaveLength(6 * 21 + 1);
    expect(rd.carteira[0]).toBe(0);
    expect(rd.datas[0]).toBe('2026-05-31');
    expect(rd.datas.at(-1)).toBe('2026-11-30');
  });
});
