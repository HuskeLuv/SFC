import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ default: { $queryRaw: vi.fn() } }));

import { faixaPorDias, montarPainelCs, type LinhaCsRaw } from '../cs';

const AGORA = new Date('2026-11-03T12:00:00Z');
const dia = (iso: string) => new Date(`${iso}T12:00:00Z`);

const linha = (over: Partial<LinhaCsRaw> = {}): LinhaCsRaw => ({
  id: 'u1',
  name: 'Cliente',
  email: 'c@example.com',
  role: 'user',
  createdAt: dia('2026-10-01'),
  accessLevel: 0,
  ultimo_login: null,
  ativos: 0,
  usa_fluxo: false,
  usa_orcamento: false,
  msg_mes: 0,
  open_finance: false,
  prim_carteira: null,
  prim_fluxo: null,
  prim_conexao: null,
  ult_carteira: null,
  ult_fluxo: null,
  ult_orcamento: null,
  ult_planejamento: null,
  ult_assistente: null,
  ult_conexoes: null,
  ...over,
});

describe('faixaPorDias', () => {
  it('classifica por dias sem acesso', () => {
    expect(faixaPorDias(null)).toBe('nunca');
    expect(faixaPorDias(0)).toBe('ativo');
    expect(faixaPorDias(7)).toBe('ativo');
    expect(faixaPorDias(8)).toBe('inativo7');
    expect(faixaPorDias(30)).toBe('inativo7');
    expect(faixaPorDias(31)).toBe('inativo30');
  });
});

describe('montarPainelCs', () => {
  it('ativação = a primeira entre carteira, fluxo e conexão', () => {
    const p = montarPainelCs(
      [
        linha({
          id: 'a',
          prim_carteira: dia('2026-10-10'),
          prim_fluxo: dia('2026-10-05'),
          prim_conexao: dia('2026-10-20'),
        }),
        linha({ id: 'b', prim_conexao: dia('2026-10-01') }),
        linha({ id: 'c' }),
      ],
      AGORA,
    );
    const [a, b, c] = p.clientes;
    expect(a.ativacao).toEqual({
      em: dia('2026-10-05').toISOString(),
      acao: 'fluxo',
      diasAteAtivar: 4,
    });
    expect(b.ativacao).toMatchObject({ acao: 'conexao', diasAteAtivar: 0 });
    expect(c.ativacao).toEqual({ em: null, acao: null, diasAteAtivar: null });
    expect(p.ativacao).toMatchObject({
      total: 3,
      ativados: 2,
      pctAtivados: 66.7,
      medianaDias: 2,
      mediaDias: 2,
      ativados7d: 0,
      porAcao: { carteira: 0, fluxo: 1, conexao: 1 },
    });
  });

  it('último acesso = maior entre login e uso; inatividade em faixas', () => {
    const p = montarPainelCs(
      [
        linha({ id: 'ativo', ultimo_login: dia('2026-10-01'), ult_fluxo: dia('2026-11-02') }),
        linha({ id: 'i7', ultimo_login: dia('2026-10-20') }),
        linha({ id: 'i30', ult_carteira: dia('2026-09-01') }),
        linha({ id: 'nunca' }),
      ],
      AGORA,
    );
    const porId = Object.fromEntries(p.clientes.map((c) => [c.id, c]));
    expect(porId.ativo.ultimoAcesso).toBe(dia('2026-11-02').toISOString());
    expect(porId.ativo.ultimaAtividade).toBe(dia('2026-11-02').toISOString());
    expect(porId.ativo.faixa).toBe('ativo');
    expect(porId.i7.faixa).toBe('inativo7');
    expect(porId.i30.faixa).toBe('inativo30');
    expect(porId.nunca.faixa).toBe('nunca');
    expect(p.engajamento).toMatchObject({
      ativos7d: 1,
      inativos7a30: 1,
      inativos30: 1,
      nuncaAcessaram: 1,
    });
    const fluxo = p.engajamento.porArea.find((x) => x.area === 'fluxo');
    expect(fluxo).toEqual({ area: 'fluxo', usuarios30d: 1, usuarios7d: 1 });
  });

  it('converte bigint e mantém só contagens/datas', () => {
    const p = montarPainelCs(
      [linha({ ativos: BigInt(12), msg_mes: BigInt(4), open_finance: null })],
      AGORA,
    );
    expect(p.clientes[0]).toMatchObject({
      ativosCarteira: 12,
      mensagensAssistenteMes: 4,
      openFinanceConectado: false,
    });
    expect(p.csat).toBeNull();
  });

  it('lista vazia não divide por zero', () => {
    const p = montarPainelCs([], AGORA);
    expect(p.ativacao).toMatchObject({ total: 0, ativados: 0, pctAtivados: 0, medianaDias: null });
  });
});
