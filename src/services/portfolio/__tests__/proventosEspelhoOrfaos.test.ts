/**
 * Espelhos órfãos da Carteira (backtest 18/10/2026): portfolio_proventos 'brapi' cujo (pagamento,
 * tipo) saiu do histórico global. Casos reais de prod (17/10/2026, só leitura) e do banco local
 * depois da limpeza: PRIO3 21/12 × 22/12/2023, VIVT3 30/04/2026, HFOF11 'Dividendo' × 'RENDIMENTO'.
 */
import { describe, expect, it } from 'vitest';
import {
  planejarRemocaoEspelhosOrfaos,
  type LinhaEspelho,
} from '@/services/portfolio/proventosEspelhoOrfaos';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const HOJE = d('2026-10-18');
const espelho = (id: string, pag: string, tipo: string, valor: number, extra = {}) =>
  ({
    id,
    source: 'brapi',
    dismissed: false,
    tipo,
    dataPagamento: d(pag),
    valorTotal: valor,
    caixaCreditadoEm: null,
    ...extra,
  }) as LinhaEspelho;

describe('planejarRemocaoEspelhosOrfaos', () => {
  it('PRIO3: a cópia de 21/12/2023 (R$ 363,22) sai; a irmã de 22/12/2023, que está no histórico, fica', () => {
    const { apagar } = planejarRemocaoEspelhosOrfaos(
      [
        espelho('velha', '2023-12-21', 'DIVIDENDO', 363.22),
        espelho('nova', '2023-12-22', 'DIVIDENDO', 363.22),
      ],
      [{ date: d('2023-12-22'), tipo: 'DIVIDENDO' }],
      HOJE,
    );
    expect(apagar.map((l) => l.id)).toEqual(['velha']);
  });

  it('VIVT3: JCP de 30/04/2026 (R$ 513,55) cujo provento a limpeza apagou como versao_antiga sai', () => {
    const { apagar } = planejarRemocaoEspelhosOrfaos(
      [
        espelho('fantasma', '2026-04-30', 'JCP', 513.55),
        espelho('ok', '2026-04-14', 'JCP', 485.11),
      ],
      [
        { date: d('2026-04-14'), tipo: 'JCP' },
        { date: d('2026-07-15'), tipo: 'JCP' },
      ],
      HOJE,
    );
    expect(apagar.map((l) => l.id)).toEqual(['fantasma']);
  });

  it("HFOF11: 'Dividendo' do dia 1º (cópia do YAHOO que o refresh da BRAPI removeu) sai; 'RENDIMENTO' do dia 14 fica", () => {
    const { apagar } = planejarRemocaoEspelhosOrfaos(
      [espelho('y', '2023-03-01', 'Dividendo', 189), espelho('b', '2023-03-14', 'RENDIMENTO', 189)],
      [{ date: d('2023-03-14'), tipo: 'RENDIMENTO' }],
      HOJE,
    );
    expect(apagar.map((l) => l.id)).toEqual(['y']);
  });

  it("nunca toca em 'manual', dispensada, pagamento futuro ou símbolo sem histórico; creditada no Caixa fica à parte", () => {
    const linhas = [
      espelho('manual', '2023-12-21', 'DIVIDENDO', 300, { source: 'manual' }),
      espelho('dispensada', '2023-12-21', 'DIVIDENDO', 300, { dismissed: true }),
      espelho('futuro', '2026-12-30', 'JCP', 10),
      espelho('caixa', '2023-12-21', 'DIVIDENDO', 50, { caixaCreditadoEm: d('2026-10-01') }),
    ];
    const r = planejarRemocaoEspelhosOrfaos(
      linhas,
      [{ date: d('2023-12-22'), tipo: 'DIVIDENDO' }],
      HOJE,
    );
    expect(r.apagar).toEqual([]);
    expect(r.creditadasNoCaixa.map((l) => l.id)).toEqual(['caixa']);
    expect(
      planejarRemocaoEspelhosOrfaos([espelho('x', '2023-12-21', 'JCP', 1)], [], HOJE).apagar,
    ).toEqual([]);
  });
});
