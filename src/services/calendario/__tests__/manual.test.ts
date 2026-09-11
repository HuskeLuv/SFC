import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event } from '@prisma/client';

const mocks = vi.hoisted(() => ({ prisma: { event: { findMany: vi.fn() } } }));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }));

import { datasDasOcorrencias, eventosManuais, expandirEvento } from '../fontes/manual';
import { montarAgenda, ordenarEventos, parsePeriodo } from '../agenda';
import { camposDoEvento, paraPrisma, serializarEvento } from '../eventoManual';
import {
  dataCivil,
  deDataCivil,
  diasNoMes,
  ehDataCivilValida,
  hojeCivil,
  somarDias,
} from '../datas';

const evento = (over: Partial<Event> = {}): Event => ({
  id: 'e1',
  userId: 'u1',
  title: 'Renovar seguro',
  description: null,
  date: deDataCivil('2026-09-25'),
  endDate: null,
  hora: null,
  categoria: 'pessoal',
  recorrencia: 'nenhuma',
  lembrete: false,
  createdAt: new Date('2026-09-01T12:00:00Z'),
  updatedAt: new Date('2026-09-01T12:00:00Z'),
  ...over,
});

describe('datas civis', () => {
  it('não desloca o dia por fuso e valida o formato', () => {
    expect(dataCivil(deDataCivil('2026-09-30'))).toBe('2026-09-30');
    expect(ehDataCivilValida('2026-02-30')).toBe(false);
    expect(ehDataCivilValida('2026-13-01')).toBe(false);
    expect(ehDataCivilValida('2028-02-29')).toBe(true);
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(diasNoMes(2026, 1)).toBe(28);
    // 10/09 às 01:00Z ainda é 09/09 no Brasil (UTC-3).
    expect(hojeCivil(new Date('2026-09-10T01:00:00Z'))).toBe('2026-09-09');
    expect(hojeCivil(new Date('2026-09-10T03:00:00Z'))).toBe('2026-09-10');
  });
});

describe('datasDasOcorrencias', () => {
  const periodo = { de: '2026-09-01', ate: '2026-09-30' };

  it('evento único: só quando cai no período (inclusive de vários dias que começou antes)', () => {
    expect(
      datasDasOcorrencias({ data: '2026-09-25', dataFim: null, recorrencia: 'nenhuma' }, periodo),
    ).toEqual(['2026-09-25']);
    expect(
      datasDasOcorrencias({ data: '2026-10-01', dataFim: null, recorrencia: 'nenhuma' }, periodo),
    ).toEqual([]);
    expect(
      datasDasOcorrencias(
        { data: '2026-08-30', dataFim: '2026-09-02', recorrencia: 'nenhuma' },
        periodo,
      ),
    ).toEqual(['2026-08-30']);
    expect(
      datasDasOcorrencias(
        { data: '2026-08-30', dataFim: '2026-08-31', recorrencia: 'nenhuma' },
        periodo,
      ),
    ).toEqual([]);
  });

  it('mensal: mesmo dia todo mês, dia 31 vira o último dia do mês, nunca antes da data base', () => {
    const base = { data: '2026-07-31', dataFim: null, recorrencia: 'mensal' };
    expect(datasDasOcorrencias(base, periodo)).toEqual(['2026-09-30']);
    expect(datasDasOcorrencias(base, { de: '2027-02-01', ate: '2027-02-28' })).toEqual([
      '2027-02-28',
    ]);
    expect(datasDasOcorrencias(base, { de: '2026-06-01', ate: '2026-07-30' })).toEqual([]);
    expect(datasDasOcorrencias(base, { de: '2026-07-01', ate: '2026-10-31' })).toEqual([
      '2026-07-31',
      '2026-08-31',
      '2026-09-30',
      '2026-10-31',
    ]);
  });

  it('anual: mesmo dia e mês; 29/02 vira 28/02 em ano comum', () => {
    const base = { data: '2028-02-29', dataFim: null, recorrencia: 'anual' };
    expect(datasDasOcorrencias(base, { de: '2029-02-01', ate: '2029-03-01' })).toEqual([
      '2029-02-28',
    ]);
    expect(datasDasOcorrencias(base, { de: '2027-02-01', ate: '2027-03-01' })).toEqual([]);
    expect(datasDasOcorrencias(base, { de: '2032-01-01', ate: '2032-12-31' })).toEqual([
      '2032-02-29',
    ]);
  });
});

