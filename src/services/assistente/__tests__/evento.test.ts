import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  recordChange: vi.fn(),
  invalidarContextoUsuario: vi.fn(),
  prisma: { event: { create: vi.fn() } },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }));
vi.mock('@/services/changeHistory', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/services/changeHistory')>();
  return { ...orig, recordChange: mocks.recordChange };
});
vi.mock('../contexto', () => ({ invalidarContextoUsuario: mocks.invalidarContextoUsuario }));

import {
  aplicarPropostaEvento,
  montarPropostaEvento,
  verificarPropostaEvento,
  type PropostaEvento,
} from '../evento';
import { assinarProposta, type Proposta } from '../lancamento';

process.env.ASSISTENTE_SECRET ??= 'segredo-de-teste';

const HOJE = new Date('2026-09-18T12:00:00Z');
const auth = {
  payload: { id: 'u1', email: 'u@t.com', role: 'user' },
  targetUserId: 'u1',
  actingClient: null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;
const request = {} as NextRequest;

beforeEach(() => vi.clearAllMocks());

const montar = (over: Record<string, unknown> = {}) =>
  montarPropostaEvento(
    'u1',
    'msg-1',
    { titulo: 'Pagar o IPVA', data: '2026-10-10', ...over },
    { hoje: HOJE },
  );

describe('montarPropostaEvento', () => {
  it('monta a proposta com os defaults (categoria pessoal, sem recorrência)', () => {
    const r = montar();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.proposta.titulo).toBe('Pagar o IPVA');
    expect(r.proposta.data).toBe('2026-10-10');
    expect(r.proposta.categoria).toBe('pessoal');
    expect(r.proposta.recorrencia).toBe('nenhuma');
    expect(r.proposta.lembrete).toBe(false);
    expect(r.proposta.expiraEm).toBeGreaterThan(Date.now());
  });

  it('aceita categoria, recorrência, hora e período', () => {
    const r = montar({
      categoria: 'pagamento',
      recorrencia: 'anual',
      hora: '09:30',
      dataFim: '2026-10-12',
      descricao: 'Cota única',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.proposta.categoria).toBe('pagamento');
    expect(r.proposta.recorrencia).toBe('anual');
    expect(r.proposta.hora).toBe('09:30');
    expect(r.proposta.dataFim).toBe('2026-10-12');
    expect(r.proposta.descricao).toBe('Cota única');
  });

  it('categoria e recorrência inventadas caem no padrão', () => {
    const r = montar({ categoria: 'banana', recorrencia: 'semanal' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.proposta.categoria).toBe('pessoal');
    expect(r.proposta.recorrencia).toBe('nenhuma');
  });

  it('dataFim igual à data não vira evento de vários dias', () => {
    const r = montar({ dataFim: '2026-10-10' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.proposta.dataFim).toBeNull();
  });

  it.each([
    [{ titulo: '  ' }, /título/i],
    [{ data: '10/10/2026' }, /data/i],
    [{ data: '2026-13-40' }, /data/i],
    [{ data: '2035-01-01' }, /janela/i],
    [{ data: '2020-01-01' }, /janela/i],
    [{ dataFim: '2026-10-09' }, /antes/i],
    [{ hora: '9h' }, /HH:MM/],
  ])('rejeita entrada inválida (%o)', (over, esperado) => {
    const r = montar(over);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toMatch(esperado);
  });
});

describe('verificarPropostaEvento', () => {
  it('ida e volta com a assinatura', () => {
    const r = montar();
    if (!r.ok) throw new Error('proposta não montou');
    expect(verificarPropostaEvento(r.token, 'u1')?.titulo).toBe('Pagar o IPVA');
  });

  it('recusa token de outro usuário, adulterado ou expirado', () => {
    const r = montar();
    if (!r.ok) throw new Error('proposta não montou');
    expect(verificarPropostaEvento(r.token, 'outro')).toBeNull();
    expect(verificarPropostaEvento(`${r.token}x`, 'u1')).toBeNull();

    const expirada: PropostaEvento = { ...r.proposta, expiraEm: Date.now() - 1 };
    const payload = Buffer.from(JSON.stringify(expirada), 'utf8').toString('base64url');
    expect(verificarPropostaEvento(`${payload}.${r.token.split('.')[1]}`, 'u1')).toBeNull();
  });

  it('recusa token de LANÇAMENTO assinado com a mesma chave', () => {
    const lancamento = {
      id: 'p1',
      mensagemId: 'm1',
      userId: 'u1',
      itemId: 'i1',
      itemNome: 'Supermercado',
      grupoNome: 'Habitação',
      tipo: 'despesa',
      valor: 100,
      ano: 2026,
      descricao: null,
      modo: 'somar',
      celulas: [{ mes: 8, valorAtual: 0, valorNovo: 100 }],
      expiraEm: Date.now() + 60_000,
    } as Proposta;
    expect(verificarPropostaEvento(assinarProposta(lancamento), 'u1')).toBeNull();
  });
});

describe('aplicarPropostaEvento', () => {
  it('grava o evento, registra no histórico e invalida o contexto', async () => {
    const r = montar({ categoria: 'pagamento', hora: '09:30' });
    if (!r.ok) throw new Error('proposta não montou');
    mocks.prisma.event.create.mockResolvedValue({
      id: 'ev-1',
      userId: 'u1',
      title: 'Pagar o IPVA',
      description: null,
      date: new Date(Date.UTC(2026, 9, 10)),
      endDate: null,
      hora: '09:30',
      categoria: 'pagamento',
      recorrencia: 'nenhuma',
      lembrete: false,
      createdAt: new Date('2026-09-18T12:00:00Z'),
      updatedAt: new Date('2026-09-18T12:00:00Z'),
    });

    const dto = await aplicarPropostaEvento(auth, request, r.proposta);

    expect(mocks.prisma.event.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'u1', title: 'Pagar o IPVA', hora: '09:30' }),
      }),
    );
    expect(dto).toMatchObject({ id: 'ev-1', titulo: 'Pagar o IPVA', data: '2026-10-10' });
    expect(mocks.recordChange).toHaveBeenCalledWith(
      expect.objectContaining({
        section: 'calendario',
        action: 'evento.criar',
        entityLabel: 'Pagar o IPVA (assistente)',
      }),
    );
    expect(mocks.invalidarContextoUsuario).toHaveBeenCalledWith('u1');
  });
});
