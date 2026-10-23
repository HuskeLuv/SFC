/**
 * fundamentei-regras (F2): relatório antes × depois do recalcular-analise --relatorio-tickers (CSV
 * por ticker de payoutPct, dyPct e DPA). Números sintéticos. D6-a: etapas com o alias 'scores',
 * --sem-retencao sem efeito e o relatório de sanidade sem as linhas do Índice.
 */
import { describe, expect, it, vi } from 'vitest';
import { csvRelatorioTickers, lerArgs, relatorioTexto } from '../recalcular-analise';

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

describe('recalcular-analise — etapas (D6-a)', () => {
  it("--etapas=proventos,eventos,derivados,scores (RUNBOOK/prod) ⇒ 'scores' vira 'atuais' com aviso", () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const a = lerArgs(['--etapas=proventos,eventos,derivados,scores', '--sem-retencao']);
      expect(a.etapas).toEqual(['proventos', 'eventos', 'derivados', 'atuais']);
      expect(a.aplicar).toBe(false);
      const msgs = aviso.mock.calls.map((c) => String(c[0]));
      expect(msgs.some((m) => m.includes("'scores' é alias de 'atuais'"))).toBe(true);
      expect(msgs.some((m) => m.includes('--sem-retencao'))).toBe(true);
    } finally {
      aviso.mockRestore();
    }
  });

  it('padrão = todas as etapas novas; etapa desconhecida ⇒ erro', () => {
    expect(lerArgs([]).etapas).toEqual(['proventos', 'eventos', 'derivados', 'atuais']);
    expect(() => lerArgs(['--etapas=indice'])).toThrow(/etapa inválida: indice/);
  });

  it('relatório de sanidade sem as linhas do Índice', () => {
    const txt = relatorioTexto(
      {
        regras: [
          {
            regra: 'conf:preco_base:base_sem_evento',
            classe: 'conferencia',
            acao: 1,
            fii: 0,
            empresas: 1,
            amostra: ['XPTO4'],
          },
        ],
        totais: { acao: 3, fii: 2 },
        acimaDoLimite: [],
        liberacoes: 0,
      },
      '=== teste ===',
    );
    expect(txt).toContain('Quadro: 3 ações · 2 FIIs');
    expect(txt).toContain('conf:preco_base:base_sem_evento');
    expect(txt).not.toMatch(/Índices|bloco C: \d+ empresas|passam a incompletos/);
  });
});
