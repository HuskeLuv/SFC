import { describe, expect, it } from 'vitest';
import type { EventoAgenda, TipoEvento } from '@/services/calendario/types';
import { periodoProximosDias, proximosEventos, resumoDoPeriodo } from '../agendaResumo';

const TODOS: Set<TipoEvento> = new Set([
  'manual',
  'divida',
  'provento',
  'rf',
  'ir',
  'planejamento',
  'mercado',
]);

const ev = (over: Partial<EventoAgenda> & { tipo: TipoEvento; data: string }): EventoAgenda => ({
  id: `${over.tipo}:${over.data}:${over.titulo ?? ''}`,
  titulo: 'Evento',
  dataFim: null,
  hora: null,
  valor: null,
  descricao: null,
  link: null,
  detalhe: {},
  ...over,
});

const eventos: EventoAgenda[] = [
  ev({ tipo: 'divida', data: '2026-09-05', valor: 1000, detalhe: { paga: false } }),
  ev({ tipo: 'divida', data: '2026-09-10', valor: 500, detalhe: { paga: true } }),
  ev({ tipo: 'provento', data: '2026-09-12', valor: 300, detalhe: { evento: 'pagamento' } }),
  // Data-com não movimenta dinheiro.
  ev({ tipo: 'provento', data: '2026-09-02', valor: null, detalhe: { evento: 'data-com' } }),
  ev({ tipo: 'rf', data: '2026-09-20', valor: 10000 }),
  ev({ tipo: 'ir', data: '2026-09-30', valor: 200, detalhe: { evento: 'darf' } }),
  // Declaração não tem valor — não entra na soma de impostos.
  ev({ tipo: 'ir', data: '2026-09-29', valor: null, detalhe: { evento: 'declaracao' } }),
  ev({ tipo: 'manual', data: '2026-09-15' }),
];

describe('resumoDoPeriodo', () => {
  it('separa a pagar, a receber, vencimentos, impostos e já pago', () => {
    const r = resumoDoPeriodo(eventos, TODOS);
    expect(r.aPagar).toEqual({ total: 1000, itens: 1 });
    expect(r.jaPago).toEqual({ total: 500, itens: 1 });
    expect(r.aReceber).toEqual({ total: 300, itens: 1 });
    expect(r.vencimentosRf).toEqual({ total: 10000, itens: 1 });
    expect(r.impostos).toEqual({ total: 200, itens: 1 });
  });

  it('ignora tipo desmarcado no filtro da lateral', () => {
    const r = resumoDoPeriodo(eventos, new Set<TipoEvento>(['provento']));
    expect(r.aReceber.total).toBe(300);
    expect(r.aPagar).toEqual({ total: 0, itens: 0 });
    expect(r.vencimentosRf).toEqual({ total: 0, itens: 0 });
  });

  it('período sem eventos devolve tudo zerado', () => {
    const r = resumoDoPeriodo([], TODOS);
    expect(Object.values(r).every((v) => v.total === 0 && v.itens === 0)).toBe(true);
  });
});

describe('proximosEventos', () => {
  it('corta o que já passou e a parcela paga', () => {
    const out = proximosEventos(eventos, TODOS, 8, '2026-09-10');
    expect(out.map((e) => e.data)).toEqual([
      '2026-09-12',
      '2026-09-20',
      '2026-09-30',
      '2026-09-29',
      '2026-09-15',
    ]);
    // A parcela de 10/09 está paga — não é lembrete de nada.
    expect(out.some((e) => e.detalhe.paga === true)).toBe(false);
  });

  it('respeita o limite', () => {
    expect(proximosEventos(eventos, TODOS, 2, '2026-09-01')).toHaveLength(2);
  });
});

describe('periodoProximosDias', () => {
  it('vai de hoje até hoje + N dias', () => {
    // 2026-09-18 12:00 UTC → dia civil BR ainda é 18/09.
    const p = periodoProximosDias(30, new Date('2026-09-18T12:00:00Z'));
    expect(p).toEqual({ de: '2026-09-18', ate: '2026-10-18' });
  });

  it('atravessa a virada do ano', () => {
    const p = periodoProximosDias(30, new Date('2026-12-20T12:00:00Z'));
    expect(p).toEqual({ de: '2026-12-20', ate: '2027-01-19' });
  });
});
