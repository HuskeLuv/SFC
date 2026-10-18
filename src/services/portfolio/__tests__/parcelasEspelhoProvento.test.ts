/**
 * Espelho da Carteira (PortfolioProvento source 'brapi') aberto nas parcelas do histórico na visão
 * por data-com (backtest 18/10/2026). Casos reais: SAPR11 26/06/2026 e VIVT3 14/04/2026.
 */
import { describe, expect, it } from 'vitest';
import {
  abrirParcelasDoEspelho,
  type EspelhoProvento,
} from '@/services/portfolio/parcelasEspelhoProvento';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe('abrirParcelasDoEspelho', () => {
  // 100 cotas até dez/2025, 200 a partir daí (exemplo do ATIVACAO.md)
  const qtd = (ms: number) => (ms >= d('2025-12-01').getTime() ? 200 : 100);
  const historicoSapr = [
    { date: d('2026-06-26'), dataCom: d('2025-06-30'), tipo: 'JCP', valorUnitario: 1.408226885 },
    { date: d('2026-06-26'), dataCom: d('2025-12-30'), tipo: 'JCP', valorUnitario: 0.552412806 },
  ];
  const espelhoSapr: EspelhoProvento = {
    id: 'pp1',
    source: 'brapi',
    tipo: 'JCP',
    dataPagamento: d('2026-06-26'),
    dataCom: d('2025-06-30'), // a da parcela mais antiga
    valorTotal: 251.30519, // 100 × 1,4082 + 200 × 0,5524
    impostoRenda: 43.98,
    quantidadeBase: 100,
  };

  it('SAPR11: R$ 251,31 do pagamento de 26/06/2026 abre em 140,82 (data-com 30/06/2025) e 110,48 (30/12/2025)', () => {
    const partes = abrirParcelasDoEspelho(espelhoSapr, historicoSapr, qtd);
    expect(partes).toHaveLength(2);
    expect(partes.map((p) => p.dataCom.toISOString().slice(0, 10))).toEqual([
      '2025-06-30',
      '2025-12-30',
    ]);
    expect(partes[0].valorTotal).toBeCloseTo(140.82, 2);
    expect(partes[1].valorTotal).toBeCloseTo(110.48, 2);
    expect(partes.map((p) => p.quantidadeBase)).toEqual([100, 200]);
    // valor unitário da coluna = valorTotal ÷ quantidadeBase = o da parcela
    expect(partes[1].valorTotal / partes[1].quantidadeBase).toBeCloseTo(0.5524, 4);
    // soma e IR preservados
    expect(partes.reduce((s, p) => s + p.valorTotal, 0)).toBeCloseTo(251.30519, 6);
    expect(partes.reduce((s, p) => s + p.impostoRenda!, 0)).toBeCloseTo(43.98, 6);
    expect(new Set(partes.map((p) => p.id)).size).toBe(2);
  });

  it('VIVT3: JCPs mensais de 2025 pagos em 14/04/2026 caem cada um no mês da sua data-com', () => {
    const meses = ['2025-04-30', '2025-05-30', '2025-06-30', '2025-07-31', '2025-08-29'];
    const vals = [0.0607, 0.1495, 0.0607, 0.0607, 0.0616];
    const historico = meses.map((m, i) => ({
      date: d('2026-04-14'),
      dataCom: d(m),
      tipo: 'JCP',
      valorUnitario: vals[i],
    }));
    const total = vals.reduce((s, v) => s + 100 * v, 0);
    const partes = abrirParcelasDoEspelho(
      { ...espelhoSapr, dataPagamento: d('2026-04-14'), valorTotal: total, impostoRenda: null },
      historico,
      () => 100,
    );
    expect(partes.map((p) => p.dataCom.toISOString().slice(0, 7))).toEqual([
      '2025-04',
      '2025-05',
      '2025-06',
      '2025-07',
      '2025-08',
    ]);
    expect(partes[1].valorTotal).toBeCloseTo(14.95, 6);
    expect(partes.every((p) => p.impostoRenda === null)).toBe(true);
  });

  it("linha 'manual' (override do usuário) não abre", () => {
    const manual = { ...espelhoSapr, source: 'manual', valorTotal: 300 };
    expect(abrirParcelasDoEspelho(manual, historicoSapr, qtd)).toEqual([manual]);
  });

  it('uma data-com só (ou nenhuma parcela com posição) mantém a linha', () => {
    expect(abrirParcelasDoEspelho(espelhoSapr, historicoSapr.slice(0, 1), qtd)).toEqual([
      espelhoSapr,
    ]);
    expect(abrirParcelasDoEspelho(espelhoSapr, historicoSapr, () => 0)).toEqual([espelhoSapr]);
  });
});