describe('expandirEvento', () => {
  it('gera um EventoAgenda por ocorrência, com fim proporcional e marca de repetição', () => {
    const e = evento({
      date: deDataCivil('2026-08-10'),
      endDate: deDataCivil('2026-08-12'),
      recorrencia: 'mensal',
      hora: '09:30',
      description: 'levar documentos',
    });
    const out = expandirEvento(e, { de: '2026-09-01', ate: '2026-10-31' });
    expect(out).toEqual([
      expect.objectContaining({
        id: 'manual:e1:2026-09-10',
        tipo: 'manual',
        titulo: 'Renovar seguro',
        data: '2026-09-10',
        dataFim: '2026-09-12',
        hora: '09:30',
        valor: null,
        descricao: 'levar documentos',
        link: null,
        detalhe: expect.objectContaining({
          eventoId: 'e1',
          recorrencia: 'mensal',
          ocorrencia: true,
        }),
      }),
      expect.objectContaining({
        id: 'manual:e1:2026-10-10',
        data: '2026-10-10',
        dataFim: '2026-10-12',
      }),
    ]);
    expect(
      expandirEvento(evento(), { de: '2026-09-01', ate: '2026-09-30' })[0].detalhe.ocorrencia,
    ).toBe(false);
  });
});

describe('eventosManuais', () => {
  beforeEach(() => mocks.prisma.event.findMany.mockReset());

  it('consulta pelo período (inclui recorrentes anteriores) e expande', async () => {
    mocks.prisma.event.findMany.mockResolvedValue([
      evento(),
      evento({
        id: 'e2',
        title: 'Aluguel',
        date: deDataCivil('2026-01-10'),
        recorrencia: 'mensal',
      }),
    ]);
    const out = await eventosManuais('u1', { de: '2026-09-01', ate: '2026-09-30' });
    expect(mocks.prisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'u1',
          date: { lte: deDataCivil('2026-09-30') },
          OR: [
            { date: { gte: deDataCivil('2026-09-01') } },
            { endDate: { gte: deDataCivil('2026-09-01') } },
            { recorrencia: { in: ['mensal', 'anual'] } },
          ],
        },
      }),
    );
    expect(out.map((e) => [e.titulo, e.data])).toEqual([
      ['Renovar seguro', '2026-09-25'],
      ['Aluguel', '2026-09-10'],
    ]);
  });
});

describe('agenda', () => {
  it('parsePeriodo: padrão mês atual; valida formato, ordem e tamanho', () => {
    expect(parsePeriodo(new URLSearchParams(), new Date('2026-09-10T12:00:00Z'))).toEqual({
      de: '2026-09-01',
      ate: '2026-09-30',
    });
    expect(parsePeriodo(new URLSearchParams('de=2026-08-30&ate=2026-10-05'))).toEqual({
      de: '2026-08-30',
      ate: '2026-10-05',
    });
    expect(() => parsePeriodo(new URLSearchParams('de=2026-08-30'))).toThrow(/AAAA-MM-DD/);
    expect(() => parsePeriodo(new URLSearchParams('de=2026-10-05&ate=2026-08-30'))).toThrow(
      /depois/,
    );
    expect(() => parsePeriodo(new URLSearchParams('de=2025-01-01&ate=2026-12-31'))).toThrow(
      /400 dias/,
    );
  });

  it('ordena por dia, hora (dia inteiro antes) e título', () => {
    const base = {
      tipo: 'manual' as const,
      dataFim: null,
      valor: null,
      descricao: null,
      link: null,
      detalhe: {},
    };
    const out = ordenarEventos([
      { ...base, id: 'c', titulo: 'B', data: '2026-09-02', hora: null },
      { ...base, id: 'a', titulo: 'Z', data: '2026-09-01', hora: '10:00' },
      { ...base, id: 'b', titulo: 'A', data: '2026-09-01', hora: null },
      { ...base, id: 'd', titulo: 'A', data: '2026-09-02', hora: null },
    ]);
    expect(out.map((e) => e.id)).toEqual(['b', 'a', 'd', 'c']);
  });

  it('montarAgenda: fonte com erro não derruba as outras', async () => {
    mocks.prisma.event.findMany.mockRejectedValueOnce(new Error('db down'));
    const r = await montarAgenda('u1', { de: '2026-09-01', ate: '2026-09-30' });
    expect(r).toEqual({ eventos: [], fontesComErro: ['manual'] });
    mocks.prisma.event.findMany.mockResolvedValueOnce([evento()]);
    const ok = await montarAgenda('u1', { de: '2026-09-01', ate: '2026-09-30' });
    expect(ok.eventos).toHaveLength(1);
    expect(ok.fontesComErro).toEqual([]);
  });
});

describe('eventoManual', () => {
  it('serializa com datas civis e converte de volta só os campos presentes', () => {
    const e = evento({ endDate: deDataCivil('2026-09-26'), hora: '08:00' });
    expect(serializarEvento(e)).toEqual({
      id: 'e1',
      titulo: 'Renovar seguro',
      descricao: null,
      data: '2026-09-25',
      dataFim: '2026-09-26',
      hora: '08:00',
      categoria: 'pessoal',
      recorrencia: 'nenhuma',
      lembrete: false,
      criadoEm: '2026-09-01T12:00:00.000Z',
      atualizadoEm: '2026-09-01T12:00:00.000Z',
    });
    expect(camposDoEvento(e).data).toBe('2026-09-25');
    expect(paraPrisma({ data: '2026-10-01', dataFim: null, lembrete: true })).toEqual({
      date: deDataCivil('2026-10-01'),
      endDate: null,
      lembrete: true,
    });
  });
});
