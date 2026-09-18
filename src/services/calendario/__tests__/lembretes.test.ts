import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    agendaPreferencia: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    notification: { findMany: vi.fn(), create: vi.fn() },
  },
  montarAgenda: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }));
vi.mock('../agenda', () => ({ montarAgenda: mocks.montarAgenda }));

import {
  AGENDA_LEMBRETE_TYPE,
  runAgendaLembretesJob,
  selecionarLembretes,
  textoDoLembrete,
} from '../lembretes';
import type { EventoAgenda, TipoEvento } from '../types';

const HOJE = '2026-09-18';
const AMANHA = '2026-09-19';
// 12:00Z → dia civil BR ainda é 18/09.
const AGORA = new Date('2026-09-18T12:00:00Z');

const ev = (over: Partial<EventoAgenda> & { tipo: TipoEvento; data: string }): EventoAgenda => ({
  id: `${over.tipo}:${over.data}`,
  titulo: 'Evento',
  dataFim: null,
  hora: null,
  valor: null,
  descricao: null,
  link: null,
  detalhe: {},
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.agendaPreferencia.findMany.mockResolvedValue([]);
  mocks.prisma.notification.findMany.mockResolvedValue([]);
  mocks.prisma.notification.create.mockResolvedValue({});
});

describe('selecionarLembretes', () => {
  it('o que vence avisa na véspera e o provento avisa no dia', () => {
    const eventos = [
      ev({ tipo: 'divida', data: AMANHA, valor: 1000, detalhe: { paga: false } }),
      ev({ tipo: 'rf', data: AMANHA, valor: 5000 }),
      ev({ tipo: 'ir', data: AMANHA, valor: 200 }),
      ev({ tipo: 'provento', data: HOJE, valor: 80, detalhe: { evento: 'pagamento' } }),
    ];
    const out = selecionarLembretes(eventos, HOJE, AMANHA);
    expect(out.map((o) => [o.evento.tipo, o.quando])).toEqual([
      ['divida', 'vespera'],
      ['rf', 'vespera'],
      ['ir', 'vespera'],
      ['provento', 'hoje'],
    ]);
  });

  it('não avisa parcela paga, data-com, provento de amanhã nem evento sem lembrete', () => {
    const eventos = [
      ev({ tipo: 'divida', data: AMANHA, detalhe: { paga: true } }),
      ev({ tipo: 'provento', data: HOJE, detalhe: { evento: 'data-com' } }),
      ev({ tipo: 'provento', data: AMANHA, detalhe: { evento: 'pagamento' } }),
      ev({ tipo: 'manual', data: AMANHA, detalhe: { lembrete: false } }),
    ];
    expect(selecionarLembretes(eventos, HOJE, AMANHA)).toEqual([]);
  });

  it('evento manual com lembrete marcado avisa na véspera', () => {
    const eventos = [ev({ tipo: 'manual', data: AMANHA, detalhe: { lembrete: true } })];
    expect(selecionarLembretes(eventos, HOJE, AMANHA)).toHaveLength(1);
  });

  it('nada fora da janela de dois dias', () => {
    const eventos = [
      ev({ tipo: 'divida', data: '2026-09-25', detalhe: { paga: false } }),
      ev({ tipo: 'divida', data: '2026-09-17', detalhe: { paga: false } }),
    ];
    expect(selecionarLembretes(eventos, HOJE, AMANHA)).toEqual([]);
  });
});

describe('textoDoLembrete', () => {
  it('título por tipo e valor formatado', () => {
    const parcela = textoDoLembrete(
      ev({ tipo: 'divida', data: AMANHA, titulo: 'Apê · parcela 3/120', valor: 1234.5 }),
      'vespera',
    );
    expect(parcela.title).toBe('Parcela vence amanhã');
    expect(parcela.message.replace(/ /g, ' ')).toContain('R$ 1.234,50');
    expect(parcela.message).toContain('19/09/2026');

    const provento = textoDoLembrete(
      ev({ tipo: 'provento', data: HOJE, titulo: 'ITSA4 · JCP', valor: 80 }),
      'hoje',
    );
    expect(provento.title).toBe('Provento na conta hoje');

    expect(textoDoLembrete(ev({ tipo: 'ir', data: AMANHA }), 'vespera').title).toBe(
      'Prazo de imposto amanhã',
    );
    // Sem valor não inventa parênteses vazios.
    expect(textoDoLembrete(ev({ tipo: 'manual', data: AMANHA }), 'vespera').message).not.toContain(
      '()',
    );
  });
});

