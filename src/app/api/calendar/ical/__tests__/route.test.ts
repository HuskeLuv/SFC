import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  prisma: { agendaPreferencia: { findUnique: vi.fn() } },
  montarAgenda: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }));
vi.mock('@/services/calendario/agenda', () => ({ montarAgenda: mocks.montarAgenda }));

import { GET } from '../route';

const TOKEN = 'a'.repeat(43);
const req = (qs: string) => new NextRequest(`http://localhost/api/calendar/ical${qs}`);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.montarAgenda.mockResolvedValue({ eventos: [], fontesComErro: [] });
});

describe('GET /api/calendar/ical', () => {
  it('token válido devolve .ics com o content-type certo e sem cache', async () => {
    mocks.prisma.agendaPreferencia.findUnique.mockResolvedValue({ userId: 'u1' });
    mocks.montarAgenda.mockResolvedValue({
      eventos: [
        {
          id: 'divida:d1:3',
          tipo: 'divida',
          titulo: 'Apê · parcela 3/120',
          data: '2026-10-10',
          dataFim: null,
          hora: null,
          valor: 1234.56,
          descricao: 'Parcela a pagar',
          link: '/dividas',
          detalhe: {},
        },
      ],
      fontesComErro: [],
    });

    const res = await GET(req(`?token=${TOKEN}`));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/calendar');
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');

    const corpo = await res.text();
    expect(corpo).toContain('BEGIN:VCALENDAR');
    expect(corpo).toContain('SUMMARY:Apê · parcela 3/120');
    // Sem valores, mesmo com o evento tendo valor.
    expect(corpo).not.toContain('1234');
    expect(corpo).not.toContain('R$');
  });

  it('busca a agenda do dono do token', async () => {
    mocks.prisma.agendaPreferencia.findUnique.mockResolvedValue({ userId: 'u9' });
    await GET(req(`?token=${TOKEN}`));
    expect(mocks.prisma.agendaPreferencia.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { icalToken: TOKEN } }),
    );
    expect(mocks.montarAgenda).toHaveBeenCalledWith('u9', expect.anything());
  });

  it('token desconhecido → 404 (não confirma existência) e não monta agenda', async () => {
    mocks.prisma.agendaPreferencia.findUnique.mockResolvedValue(null);
    const res = await GET(req(`?token=${TOKEN}`));
    expect(res.status).toBe(404);
    expect(mocks.montarAgenda).not.toHaveBeenCalled();
  });

  it('sem token ou com token curto → 404 sem tocar no banco', async () => {
    expect((await GET(req(''))).status).toBe(404);
    expect((await GET(req('?token=123'))).status).toBe(404);
    expect(mocks.prisma.agendaPreferencia.findUnique).not.toHaveBeenCalled();
  });
});
