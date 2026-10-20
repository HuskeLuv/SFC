/**
 * A6 (fatia C): repositório dos retornos — série agregada por símbolo (string_agg), upsert por
 * símbolo e leitura em lote pela PK (fatia F).
 */
import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  gravarRetornos,
  lerRetornosPorSimbolos,
  lerSerieRetornos,
  parseSerieRetornos,
} from '@/services/analiseAtivos/repositorio/retornos';
import type { RetornosCalculados } from '@/types/analiseAtivosComplementos';

const LINHA: RetornosCalculados = {
  symbol: 'WEGE3',
  classe: 'acao',
  asOf: '2026-10-16',
  preco: 47.67,
  ret1mPct: -7.9,
  ret12mPct: 18.7,
  ret5aAaPct: 3.9,
  ret10aAaPct: 21.5,
  precoMaxAjustado: 58.55,
  distMaxPct: -18.6,
  dataMax: '2024-12-11',
  inicioSerie: '2015-01-02',
  pregoes: 2928,
  flags: [],
};

describe('repositório de retornos', () => {
  it('parseSerieRetornos: texto agregado → pregões', () => {
    expect(parseSerieRetornos('2015-01-02=10.500000,2015-01-05=10.25')).toEqual([
      { date: '2015-01-02', closeRaw: 10.5 },
      { date: '2015-01-05', closeRaw: 10.25 },
    ]);
    expect(parseSerieRetornos(null)).toEqual([]);
    expect(parseSerieRetornos('')).toEqual([]);
  });

  it('lerSerieRetornos: uma consulta por lote, um item por símbolo; lote vazio não consulta', async () => {
    const $queryRaw = vi.fn(async () => [{ symbol: 'WEGE3', serie: '2026-10-16=47.67' }]);
    const p = { $queryRaw } as unknown as PrismaClient;
    expect((await lerSerieRetornos(p, [], '2015-01-01')).size).toBe(0);
    expect($queryRaw).not.toHaveBeenCalled();
    const m = await lerSerieRetornos(p, ['WEGE3', 'ITUB4'], '2015-01-01', '2026-10-19');
    expect($queryRaw).toHaveBeenCalledTimes(1);
    expect(m.get('WEGE3')).toEqual([{ date: '2026-10-16', closeRaw: 47.67 }]);
    expect(m.has('ITUB4')).toBe(false);
  });

  it('gravarRetornos: upsert por símbolo numa transação', async () => {
    const upsert = vi.fn((a: unknown) => a);
    const $transaction = vi.fn(async (ops: unknown[]) => ops);
    const p = { assetRetornosCotacao: { upsert }, $transaction } as unknown as PrismaClient;
    expect(await gravarRetornos(p, [])).toBe(0);
    expect($transaction).not.toHaveBeenCalled();
    const quando = new Date('2026-10-19T11:40:00Z');
    expect(
      await gravarRetornos(p, [LINHA, { ...LINHA, symbol: 'HGLG11', classe: 'fii' }], quando),
    ).toBe(2);
    expect($transaction).toHaveBeenCalledTimes(1);
    const arg = upsert.mock.calls[0][0] as {
      where: { symbol: string };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    };
    expect(arg.where).toEqual({ symbol: 'WEGE3' });
    expect(arg.create).toMatchObject({ symbol: 'WEGE3', classe: 'acao', calculadoEm: quando });
    expect(arg.update.asOf).toEqual(new Date('2026-10-16T00:00:00.000Z'));
    expect(arg.update).not.toHaveProperty('symbol');
  });

  it('lerRetornosPorSimbolos: uma consulta pela PK, em maiúsculas e sem repetição', async () => {
    const findMany = vi.fn(async () => [
      {
        ...LINHA,
        asOf: new Date('2026-10-16T00:00:00Z'),
        preco: null,
        dataMax: null,
        inicioSerie: null,
        pregoes: null,
        calculadoEm: new Date(),
      },
      { ...LINHA, symbol: 'XPTO3', classe: 'stock', asOf: new Date(), calculadoEm: new Date() },
    ]);
    const p = { assetRetornosCotacao: { findMany } } as unknown as PrismaClient;
    const m = await lerRetornosPorSimbolos(p, ['wege3', 'WEGE3', 'xpto3']);
    expect(findMany).toHaveBeenCalledWith({ where: { symbol: { in: ['WEGE3', 'XPTO3'] } } });
    expect([...m.keys()]).toEqual(['WEGE3']);
    expect(m.get('WEGE3')).toMatchObject({ asOf: '2026-10-16', pregoes: 0, dataMax: null });
  });
});