describe('runAgendaLembretesJob', () => {
  it('cria uma notificação por evento, com metadata de dedup', async () => {
    mocks.prisma.user.findMany.mockResolvedValue([{ id: 'u1' }]);
    mocks.montarAgenda.mockResolvedValue({
      eventos: [ev({ tipo: 'divida', data: AMANHA, valor: 1000, detalhe: { paga: false } })],
      fontesComErro: [],
    });

    const r = await runAgendaLembretesJob(AGORA);
    expect(r).toEqual({ usuarios: 1, notificacoes: 1, comErro: 0 });
    expect(mocks.prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        type: AGENDA_LEMBRETE_TYPE,
        metadata: expect.objectContaining({
          eventoId: 'divida:2026-09-19',
          data: AMANHA,
          quando: 'vespera',
        }),
      }),
    });
    // Janela de dois dias.
    expect(mocks.montarAgenda).toHaveBeenCalledWith(
      'u1',
      { de: HOJE, ate: AMANHA },
      expect.arrayContaining(['divida', 'rf', 'provento', 'ir', 'manual']),
    );
  });

  it('não repete lembrete já enviado para o mesmo evento e data', async () => {
    mocks.prisma.user.findMany.mockResolvedValue([{ id: 'u1' }]);
    mocks.montarAgenda.mockResolvedValue({
      eventos: [ev({ tipo: 'divida', data: AMANHA, detalhe: { paga: false } })],
      fontesComErro: [],
    });
    mocks.prisma.notification.findMany.mockResolvedValue([
      { metadata: { eventoId: 'divida:2026-09-19', data: AMANHA } },
    ]);

    const r = await runAgendaLembretesJob(AGORA);
    expect(r.notificacoes).toBe(0);
    expect(mocks.prisma.notification.create).not.toHaveBeenCalled();
  });

  it('pula quem desligou os lembretes no perfil', async () => {
    mocks.prisma.user.findMany.mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]);
    mocks.prisma.agendaPreferencia.findMany.mockResolvedValue([{ userId: 'u1' }]);
    mocks.montarAgenda.mockResolvedValue({ eventos: [], fontesComErro: [] });

    const r = await runAgendaLembretesJob(AGORA);
    expect(r.usuarios).toBe(1);
    expect(mocks.montarAgenda).toHaveBeenCalledTimes(1);
    expect(mocks.montarAgenda).toHaveBeenCalledWith('u2', expect.anything(), expect.anything());
  });

  it('respeita o teto por usuário', async () => {
    mocks.prisma.user.findMany.mockResolvedValue([{ id: 'u1' }]);
    mocks.montarAgenda.mockResolvedValue({
      eventos: Array.from({ length: 15 }, (_, i) =>
        ev({ tipo: 'divida', data: AMANHA, id: `divida:${i}`, detalhe: { paga: false } }),
      ),
      fontesComErro: [],
    });

    const r = await runAgendaLembretesJob(AGORA);
    expect(r.notificacoes).toBe(10);
  });

  it('falha de um usuário não derruba a rodada', async () => {
    mocks.prisma.user.findMany.mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]);
    mocks.montarAgenda.mockRejectedValueOnce(new Error('db')).mockResolvedValueOnce({
      eventos: [ev({ tipo: 'rf', data: AMANHA, valor: 100 })],
      fontesComErro: [],
    });

    const r = await runAgendaLembretesJob(AGORA);
    expect(r).toEqual({ usuarios: 2, notificacoes: 1, comErro: 1 });
  });
});
