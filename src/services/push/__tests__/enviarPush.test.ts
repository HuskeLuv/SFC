import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    pushSubscription: { findMany: vi.fn(), delete: vi.fn() },
    pushPreferencia: { findUnique: vi.fn() },
  },
  webpush: { setVapidDetails: vi.fn(), sendNotification: vi.fn() },
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }));
vi.mock('web-push', () => ({ default: mocks.webpush }));
vi.mock('@/lib/logger', () => ({ logger: mocks.logger }));

import { enviarPushDaNotificacao } from '../enviarPush';
import { resetWebPush } from '@/lib/webPush';
import { textoDoLembrete } from '@/services/calendario/lembretes';
import type { EventoAgenda } from '@/services/calendario/types';

const ligarPush = () => {
  vi.stubEnv('WEB_PUSH_HABILITADO', 'true');
  vi.stubEnv('VAPID_PUBLIC_KEY', 'chave-publica');
  vi.stubEnv('VAPID_PRIVATE_KEY', 'chave-privada');
};

const sub = (endpoint: string) => ({
  id: `id-${endpoint}`,
  userId: 'u1',
  endpoint,
  p256dh: 'p256dh',
  auth: 'auth',
  userAgent: null,
});

const notifOrcamento = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'n1',
  userId: 'u1',
  type: 'orcamento_alerta',
  title: 'Orçamento de Habitação estourado',
  metadata: { year: 2026, month: 8, groupId: 'g-hab', rank: 3 },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  resetWebPush();
  mocks.prisma.pushSubscription.findMany.mockResolvedValue([sub('https://push.example/a')]);
  mocks.prisma.pushSubscription.delete.mockResolvedValue({});
  mocks.prisma.pushPreferencia.findUnique.mockResolvedValue(null);
  mocks.webpush.sendNotification.mockResolvedValue({ statusCode: 201 });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('enviarPushDaNotificacao', () => {
  it('não faz nada com o push desabilitado (env desligada)', async () => {
    await enviarPushDaNotificacao(notifOrcamento());
    expect(mocks.prisma.pushSubscription.findMany).not.toHaveBeenCalled();
    expect(mocks.webpush.sendNotification).not.toHaveBeenCalled();
  });

  it('type fora do contrato não envia (não inventa categoria)', async () => {
    ligarPush();
    await enviarPushDaNotificacao(notifOrcamento({ type: 'novidade_inventada' }));
    expect(mocks.prisma.pushSubscription.findMany).not.toHaveBeenCalled();
    expect(mocks.webpush.sendNotification).not.toHaveBeenCalled();
  });

  it('sem assinaturas retorna sem consultar preferência', async () => {
    ligarPush();
    mocks.prisma.pushSubscription.findMany.mockResolvedValue([]);
    await enviarPushDaNotificacao(notifOrcamento());
    expect(mocks.prisma.pushPreferencia.findUnique).not.toHaveBeenCalled();
    expect(mocks.webpush.sendNotification).not.toHaveBeenCalled();
  });

  it('preferência desligada bloqueia a categoria — vale para todo envio, cron incluído', async () => {
    ligarPush();
    mocks.prisma.pushPreferencia.findUnique.mockResolvedValue({
      orcamento: false,
      agenda: true,
      comunidade: true,
      conta: true,
    });
    await enviarPushDaNotificacao(notifOrcamento());
    expect(mocks.webpush.sendNotification).not.toHaveBeenCalled();
  });

  it('sem registro de preferência = tudo ligado (padrão)', async () => {
    ligarPush();
    await enviarPushDaNotificacao(notifOrcamento());
    expect(mocks.webpush.sendNotification).toHaveBeenCalledTimes(1);
  });

  it('payload do orçamento segue o contrato: título real, corpo genérico, tag por grupo, TTL 1d', async () => {
    ligarPush();
    await enviarPushDaNotificacao(notifOrcamento());

    const [assinatura, json, options] = mocks.webpush.sendNotification.mock.calls[0];
    expect(assinatura).toEqual({
      endpoint: 'https://push.example/a',
      keys: { p256dh: 'p256dh', auth: 'auth' },
    });
    expect(JSON.parse(json)).toEqual({
      v: 1,
      categoria: 'orcamento',
      title: 'Orçamento de Habitação estourado',
      body: 'Toque para ver os detalhes no app.',
      url: '/fluxodecaixa?modo=orcamento',
      tag: 'mf-orcamento-g-hab',
      notificationId: 'n1',
    });
    expect(options).toEqual({ TTL: 86400, urgency: 'normal' });
  });

  it('escalada de rank do MESMO grupo gera a MESMA tag (substitui em vez de empilhar)', async () => {
    ligarPush();
    await enviarPushDaNotificacao(
      notifOrcamento({ id: 'n1', metadata: { groupId: 'g-hab', rank: 1 } }),
    );
    await enviarPushDaNotificacao(
      notifOrcamento({ id: 'n2', metadata: { groupId: 'g-hab', rank: 3 } }),
    );
    const tags = mocks.webpush.sendNotification.mock.calls.map(([, json]) => JSON.parse(json).tag);
    expect(tags).toEqual(['mf-orcamento-g-hab', 'mf-orcamento-g-hab']);
  });

  it('lembrete da agenda: título real de textoDoLembrete sai; a message (com R$) NUNCA sai', async () => {
    ligarPush();
    const evento = {
      id: 'divida:2026-09-19',
      tipo: 'divida',
      data: '2026-09-19',
      titulo: 'Apê · parcela 3/120',
      dataFim: null,
      hora: null,
      valor: 1234.5,
      descricao: null,
      link: null,
      detalhe: { paga: false },
    } as unknown as EventoAgenda;
    const { title, message } = textoDoLembrete(evento, 'vespera');
    expect(message).toContain('R$'); // a fonte embute valor na message…

    await enviarPushDaNotificacao({
      id: 'n9',
      userId: 'u1',
      type: 'agenda_lembrete',
      title,
      metadata: { eventoId: evento.id, data: evento.data, tipo: 'divida', quando: 'vespera' },
    });

    const [, json, options] = mocks.webpush.sendNotification.mock.calls[0];
    expect(json).not.toContain('R$'); // …e o payload não leva um centavo
    const payload = JSON.parse(json);
    expect(payload).not.toHaveProperty('message');
    expect(payload.title).toBe('Parcela vence amanhã');
    expect(payload.body).toBe('Toque para ver os detalhes na agenda.');
    expect(payload.url).toBe('/calendario');
    expect(payload.tag).toBe('mf-agenda-divida:2026-09-19');
    expect(options).toEqual({ TTL: 43200, urgency: 'normal' });
  });

  it('convite de consultoria: categoria conta, TTL de 7 dias e tag por invite', async () => {
    ligarPush();
    await enviarPushDaNotificacao({
      id: 'n5',
      userId: 'u1',
      type: 'consultant_invite',
      title: 'Convite de consultoria',
      metadata: { inviteId: 'inv-1', consultantId: 'c1' },
    });
    const [, json, options] = mocks.webpush.sendNotification.mock.calls[0];
    const payload = JSON.parse(json);
    expect(payload.categoria).toBe('conta');
    expect(payload.tag).toBe('mf-conta-inv-1');
    expect(payload.url).toBe('/'); // convite não tem href de metadata — fallback seguro
    expect(options).toEqual({ TTL: 604800, urgency: 'normal' });
  });

  it('comentário da comunidade usa o href validado do metadata como deep link', async () => {
    ligarPush();
    await enviarPushDaNotificacao({
      id: 'n6',
      userId: 'u1',
      type: 'comunidade-comentario',
      title: 'Novo comentário no seu post',
      metadata: { postId: 'p1', href: '/comunidade/p1' },
    });
    const payload = JSON.parse(mocks.webpush.sendNotification.mock.calls[0][1]);
    expect(payload).toMatchObject({
      categoria: 'comunidade',
      url: '/comunidade/p1',
      tag: 'mf-comunidade-p1',
    });
  });

  it('404/410 do push service apaga a assinatura morta e mantém as vivas', async () => {
    ligarPush();
    mocks.prisma.pushSubscription.findMany.mockResolvedValue([
      sub('https://push.example/morta'),
      sub('https://push.example/viva'),
    ]);
    mocks.webpush.sendNotification.mockImplementation(async (assinatura: { endpoint: string }) => {
      if (assinatura.endpoint.endsWith('/morta')) {
        throw Object.assign(new Error('Gone'), { statusCode: 410 });
      }
      return { statusCode: 201 };
    });

    await enviarPushDaNotificacao(notifOrcamento());

    expect(mocks.webpush.sendNotification).toHaveBeenCalledTimes(2);
    expect(mocks.prisma.pushSubscription.delete).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.pushSubscription.delete).toHaveBeenCalledWith({
      where: { endpoint: 'https://push.example/morta' },
    });
  });

  it('erro de rede não propaga nem apaga a assinatura', async () => {
    ligarPush();
    mocks.webpush.sendNotification.mockRejectedValue(new Error('ECONNRESET'));
    await expect(enviarPushDaNotificacao(notifOrcamento())).resolves.toBeUndefined();
    expect(mocks.prisma.pushSubscription.delete).not.toHaveBeenCalled();
  });

  it('falha do banco não propaga (best-effort de verdade)', async () => {
    ligarPush();
    mocks.prisma.pushSubscription.findMany.mockRejectedValue(new Error('db down'));
    await expect(enviarPushDaNotificacao(notifOrcamento())).resolves.toBeUndefined();
  });
});
