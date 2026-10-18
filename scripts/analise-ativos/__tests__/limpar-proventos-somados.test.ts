/**
 * Script de limpeza das linhas somadas (backtest 18/10/2026, A1): dry-run não grava, --apply grava
 * pelo plano do sync e a 2ª execução não muda nada. Linhas reais de prod (17/10/2026) e da BRAPI
 * (18/10/2026) de SAPR11 e ITUB4; banco em memória.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));

import { executarLimpeza, type DepsLimpeza } from '../limpar-proventos-somados';
import { agregarProventosBrapi } from '@/services/pricing/dividendService';
import {
  planejarGravacaoProventosBrapi,
  type LinhaProventoGravada,
} from '@/services/pricing/proventosBrapiPlano';

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const linha = (
  id: string,
  pag: string,
  com: string,
  tipo: string,
  valor: number,
): LinhaProventoGravada => ({
  id,
  date: d(pag),
  dataCom: d(com),
  tipo,
  valorUnitario: valor,
  source: 'BRAPI',
});

function banco(inicial: Record<string, LinhaProventoGravada[]>) {
  const linhas = structuredClone(inicial);
  let seq = 0;
  const reconciliar: DepsLimpeza['reconciliar'] = async (symbol, entries, aplicar) => {
    const atuais = linhas[symbol] ?? [];
    const plano = planejarGravacaoProventosBrapi(atuais, agregarProventosBrapi(entries));
    if (aplicar) {
      const apagar = new Set(plano.apagar.map((a) => a.id));
      const novas = atuais
        .filter((l) => !apagar.has(l.id))
        .map((l) => {
          const u = plano.atualizar.find((x) => x.id === l.id);
          return u ? { ...l, valorUnitario: u.valorUnitario } : l;
        });
      for (const c of plano.criar) novas.push({ id: `n${++seq}`, ...c, source: 'BRAPI' });
      linhas[symbol] = novas;
    }
    return plano;
  };
  return { linhas, reconciliar };
}

const BRAPI: Record<string, Record<string, unknown>[]> = {
  SAPR11: [
    { paymentDate: '2026-06-26', lastDatePrior: '2025-06-30', label: 'JCP', rate: 1.408226885 },
    { paymentDate: '2026-06-26', lastDatePrior: '2025-12-30', label: 'JCP', rate: 0.552412806 },
  ],
  ITUB4: [
    { paymentDate: '2026-08-28', lastDatePrior: '2026-03-19', label: 'JCP', rate: 0.34888 },
    { paymentDate: '2026-08-28', lastDatePrior: '2026-06-18', label: 'JCP', rate: 0.36188 },
  ],
};

function deps(reconciliar: DepsLimpeza['reconciliar']): DepsLimpeza {
  return {
    buscarBrapi: async (s) => BRAPI[s] ?? null,
    reconciliar,
    dormir: async () => undefined,
  };
}

const PROD = {
  SAPR11: [
    linha('soma', '2026-06-26', '2025-12-30', 'JCP', 1.960639691),
    linha('sp', '2025-12-30', '2025-12-30', 'JCP', 0.5524128),
  ],
  ITUB4: [
    linha('p28', '2026-08-28', '2026-06-18', 'JCP', 0.71076),
    linha('p31', '2026-08-31', '2026-06-18', 'JCP', 0.71076),
  ],
};

describe('limpar-proventos-somados', () => {
  it('dry-run: mostra o plano e não grava nada', async () => {
    const b = banco(PROD);
    const r = await executarLimpeza(
      ['SAPR11', 'ITUB4', 'XPTO3'],
      { aplicar: false, pausaMs: 0, amostra: 10 },
      deps(b.reconciliar),
    );
    expect(r).toMatchObject({
      simbolos: 3,
      semResposta: ['XPTO3'],
      comMudanca: 2,
      criar: 2,
      atualizar: 2,
      apagar: { 'versao_antiga (valor sai da base)': 1 },
    });
    expect(b.linhas).toEqual(PROD);
  });

  it('--apply grava; a 2ª execução é vazia (idempotente) e o SAPR11 fica com 1,4082 + 0,5524', async () => {
    const b = banco(PROD);
    await executarLimpeza(
      ['SAPR11', 'ITUB4'],
      { aplicar: true, pausaMs: 0, amostra: 0 },
      deps(b.reconciliar),
    );
    const r2 = await executarLimpeza(
      ['SAPR11', 'ITUB4'],
      { aplicar: true, pausaMs: 0, amostra: 0 },
      deps(b.reconciliar),
    );
    expect(r2).toMatchObject({ comMudanca: 0, criar: 0, atualizar: 0, apagar: {} });
    const sapr = b.linhas.SAPR11.filter((l) => l.date.getTime() === d('2026-06-26').getTime());
    expect(sapr.map((l) => l.valorUnitario).sort()).toEqual([0.552412806, 1.408226885]);
    // a linha sem pagamento do legado continua (a auditoria cuida dela)
    expect(b.linhas.SAPR11.some((l) => l.id === 'sp')).toBe(true);
    // ITUB4: a repetição de 31/08 sai; 18/06 = 0,36188 e 19/03 = 0,34888
    expect(
      b.linhas.ITUB4.map((l) => [l.dataCom!.toISOString().slice(0, 10), l.valorUnitario]).sort(),
    ).toEqual([
      ['2026-03-19', 0.34888],
      ['2026-06-18', 0.36188],
    ]);
  });

  it('BRAPI sem resposta ou vazia: o símbolo é pulado e nada é apagado', async () => {
    const b = banco(PROD);
    const r = await executarLimpeza(
      ['SAPR11'],
      { aplicar: true, pausaMs: 0, amostra: 0 },
      { ...deps(b.reconciliar), buscarBrapi: async () => [] },
    );
    expect(r.semResposta).toEqual(['SAPR11']);
    expect(b.linhas).toEqual(PROD);
  });
});
