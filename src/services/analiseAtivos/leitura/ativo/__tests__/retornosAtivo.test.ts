/**
 * A6 (fatia C): leitura dos retornos (asset_retornos_cotacao → RetornosCotacaoApi) — Estado por
 * janela com os motivos de TEXTOS_RETORNOS, sem índice/nota/semáforo no JSON.
 */
import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  lerRetornosAtivo,
  paraRetornosApi,
} from '@/services/analiseAtivos/leitura/ativo/retornosAtivo';
import { TEXTOS_RETORNOS } from '@/services/analiseAtivos/textosRetornos';
import type { RetornosCalculados } from '@/types/analiseAtivosComplementos';

const BASE: RetornosCalculados = {
  symbol: 'WEGE3',
  classe: 'acao',
  asOf: '2026-10-16',
  preco: 50,
  ret1mPct: 2.4,
  ret12mPct: -8.1,
  ret5aAaPct: 11.6,
  ret10aAaPct: 19.8,
  precoMaxAjustado: 58.1,
  distMaxPct: -14.2,
  dataMax: '2025-08-12',
  inicioSerie: '2015-01-02',
  pregoes: 2900,
  flags: [],
};

describe('paraRetornosApi', () => {
  it('tudo ok: 4 janelas em ordem, 5a/10a anualizados, máxima com preço e data', () => {
    const r = paraRetornosApi(BASE, 'acao');
    expect(r.janelas.map((j) => [j.janela, j.valor, j.anualizado])).toEqual([
      ['1m', { estado: 'ok', valor: 2.4 }, false],
      ['12m', { estado: 'ok', valor: -8.1 }, false],
      ['5a', { estado: 'ok', valor: 11.6 }, true],
      ['10a', { estado: 'ok', valor: 19.8 }, true],
    ]);
    expect(r.distanciaMaxima).toEqual({ estado: 'ok', valor: -14.2 });
    expect(r.maxima).toEqual({ preco: 58.1, data: '2025-08-12' });
    expect(r.ateData).toBe('2026-10-16');
    expect(r.inicioSerie).toBe('2015-01-02');
    expect(JSON.stringify(r)).not.toMatch(/indice|semaforo|destaque|nota/i);
  });

  it('série curta: sem dado com o texto da janela', () => {
    const r = paraRetornosApi({ ...BASE, ret10aAaPct: null, flags: ['serie_curta_10a'] }, 'fii');
    expect(r.classe).toBe('fii');
    expect(r.janelas[3].valor).toEqual({
      estado: 'ausente',
      motivo: 'serie_curta',
      texto: TEXTOS_RETORNOS.serieCurta['10a'],
    });
    expect(r.janelas[2].valor.estado).toBe('ok');
  });

  it('evento não confirmado: 12m/5a/10a e máxima com o motivo; 1m segue', () => {
    const r = paraRetornosApi(
      {
        ...BASE,
        ret12mPct: null,
        ret5aAaPct: null,
        ret10aAaPct: null,
        distMaxPct: null,
        precoMaxAjustado: null,
        dataMax: null,
        flags: ['evento_nao_confirmado'],
      },
      'acao',
    );
    const motivo = {
      estado: 'ausente',
      motivo: 'evento_nao_confirmado',
      texto: TEXTOS_RETORNOS.motivos.evento_nao_confirmado,
    };
    expect(r.janelas[0].valor).toEqual({ estado: 'ok', valor: 2.4 });
    for (const j of r.janelas.slice(1)) expect(j.valor).toEqual(motivo);
    expect(r.distanciaMaxima).toEqual(motivo);
    expect(r.maxima).toBeNull();
    // 1m nulo pelo mesmo evento
    const r1 = paraRetornosApi(
      { ...BASE, ret1mPct: null, flags: ['evento_nao_confirmado'] },
      'acao',
    );
    expect(r1.janelas[0].valor).toEqual(motivo);
  });

  it('sem cotação recente: tudo sem dado com o motivo', () => {
    const r = paraRetornosApi({ ...BASE, flags: ['sem_cotacao_recente'] }, 'acao');
    for (const j of r.janelas) {
      expect(j.valor).toMatchObject({ estado: 'ausente', motivo: 'sem_cotacao' });
    }
    expect(r.distanciaMaxima).toMatchObject({ estado: 'ausente', motivo: 'sem_cotacao' });
    expect(r.maxima).toBeNull();
  });
});

describe('lerRetornosAtivo', () => {
  it('lê pela PK em maiúsculas e converte a linha do banco', async () => {
    const findUnique = vi.fn(async () => ({
      symbol: 'HGLG11',
      classe: 'fii',
      asOf: new Date('2026-10-16T00:00:00Z'),
      preco: { toNumber: () => 160.5 },
      ret1mPct: 1,
      ret12mPct: 2,
      ret5aAaPct: 3,
      ret10aAaPct: null,
      precoMaxAjustado: 180,
      distMaxPct: -10.8,
      dataMax: new Date('2020-01-28T00:00:00Z'),
      inicioSerie: new Date('2015-01-02T00:00:00Z'),
      pregoes: 2900,
      flags: ['serie_curta_10a', 'flag_desconhecida'],
      calculadoEm: new Date(),
    }));
    const db = { assetRetornosCotacao: { findUnique } } as unknown as PrismaClient;
    const r = await lerRetornosAtivo(db, 'hglg11', 'fii');
    expect(findUnique).toHaveBeenCalledWith({ where: { symbol: 'HGLG11' } });
    expect(r!.ateData).toBe('2026-10-16');
    expect(r!.flags).toEqual(['serie_curta_10a']);
    expect(r!.maxima).toEqual({ preco: 180, data: '2020-01-28' });
    expect(r!.janelas[3].valor).toMatchObject({ motivo: 'serie_curta' });
  });
});
