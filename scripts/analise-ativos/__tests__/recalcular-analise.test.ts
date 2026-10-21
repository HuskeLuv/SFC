/**
 * fundamentei-regras (F2): relatório antes × depois do recalcular-analise --relatorio-tickers (CSV
 * por ticker de payoutPct, dyPct e DPA). Números sintéticos.
 */
import { describe, expect, it } from 'vitest';
import { csvRelatorioTickers } from '../recalcular-analise';

describe('recalcular-analise --relatorio-tickers (CSV antes × depois)', () => {
  it('uma linha por ticker × ano e uma do dia, marcando o que mudou', () => {
    const csv = csvRelatorioTickers(
      {
        anuais: new Map([['SINT3|2025', { payoutPct: 50, dyPct: 10, dpa: 5 }]]),
        atuais: new Map([['SINT3', { payoutPct: 22.2222, dy12mPct: 4, dpa12m: 2 }]]),
      },
      {
        simbolos: null,
        anuais: [
          {
            symbol: 'SINT3',
            anoFiscal: 2025,
            dtFim: '2025-12-31',
            payoutPct: 60,
            dyPct: 10,
            dpa: 5,
          },
        ],
        atuais: [{ symbol: 'SINT3', payoutPct: null, dy12mPct: 6, dpa12m: 3 }],
      },
    );
    const linhas = csv.trim().split('\n');
    expect(linhas[0]).toMatch(/^tipo;symbol;anoFiscal;dtFim;payout_antes;payout_depois/);
    expect(linhas[1]).toBe(
      'anual;SINT3;2025;2025-12-31;50.0000;60.0000;sim;10.0000;10.0000;;5.0000;5.0000;',
    );
    expect(linhas[2]).toBe('atual;SINT3;;;22.2222;;sim;4.0000;6.0000;sim;2.0000;3.0000;sim');
  });
});
