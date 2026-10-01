import { describe, it, expect, vi } from 'vitest';
import {
  criarTecladoCarteira,
  ordemAlvosTeclado,
  proximoAlvoTeclado,
  type AlvoTeclado,
} from '../carteiraDndKeyboard';

const alvo = (id: string, kind: 'secao' | 'aba', top: number, left = 0): AlvoTeclado => ({
  id,
  kind,
  rect: { top, left },
});

describe('ordemAlvosTeclado', () => {
  it('seções de cima para baixo e depois as abas da bandeja da esquerda para a direita', () => {
    const ordem = ordemAlvosTeclado([
      alvo('aba:etfs', 'aba', 700, 500),
      alvo('secao:fiis:infra', 'secao', 600),
      alvo('aba:fimFia', 'aba', 700, 100),
      alvo('secao:fiis:fof', 'secao', 100),
      alvo('secao:fiis:tvm', 'secao', 300),
    ]);
    expect(ordem).toEqual([
      'secao:fiis:fof',
      'secao:fiis:tvm',
      'secao:fiis:infra',
      'aba:fimFia',
      'aba:etfs',
    ]);
  });
});

describe('proximoAlvoTeclado', () => {
  const ordem = ['s1', 's2', 'a1'];

  it('seta para baixo/direita avança; para cima/esquerda volta', () => {
    expect(proximoAlvoTeclado(ordem, 's1', 'ArrowDown')).toBe('s2');
    expect(proximoAlvoTeclado(ordem, 's2', 'ArrowRight')).toBe('a1');
    expect(proximoAlvoTeclado(ordem, 'a1', 'ArrowUp')).toBe('s2');
    expect(proximoAlvoTeclado(ordem, 's2', 'ArrowLeft')).toBe('s1');
  });

  it('nas pontas fica onde está', () => {
    expect(proximoAlvoTeclado(ordem, 'a1', 'ArrowDown')).toBe('a1');
    expect(proximoAlvoTeclado(ordem, 's1', 'ArrowUp')).toBe('s1');
  });

  it('sem ponto de partida: começo (frente) ou fim (trás)', () => {
    expect(proximoAlvoTeclado(ordem, null, 'ArrowDown')).toBe('s1');
    expect(proximoAlvoTeclado(ordem, 'x', 'ArrowUp')).toBe('a1');
  });

  it('outra tecla ou lista vazia → null', () => {
    expect(proximoAlvoTeclado(ordem, 's1', 'KeyA')).toBeNull();
    expect(proximoAlvoTeclado([], null, 'ArrowDown')).toBeNull();
  });
});

describe('criarTecladoCarteira', () => {
  const rects = new Map<string, { top: number; left: number }>([
    ['secao:fiis:fof', { top: 100, left: 10 }],
    ['secao:fiis:tvm', { top: 300, left: 10 }],
    ['aba:fimFia', { top: 700, left: 200 }],
    ['nada', { top: 50, left: 10 }],
  ]);
  const containers = [
    { id: 'secao:fiis:fof', disabled: false, data: { current: { kind: 'secao' } } },
    { id: 'secao:fiis:tvm', disabled: false, data: { current: { kind: 'secao' } } },
    { id: 'aba:fimFia', disabled: false, data: { current: { kind: 'aba' } } },
    // Sem `kind` (outro droppable qualquer): fora da ordem.
    { id: 'nada', disabled: false, data: { current: {} } },
  ];
  const context = {
    active: { data: { current: { kind: 'linha', secaoDropId: 'secao:fiis:fof' } } },
    droppableContainers: { getEnabled: () => containers },
    droppableRects: rects,
  };
  const evento = (code: string) => ({ code, preventDefault: vi.fn() }) as unknown as KeyboardEvent;
  const chamar = (t: ReturnType<typeof criarTecladoCarteira>, code: string) =>
    t.coordinateGetter(evento(code), {
      active: 'linha:posicao:1',
      currentCoordinates: { x: 10, y: 120 },
      context: context as never,
    });

  it('parte da seção da própria linha e percorre seções e depois a bandeja', () => {
    const t = criarTecladoCarteira();
    expect(chamar(t, 'ArrowDown')).toEqual({ x: 11, y: 300 });
    expect(t.alvoAtual()).toBe('secao:fiis:tvm');
    expect(chamar(t, 'ArrowDown')).toEqual({ x: 200, y: 700 });
    expect(t.alvoAtual()).toBe('aba:fimFia');
    chamar(t, 'ArrowUp');
    expect(t.alvoAtual()).toBe('secao:fiis:tvm');
  });

  it('reset volta ao ponto de partida; tecla que não é seta não mexe', () => {
    const t = criarTecladoCarteira();
    chamar(t, 'ArrowDown');
    t.reset();
    expect(t.alvoAtual()).toBeNull();
    expect(chamar(t, 'KeyX')).toBeUndefined();
    expect(t.alvoAtual()).toBeNull();
  });
});
