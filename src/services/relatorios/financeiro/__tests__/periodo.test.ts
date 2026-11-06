import { describe, expect, it } from 'vitest';
import {
  anoIr,
  anosDaJanela,
  diasAte3112,
  geradoEmISO,
  hojeEmSaoPaulo,
  inicioDaJanela,
  lancadoAte,
  mesesDaJanela,
  periodoDoRelatorio,
} from '../periodo';

const NOV_06 = new Date('2026-11-06T09:42:00-03:00');
const JAN_15 = new Date('2027-01-15T10:00:00-03:00');

describe('periodo', () => {
  it('n=1/3/6/12 a partir de 06/11/2026, com os rótulos do Pedro', () => {
    expect(periodoDoRelatorio(1, NOV_06)).toEqual({
      meses: 1,
      rotulo: 'Novembro de 2026 (parcial, lançado até 06/11)',
      inicio: '2026-11',
      fim: '2026-11',
      parcial: true,
      lancadoAte: '06/11',
    });
    expect(periodoDoRelatorio(3, NOV_06).rotulo).toBe('Set/26 a Nov/26 · 3 meses');
    expect(periodoDoRelatorio(6, NOV_06)).toMatchObject({
      rotulo: 'Jun/26 a Nov/26 · 6 meses',
      inicio: '2026-06',
      fim: '2026-11',
    });
    expect(periodoDoRelatorio(12, NOV_06)).toMatchObject({
      rotulo: 'Dez/25 a Nov/26 · 12 meses',
      inicio: '2025-12',
    });
  });

  it('15/01/2027 cruzando o ano', () => {
    expect(periodoDoRelatorio(1, JAN_15).rotulo).toBe(
      'Janeiro de 2027 (parcial, lançado até 15/01)',
    );
    expect(periodoDoRelatorio(3, JAN_15)).toMatchObject({
      rotulo: 'Nov/26 a Jan/27 · 3 meses',
      inicio: '2026-11',
      fim: '2027-01',
    });
    expect(mesesDaJanela(hojeEmSaoPaulo(JAN_15), 3)).toEqual(['2026-11', '2026-12', '2027-01']);
    expect(periodoDoRelatorio(12, JAN_15).inicio).toBe('2026-02');
  });

  it('janela de 13 meses dos insumos', () => {
    const h = hojeEmSaoPaulo(NOV_06);
    const j = mesesDaJanela(h, 13);
    expect(j).toHaveLength(13);
    expect(j[0]).toBe('2025-11');
    expect(j[12]).toBe('2026-11');
    expect(inicioDaJanela(h, 13).toISOString()).toBe('2025-11-01T00:00:00.000Z');
    expect(anosDaJanela(h, 13)).toEqual([2025, 2026]);
    expect(anosDaJanela(h, 1)).toEqual([2026]);
  });

  it('data em São Paulo, não no fuso do servidor', () => {
    // 01/12 01:00 UTC = 30/11 22:00 em SP
    const virada = new Date('2026-12-01T01:00:00Z');
    expect(lancadoAte(virada)).toBe('30/11');
    expect(periodoDoRelatorio(1, virada).fim).toBe('2026-11');
    expect(geradoEmISO(virada)).toBe('2026-11-30T22:00:00-03:00');
    expect(geradoEmISO(NOV_06)).toBe('2026-11-06T09:42:00-03:00');
  });

  it('diasAte3112', () => {
    expect(diasAte3112(new Date('2026-11-03T09:42:00-03:00'))).toBe(58);
    expect(diasAte3112(NOV_06)).toBe(55);
    expect(diasAte3112(new Date('2026-12-31T23:00:00-03:00'))).toBe(0);
  });

  it('anoIr: ano corrente com regra; janeiro de 2027 sem REGRAS_IRPF_2027 = 2026 encerrado', () => {
    expect(anoIr(NOV_06)).toEqual({ ano: 2026, encerrado: false, diasAte3112: 55 });
    expect(anoIr(JAN_15)).toEqual({ ano: 2026, encerrado: true, diasAte3112: null });
  });
});
