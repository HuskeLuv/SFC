import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ eventosAcoesCorporativas: vi.fn() }));
vi.mock('../fontes/acoesCorporativas', () => ({
  eventosAcoesCorporativas: mocks.eventosAcoesCorporativas,
}));

import { eventosMercado, feriadosComoEventos } from '../fontes/mercado';
import { isHolidayB3 } from '@/utils/feriadosB3';
import { deDataCivil } from '../datas';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.eventosAcoesCorporativas.mockResolvedValue([]);
});

describe('feriados da B3 na agenda', () => {
  it('traz os 12 feriados do ano, em ordem e com nome', () => {
    const eventos = feriadosComoEventos({ de: '2026-01-01', ate: '2026-12-31' });
    expect(eventos).toHaveLength(12);
    expect(eventos.map((e) => e.data)).toEqual([...eventos.map((e) => e.data)].sort());
    expect(eventos[0]).toMatchObject({
      data: '2026-01-01',
      titulo: 'Feriado · Confraternização Universal',
      tipo: 'mercado',
      valor: null,
    });
    expect(eventos.at(-1)).toMatchObject({ data: '2026-12-25', titulo: 'Feriado · Natal' });
  });

  it('as datas batem com o calendário que o app usa para contar dia útil', () => {
    for (const e of feriadosComoEventos({ de: '2026-01-01', ate: '2027-12-31' })) {
      expect(isHolidayB3(deDataCivil(e.data))).toBe(true);
    }
  });

  it('feriado móvel acompanha a Páscoa (Carnaval e Sexta-feira Santa de 2026)', () => {
    const eventos = feriadosComoEventos({ de: '2026-02-01', ate: '2026-04-30' });
    const porNome = Object.fromEntries(eventos.map((e) => [e.titulo, e.data]));
    // Páscoa de 2026 = 05/04 → Carnaval 16 e 17/02, Sexta-feira Santa 03/04.
    expect(eventos.filter((e) => e.titulo.includes('Carnaval')).map((e) => e.data)).toEqual([
      '2026-02-16',
      '2026-02-17',
    ]);
    expect(porNome['Feriado · Sexta-feira Santa']).toBe('2026-04-03');
  });

  it('corta pelo período pedido e atravessa a virada do ano', () => {
    const eventos = feriadosComoEventos({ de: '2026-12-20', ate: '2027-01-05' });
    expect(eventos.map((e) => e.data)).toEqual(['2026-12-25', '2027-01-01']);
  });

  it('período sem feriado nenhum volta vazio', () => {
    expect(feriadosComoEventos({ de: '2026-08-01', ate: '2026-08-31' })).toEqual([]);
  });
});

describe('eventosMercado', () => {
  it('junta feriados e eventos corporativos', async () => {
    mocks.eventosAcoesCorporativas.mockResolvedValue([
      {
        id: 'mercado:corporativo:ca1',
        tipo: 'mercado',
        titulo: 'PETR4 · desdobramento',
        data: '2026-12-28',
        dataFim: null,
        hora: null,
        valor: null,
        descricao: null,
        link: '/ativos/p1',
        detalhe: {},
      },
    ]);

    const eventos = await eventosMercado('u1', { de: '2026-12-20', ate: '2026-12-31' });
    expect(eventos.map((e) => e.detalhe.evento ?? 'corporativo')).toEqual([
      'feriado',
      'corporativo',
    ]);
    expect(mocks.eventosAcoesCorporativas).toHaveBeenCalledWith('u1', {
      de: '2026-12-20',
      ate: '2026-12-31',
    });
  });
});
