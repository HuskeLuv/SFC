import { describe, it, expect } from 'vitest';
import {
  calcularContinuar,
  formatDuracaoCurta,
  resumirModulo,
  type TrilhaAulaInput,
  type TrilhaModuloInput,
} from '../educacaoTrilha';

const aula = (id: string, over: Partial<TrilhaAulaInput> = {}): TrilhaAulaInput => ({
  id,
  title: `Aula ${id}`,
  durationSeconds: 600,
  requiredLevel: 0,
  bloqueada: false,
  concluida: false,
  ultimaInteracao: null,
  ...over,
});

const modulo = (id: string, aulas: TrilhaAulaInput[]): TrilhaModuloInput => ({
  id,
  title: `Módulo ${id}`,
  description: null,
  coverUrl: null,
  aulas,
});

describe('resumirModulo', () => {
  it('soma duração, conta concluídas e classifica não iniciado', () => {
    const r = resumirModulo(modulo('m1', [aula('a'), aula('b', { durationSeconds: null })]));
    expect(r).toMatchObject({
      totalAulas: 2,
      aulasConcluidas: 0,
      progresso: 0,
      duracaoSegundos: 600,
      status: 'nao_iniciado',
    });
  });

  it('em andamento quando há aula concluída ou interação sem conclusão', () => {
    expect(resumirModulo(modulo('m1', [aula('a', { concluida: true }), aula('b')])).status).toBe(
      'em_andamento',
    );
    expect(
      resumirModulo(modulo('m1', [aula('a', { ultimaInteracao: new Date() }), aula('b')])).status,
    ).toBe('em_andamento');
  });

  it('concluído quando todas as aulas estão concluídas; módulo vazio nunca é concluído', () => {
    expect(
      resumirModulo(modulo('m1', [aula('a', { concluida: true }), aula('b', { concluida: true })])),
    ).toMatchObject({ status: 'concluido', progresso: 100 });
    expect(resumirModulo(modulo('m1', [])).status).toBe('nao_iniciado');
  });
});

describe('calcularContinuar', () => {
  it('sem interação: primeira aula pendente do curso', () => {
    const r = calcularContinuar([
      modulo('m1', [aula('a', { concluida: true }), aula('b')]),
      modulo('m2', [aula('c')]),
    ]);
    expect(r).toMatchObject({
      moduloId: 'm1',
      aulaId: 'b',
      aulaIndex: 2,
      totalAulasModulo: 2,
      progressoModulo: 50,
      restanteSegundos: 600,
    });
  });

  it('retoma no módulo da última interação, mesmo que não seja o primeiro pendente', () => {
    const r = calcularContinuar([
      modulo('m1', [aula('a')]),
      modulo('m2', [
        aula('b', { concluida: true, ultimaInteracao: new Date('2026-08-24') }),
        aula('c'),
      ]),
    ]);
    expect(r?.moduloId).toBe('m2');
    expect(r?.aulaId).toBe('c');
  });

  it('módulo da última interação concluído → cai pra próxima pendente na ordem', () => {
    const r = calcularContinuar([
      modulo('m1', [aula('a')]),
      modulo('m2', [aula('b', { concluida: true, ultimaInteracao: new Date('2026-08-24') })]),
    ]);
    expect(r?.moduloId).toBe('m1');
  });

  it('ignora aulas bloqueadas e devolve null quando nada resta', () => {
    expect(calcularContinuar([modulo('m1', [aula('a', { bloqueada: true })])])).toBeNull();
    expect(calcularContinuar([modulo('m1', [aula('a', { concluida: true })])])).toBeNull();
    expect(calcularContinuar([])).toBeNull();
  });
});

describe('formatDuracaoCurta', () => {
  it('formata minutos e horas', () => {
    expect(formatDuracaoCurta(0)).toBeNull();
    expect(formatDuracaoCurta(48 * 60)).toBe('48 min');
    expect(formatDuracaoCurta(70 * 60)).toBe('1h 10min');
    expect(formatDuracaoCurta(120 * 60)).toBe('2h');
  });
});
