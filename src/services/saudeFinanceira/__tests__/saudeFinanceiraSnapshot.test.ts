// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  computeTendencias,
  extractSnapshotData,
  TENDENCIA_KEYS,
  type SnapshotData,
} from '../saudeFinanceiraSnapshot';
import { computeSaudeFinanceira } from '../indicadores';

const snapshot = (over: Partial<SnapshotData> = {}): SnapshotData => ({
  rendaMensal: 13000,
  gastoMensal: 9000,
  poupancaMensal: 4000,
  taxaPoupanca: 0.3077,
  ativosAltaLiquidez: 106822.93,
  ativosBaixaLiquidez: 97475,
  passivosCurtoPrazo: 0,
  passivosLongoPrazo: 47040,
  patrimonioLiquido: 157257.93,
  reservaEmergencia: 106822.93,
  mesesCobertura: 11.87,
  grauIndependencia: 0.0975,
  status: 'EQ',
  ...over,
});

describe('extractSnapshotData', () => {
  it('espelha os indicadores no pacote persistível', () => {
    const indicadores = computeSaudeFinanceira({
      rendaMensal: 13000,
      gastoMensal: 9000,
      idade: null,
      rentabilidadeCarteiraAA: 0.115,
      cdiAA: 0.105,
      inflacaoAA: 0.045,
      ativosAltaLiquidez: 106822.93,
      ativosBaixaLiquidez: 97475,
      reservaEmergencia: 106822.93,
      passivosCurtoPrazo: 0,
      passivosLongoPrazo: 47040,
    });
    const data = extractSnapshotData(indicadores);
    expect(data.patrimonioLiquido).toBeCloseTo(157257.93, 2);
    expect(data.reservaEmergencia).toBeCloseTo(106822.93, 2);
    expect(data.status).toBe('EQ');
    expect(data.grauIndependencia).toBeCloseTo(0.0975, 3);
    // Rentabilidade usada no mês entra na foto (tabela de evolução da planilha).
    expect(data.rentabilidadeAA).toBeCloseTo(0.115, 4);
    // Serializável como Json puro (vai pro campo Json do Prisma).
    expect(JSON.parse(JSON.stringify(data))).toEqual(data);
  });
});

describe('computeTendencias', () => {
  it('sem snapshot anterior: tudo null (primeiro mês)', () => {
    const t = computeTendencias(snapshot(), null);
    for (const key of TENDENCIA_KEYS) expect(t[key]).toBeNull();
  });

  it('variações claras: up/down por chave, passivosTotal soma CP+LP', () => {
    const anterior = snapshot();
    const atual = snapshot({
      rendaMensal: 14000, // up
      gastoMensal: 8500, // down
      passivosCurtoPrazo: 5000, // passivosTotal 47040 → 52040 = up
      patrimonioLiquido: 150000, // down
    });
    const t = computeTendencias(atual, anterior);
    expect(t.rendaMensal).toBe('up');
    expect(t.gastoMensal).toBe('down');
    expect(t.passivosTotal).toBe('up');
    expect(t.patrimonioLiquido).toBe('down');
  });

  it('ruído abaixo da tolerância (0,1%) vira flat', () => {
    const anterior = snapshot();
    const atual = snapshot({ patrimonioLiquido: 157257.93 + 50 }); // 0,03% do PL
    expect(computeTendencias(atual, anterior).patrimonioLiquido).toBe('flat');
  });

  it('acima da tolerância não é flat', () => {
    const anterior = snapshot();
    const atual = snapshot({ patrimonioLiquido: 157257.93 + 500 }); // 0,32%
    expect(computeTendencias(atual, anterior).patrimonioLiquido).toBe('up');
  });

  it('valor incalculável em qualquer lado → null naquela chave', () => {
    const anterior = snapshot({ mesesCobertura: null });
    const atual = snapshot();
    const t = computeTendencias(atual, anterior);
    expect(t.mesesCobertura).toBeNull();
    expect(t.rendaMensal).toBe('flat'); // demais chaves seguem normais
  });

  it('anterior zerado: qualquer valor novo positivo é up (tolerância mínima 1 centavo)', () => {
    const anterior = snapshot({ passivosCurtoPrazo: 0, passivosLongoPrazo: 0 });
    const atual = snapshot({ passivosCurtoPrazo: 100, passivosLongoPrazo: 0 });
    expect(computeTendencias(atual, anterior).passivosTotal).toBe('up');
  });
});
