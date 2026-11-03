import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    agendaPreferencia: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    notification: { findMany: vi.fn(), create: vi.fn() },
  },
  montarAgenda: vi.fn(),
  enviarPush: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }));
vi.mock('../agenda', () => ({ montarAgenda: mocks.montarAgenda }));
vi.mock('@/services/push/enviarPush', () => ({ enviarPushDaNotificacao: mocks.enviarPush }));

import {
  AGENDA_LEMBRETE_TYPE,
  HREF_PROVENTOS,
  PROVENTO_RECEBIDO_TYPE,
  runAgendaLembretesJob,
  selecionarLembretes,
  textoDoLembrete,
  textoProventosRecebidos,
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
  mocks.prisma.notification.create.mockResolvedValue({ id: 'notif-criada' });
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
    expect(parcela.message.replace(/\s/g, ' ')).toContain('R$ 1.234,50');
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

describe('textoProventosRecebidos', () => {
  const prov = (symbol: string, valor: number | null, tipoProvento = 'Dividendo') =>
    ev({
      tipo: 'provento',
      data: HOJE,
      id: `provento:${symbol}:${tipoProvento}`,
      valor,
      detalhe: { evento: 'pagamento', symbol, tipoProvento },
    });

  it('dois ativos: nomes no título; sem valor não inventa R$', () => {
    const t = textoProventosRecebidos([prov('ITSA4', null), prov('BBAS3', 12.5)]);
    expect(t.title).toBe('Você recebeu proventos de ITSA4 e BBAS3');
    expect(t.message.replace(/\s/g, ' ')).toBe(
      '2 proventos com pagamento hoje: ITSA4 (Dividendo) e BBAS3 (Dividendo) R$ 12,50.',
    );
  });

  it('mesmo ativo com JCP e dividendo: um nome só no título', () => {
    const t = textoProventosRecebidos([prov('ITSA4', 1, 'JCP'), prov('ITSA4', 2)]);
    expect(t.title).toBe('Você recebeu proventos de ITSA4');
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
    // Gancho de web push (fase 5): dispara com a notificação criada — o gate
    // de preferência por categoria fica no serviço de envio, cron incluído.
    expect(mocks.enviarPush).toHaveBeenCalledWith({ id: 'notif-criada' });
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

  it('provento de hoje vira UM aviso próprio, com o ativo no título e o valor só na mensagem', async () => {
    mocks.prisma.user.findMany.mockResolvedValue([{ id: 'u1' }]);
    mocks.montarAgenda.mockResolvedValue({
      eventos: [
        ev({
          tipo: 'provento',
          data: HOJE,
          id: 'provento:ITSA4:JCP:2026-09-18:pagamento',
          titulo: 'ITSA4 · JCP',
          valor: 80,
          link: '/ativos/p1',
          detalhe: { evento: 'pagamento', symbol: 'ITSA4', tipoProvento: 'JCP' },
        }),
      ],
      fontesComErro: [],
    });

    const r = await runAgendaLembretesJob(AGORA);
    expect(r.notificacoes).toBe(1);
    const { data } = mocks.prisma.notification.create.mock.calls[0][0];
    expect(data.type).toBe(PROVENTO_RECEBIDO_TYPE);
    expect(data.title).toBe('Você recebeu proventos de ITSA4');
    expect(data.title).not.toContain('R$');
    expect(data.message.replace(/\s/g, ' ')).toBe('Você recebeu R$ 80,00 de ITSA4 (JCP) hoje.');
    expect(data.metadata).toEqual({
      data: HOJE,
      eventoIds: ['provento:ITSA4:JCP:2026-09-18:pagamento'],
      symbols: ['ITSA4'],
      href: '/ativos/p1',
    });
    expect(mocks.enviarPush).toHaveBeenCalledWith({ id: 'notif-criada' });
  });

  it('vários proventos no dia: um resumo só, fora do teto dos lembretes', async () => {
    mocks.prisma.user.findMany.mockResolvedValue([{ id: 'u1' }]);
    const symbols = ['ITSA4', 'BBAS3', 'TAEE11', 'HGLG11', 'MXRF11', 'KNRI11', 'VALE3'];
    mocks.montarAgenda.mockResolvedValue({
      eventos: [
        ...symbols.map((s) =>
          ev({
            tipo: 'provento',
            data: HOJE,
            id: `provento:${s}`,
            valor: 10,
            detalhe: { evento: 'pagamento', symbol: s, tipoProvento: 'Dividendo' },
          }),
        ),
        ev({ tipo: 'rf', data: AMANHA, valor: 100 }),
      ],
      fontesComErro: [],
    });

    const r = await runAgendaLembretesJob(AGORA);
    expect(r.notificacoes).toBe(2);
    const proventos = mocks.prisma.notification.create.mock.calls
      .map((c) => c[0].data)
      .filter((d) => d.type === PROVENTO_RECEBIDO_TYPE);
    expect(proventos).toHaveLength(1);
    expect(proventos[0].title).toBe('Você recebeu proventos de 7 ativos');
    expect(proventos[0].message.replace(/\s/g, ' ')).toContain('R$ 70,00 em 7 proventos');
    expect(proventos[0].message).toContain('e mais 2');
    expect(proventos[0].metadata.href).toBe(HREF_PROVENTOS);
  });

  it('não reenvia o aviso de proventos no mesmo dia (cron rodando de novo)', async () => {
    mocks.prisma.user.findMany.mockResolvedValue([{ id: 'u1' }]);
    mocks.montarAgenda.mockResolvedValue({
      eventos: [
        ev({
          tipo: 'provento',
          data: HOJE,
          valor: 5,
          detalhe: { evento: 'pagamento', symbol: 'ITSA4' },
        }),
      ],
      fontesComErro: [],
    });
    mocks.prisma.notification.findMany.mockResolvedValue([
      { type: PROVENTO_RECEBIDO_TYPE, metadata: { data: HOJE, eventoIds: ['x'] } },
    ]);

    const r = await runAgendaLembretesJob(AGORA);
    expect(r.notificacoes).toBe(0);
    expect(mocks.prisma.notification.create).not.toHaveBeenCalled();
  });

  it('provento já avisado no formato antigo (lembrete da agenda) não repete', async () => {
    mocks.prisma.user.findMany.mockResolvedValue([{ id: 'u1' }]);
    mocks.montarAgenda.mockResolvedValue({
      eventos: [ev({ tipo: 'provento', data: HOJE, detalhe: { evento: 'pagamento' } })],
      fontesComErro: [],
    });
    mocks.prisma.notification.findMany.mockResolvedValue([
      { type: AGENDA_LEMBRETE_TYPE, metadata: { eventoId: 'provento:2026-09-18', data: HOJE } },
    ]);

    expect((await runAgendaLembretesJob(AGORA)).notificacoes).toBe(0);
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
