import { describe, expect, it, vi } from 'vitest';

// O contrato importa as constantes dos serviços reais, que puxam o prisma —
// mock para o teste não depender de DATABASE_URL.
vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }));

import { ORCAMENTO_ALERTA_TYPE } from '@/services/cashflow/orcamentoAlertas';
import { AGENDA_LEMBRETE_TYPE } from '@/services/calendario/lembretes';
import {
  COMUNIDADE_COMENTARIO_TYPE,
  COMUNIDADE_MODERACAO_TYPE,
} from '@/services/comunidade/notificacoes';
import {
  CATEGORIA_POR_TYPE,
  CONSULTANT_INVITE_RESPONSE_TYPE,
  CONSULTANT_INVITE_TYPE,
  TTL_SEGUNDOS_POR_CATEGORIA,
  categoriaDaNotificacao,
  corpoGenerico,
  deepLinkDaNotificacao,
  tagDaNotificacao,
  type CategoriaPush,
} from '../contract';

describe('CATEGORIA_POR_TYPE', () => {
  it('mapeia os types das constantes reais dos serviços', () => {
    expect(categoriaDaNotificacao(ORCAMENTO_ALERTA_TYPE)).toBe('orcamento');
    expect(categoriaDaNotificacao(AGENDA_LEMBRETE_TYPE)).toBe('agenda');
    expect(categoriaDaNotificacao(COMUNIDADE_COMENTARIO_TYPE)).toBe('comunidade');
    expect(categoriaDaNotificacao(COMUNIDADE_MODERACAO_TYPE)).toBe('comunidade');
    expect(categoriaDaNotificacao(CONSULTANT_INVITE_TYPE)).toBe('conta');
    expect(categoriaDaNotificacao(CONSULTANT_INVITE_RESPONSE_TYPE)).toBe('conta');
  });

  it('os types literais dos convites batem com as rotas de consultant', () => {
    expect(CONSULTANT_INVITE_TYPE).toBe('consultant_invite');
    expect(CONSULTANT_INVITE_RESPONSE_TYPE).toBe('consultant_invite_response');
  });

  it('type desconhecido não envia (null)', () => {
    expect(categoriaDaNotificacao('type_que_nao_existe')).toBeNull();
    expect(CATEGORIA_POR_TYPE['type_que_nao_existe']).toBeUndefined();
  });
});

describe('TTL_SEGUNDOS_POR_CATEGORIA', () => {
  it('orçamento/comunidade 24h, agenda 12h e conta 7 DIAS (decisão do Wellington)', () => {
    expect(TTL_SEGUNDOS_POR_CATEGORIA.orcamento).toBe(24 * 60 * 60);
    expect(TTL_SEGUNDOS_POR_CATEGORIA.agenda).toBe(12 * 60 * 60);
    expect(TTL_SEGUNDOS_POR_CATEGORIA.comunidade).toBe(24 * 60 * 60);
    expect(TTL_SEGUNDOS_POR_CATEGORIA.conta).toBe(7 * 24 * 60 * 60);
  });
});

describe('corpoGenerico', () => {
  it('nunca embute valores (sem R$) em nenhuma categoria', () => {
    const categorias: CategoriaPush[] = ['orcamento', 'agenda', 'comunidade', 'conta'];
    for (const categoria of categorias) {
      const corpo = corpoGenerico(categoria);
      expect(corpo.length).toBeGreaterThan(0);
      expect(corpo).not.toMatch(/R\$/);
      expect(corpo).not.toMatch(/\d/);
    }
  });
});

describe('tagDaNotificacao', () => {
  it('escalada de rank do mesmo grupo do orçamento SUBSTITUI (mesma tag)', () => {
    const atencao = tagDaNotificacao(ORCAMENTO_ALERTA_TYPE, { groupId: 'g1', rank: 1 }, 'n1');
    const estourado = tagDaNotificacao(ORCAMENTO_ALERTA_TYPE, { groupId: 'g1', rank: 3 }, 'n2');
    expect(atencao).toBe('mf-orcamento-g1');
    expect(estourado).toBe(atencao);
  });

  it('grupos diferentes não colidem', () => {
    expect(tagDaNotificacao(ORCAMENTO_ALERTA_TYPE, { groupId: 'g1' }, 'n1')).not.toBe(
      tagDaNotificacao(ORCAMENTO_ALERTA_TYPE, { groupId: 'g2' }, 'n1'),
    );
  });

  it('agenda usa eventoId, comunidade usa postId, conta usa inviteId', () => {
    expect(
      tagDaNotificacao(AGENDA_LEMBRETE_TYPE, { eventoId: 'ev9', data: '2026-09-30' }, 'n1'),
    ).toBe('mf-agenda-ev9');
    expect(tagDaNotificacao(COMUNIDADE_COMENTARIO_TYPE, { postId: 'p7' }, 'n1')).toBe(
      'mf-comunidade-p7',
    );
    expect(tagDaNotificacao(CONSULTANT_INVITE_TYPE, { inviteId: 'i3' }, 'n1')).toBe('mf-conta-i3');
  });

  it('sem chave de grupo cai no notificationId', () => {
    expect(tagDaNotificacao(COMUNIDADE_MODERACAO_TYPE, { tipo: 'post' }, 'n42')).toBe(
      'mf-comunidade-n42',
    );
    expect(tagDaNotificacao(AGENDA_LEMBRETE_TYPE, null, 'n42')).toBe('mf-agenda-n42');
  });
});

describe('deepLinkDaNotificacao', () => {
  it('orçamento abre a aba Orçamento do Fluxo; agenda abre o Calendário', () => {
    expect(deepLinkDaNotificacao(ORCAMENTO_ALERTA_TYPE, { groupId: 'g1' })).toBe(
      '/fluxodecaixa?modo=orcamento',
    );
    expect(deepLinkDaNotificacao(AGENDA_LEMBRETE_TYPE, { eventoId: 'ev1' })).toBe('/calendario');
  });

  it('usa metadata.href relativo (comunidade)', () => {
    expect(deepLinkDaNotificacao(COMUNIDADE_COMENTARIO_TYPE, { href: '/comunidade/p7' })).toBe(
      '/comunidade/p7',
    );
  });

  it("rejeita '//evil' e URLs absolutas — same-origin apenas", () => {
    expect(deepLinkDaNotificacao(COMUNIDADE_COMENTARIO_TYPE, { href: '//evil.com/x' })).toBe('/');
    expect(deepLinkDaNotificacao(COMUNIDADE_COMENTARIO_TYPE, { href: 'https://evil.com/x' })).toBe(
      '/',
    );
    expect(deepLinkDaNotificacao(COMUNIDADE_COMENTARIO_TYPE, { href: 'javascript:alert(1)' })).toBe(
      '/',
    );
  });

  it('sem href válido cai no fallback /', () => {
    expect(deepLinkDaNotificacao(CONSULTANT_INVITE_TYPE, { inviteId: 'i1' })).toBe('/');
    expect(deepLinkDaNotificacao(COMUNIDADE_MODERACAO_TYPE, null)).toBe('/');
    expect(deepLinkDaNotificacao('type_que_nao_existe', undefined)).toBe('/');
  });
});
