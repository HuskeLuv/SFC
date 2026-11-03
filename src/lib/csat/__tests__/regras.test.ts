import { describe, it, expect } from 'vitest';
import { avaliarExibicaoCsat, type CsatFatos } from '../regras';

const AGORA = new Date('2026-11-03T15:00:00.000Z');
const diasAtras = (d: number) => new Date(AGORA.getTime() - d * 86_400_000);

const base = (over: Partial<CsatFatos> = {}): CsatFatos => ({
  agora: AGORA,
  role: 'user',
  email: 'cliente@gmail.com',
  personificando: false,
  cadastradoEm: diasAtras(60),
  ultimoAcesso: AGORA,
  eventos: [],
  ...over,
});

describe('avaliarExibicaoCsat', () => {
  it('cliente ativo que nunca respondeu vê a pesquisa', () => {
    expect(avaliarExibicaoCsat(base())).toEqual({ mostrar: true, motivo: 'elegivel' });
  });

  it('nunca com consultor agindo por cliente', () => {
    expect(avaliarExibicaoCsat(base({ personificando: true }))).toMatchObject({
      mostrar: false,
      motivo: 'personificacao',
    });
  });

  it('nunca para admin', () => {
    expect(avaliarExibicaoCsat(base({ role: 'admin' })).mostrar).toBe(false);
  });

  it('contas de seed/e2e (@finapp.local) nunca veem', () => {
    expect(avaliarExibicaoCsat(base({ email: 'Usuario.Demo@finapp.local' }))).toMatchObject({
      mostrar: false,
      motivo: 'conta_teste',
    });
  });

  it('consultor (fora de personificação) é cliente e pode responder', () => {
    expect(avaliarExibicaoCsat(base({ role: 'consultant' })).mostrar).toBe(true);
  });

  it('cadastro com menos de 14 dias não vê (usuário do seed/e2e cai aqui)', () => {
    expect(avaliarExibicaoCsat(base({ cadastradoEm: diasAtras(13.9) }))).toMatchObject({
      mostrar: false,
      motivo: 'cadastro_recente',
    });
    expect(avaliarExibicaoCsat(base({ cadastradoEm: diasAtras(14) })).mostrar).toBe(true);
  });

  it('sem acesso nos últimos 30 dias não vê', () => {
    expect(avaliarExibicaoCsat(base({ ultimoAcesso: diasAtras(31) })).motivo).toBe(
      'sem_acesso_recente',
    );
    expect(avaliarExibicaoCsat(base({ ultimoAcesso: null })).mostrar).toBe(false);
  });

  it('nota 1–4: no máximo 1 vez a cada 30 dias', () => {
    const r = avaliarExibicaoCsat(base({ eventos: [{ nota: 4, createdAt: diasAtras(29) }] }));
    expect(r).toMatchObject({ mostrar: false, motivo: 'respondeu_recentemente' });
    expect(r.proximaEm).toEqual(diasAtras(-1));
    expect(
      avaliarExibicaoCsat(base({ eventos: [{ nota: 3, createdAt: diasAtras(30) }] })).mostrar,
    ).toBe(true);
  });

  it('promotor (nota 5): só a cada 60 dias', () => {
    expect(
      avaliarExibicaoCsat(base({ eventos: [{ nota: 5, createdAt: diasAtras(45) }] })).mostrar,
    ).toBe(false);
    expect(
      avaliarExibicaoCsat(base({ eventos: [{ nota: 5, createdAt: diasAtras(60) }] })).mostrar,
    ).toBe(true);
  });

  it('vale a ÚLTIMA resposta (ordem dos eventos não importa)', () => {
    const eventos = [
      { nota: 2, createdAt: diasAtras(35) },
      { nota: 5, createdAt: diasAtras(40) },
    ];
    // última foi nota 2 há 35 dias → já passou o mês
    expect(avaliarExibicaoCsat(base({ eventos })).mostrar).toBe(true);
  });

  it('"Agora não" adia 7 dias', () => {
    expect(
      avaliarExibicaoCsat(base({ eventos: [{ nota: null, createdAt: diasAtras(6) }] })),
    ).toMatchObject({ mostrar: false, motivo: 'adiado' });
    expect(
      avaliarExibicaoCsat(base({ eventos: [{ nota: null, createdAt: diasAtras(7) }] })).mostrar,
    ).toBe(true);
  });

  it('3 "Agora não" seguidos: próxima pergunta só em 30 dias', () => {
    const eventos = [
      { nota: null, createdAt: diasAtras(10) },
      { nota: null, createdAt: diasAtras(20) },
      { nota: null, createdAt: diasAtras(30) },
    ];
    expect(avaliarExibicaoCsat(base({ eventos })).motivo).toBe('adiado');
    expect(
      avaliarExibicaoCsat(
        base({ eventos: eventos.map((e) => ({ ...e, createdAt: diasAtras(31) })) }),
      ).mostrar,
    ).toBe(true);
  });

  it('"Agora não" anteriores à última resposta não contam', () => {
    const eventos = [
      { nota: 4, createdAt: diasAtras(40) },
      { nota: null, createdAt: diasAtras(50) },
      { nota: null, createdAt: diasAtras(55) },
      { nota: null, createdAt: diasAtras(58) },
    ];
    expect(avaliarExibicaoCsat(base({ eventos })).mostrar).toBe(true);
  });

  it('adiamento depois da resposta só vale depois do intervalo da resposta', () => {
    const eventos = [
      { nota: null, createdAt: diasAtras(3) },
      { nota: 4, createdAt: diasAtras(40) },
    ];
    expect(avaliarExibicaoCsat(base({ eventos })).motivo).toBe('adiado');
  });
});
