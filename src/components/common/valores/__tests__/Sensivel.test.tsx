// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({ usePathname: () => '/historico-alteracoes' }));

import {
  ConteudoSensivel,
  Sensivel,
  TextoSensivel,
  ValorVisivel,
  renderSensivel,
} from '../Sensivel';
import { ValoresOcultosProvider } from '@/context/ValoresOcultosContext';
import {
  SENTINELAS,
  expectPilulas,
  expectSemValoresExpostos,
  renderComValoresOcultos,
} from '@/test/valoresOcultos';
import { formatBRL } from '@/utils/format';

const SALDO = formatBRL(SENTINELAS.saldo);

const Botao = () => (
  <button type="button">
    Saldo <Sensivel>{SALDO}</Sensivel>
  </button>
);

describe('<Sensivel> no modo visível (DOM e nome acessível idênticos aos de hoje)', () => {
  it('sem provider: renderiza o texto cru', () => {
    const { container } = render(<Botao />);
    expect(screen.getByRole('button', { name: `Saldo ${SALDO}` })).toBeInTheDocument();
    const botao = screen.getByRole('button');
    expect(botao.children).toHaveLength(0);
    expect(botao.textContent).toBe(`Saldo ${SALDO}`);
    expect(container).not.toHaveTextContent('valor oculto');
  });

  it('com o olho aberto: o mesmo DOM de sem provider', () => {
    const semProvider = render(<Botao />).container.innerHTML;
    const { container } = renderComValoresOcultos(<Botao />, { ocultos: false });
    expect(container.innerHTML).toBe(semProvider);
  });

  it('olho fechado numa rota NÃO coberta (sem cobertura local): nada muda', () => {
    const { container } = render(
      <ComValoresOcultosSemCobertura>
        <Botao />
      </ComValoresOcultosSemCobertura>,
    );
    expect(container.querySelector('.mf-sensivel')).toBeNull();
    expect(container.textContent).toBe(`Saldo ${SALDO}`);
  });
});

describe('<Sensivel> com o olho fechado', () => {
  it('estrutura: pílula, valor fora da árvore e "valor oculto" para leitor de tela', () => {
    const { container } = renderComValoresOcultos(<Botao />);
    const pilula = container.querySelector('.mf-sensivel')!;
    expect(pilula).toHaveAttribute('data-mf-sensivel');
    expect(pilula.querySelector('.mf-sensivel__valor')).toHaveAttribute('aria-hidden', 'true');
    expect(pilula.querySelector('.mf-sensivel__sr')).toHaveTextContent('valor oculto');
    expect(screen.getByRole('button', { name: 'Saldo valor oculto' })).toBeInTheDocument();
    expectPilulas(container, 1);
    expectSemValoresExpostos(container);
  });

  it('curto e className', () => {
    const { container } = renderComValoresOcultos(
      <Sensivel curto className="extra">
        7.777
      </Sensivel>,
    );
    expect(container.querySelector('.mf-sensivel')).toHaveClass(
      'mf-sensivel',
      'mf-sensivel--curto',
      'extra',
    );
  });

  it('<ValorVisivel> marca a exceção e não vira pílula', () => {
    const { container } = renderComValoresOcultos(<ValorVisivel>R$ 5,37</ValorVisivel>);
    expect(container.querySelector('[data-mf-valor-visivel]')).toHaveTextContent('R$ 5,37');
    expectPilulas(container, 0);
    expectSemValoresExpostos(container);
  });

  it('<TextoSensivel> esconde só os valores; % e texto ficam', () => {
    const { container } = renderComValoresOcultos(
      <p>
        <TextoSensivel texto={`Ganho ${SALDO} (+18,95%)`} />
      </p>,
    );
    expectPilulas(container, 1);
    expect(container).toHaveTextContent('Ganho');
    expect(container).toHaveTextContent('(+18,95%)');
    expectSemValoresExpostos(container);
  });

  it('<TextoSensivel> sem valor fica igual', () => {
    const { container } = renderComValoresOcultos(<TextoSensivel texto="12,5% a.a." />);
    expect(container.innerHTML).toBe('12,5% a.a.');
  });
});

describe('renderSensivel', () => {
  const casos = (modo: Parameters<typeof renderSensivel>[1], node: React.ReactNode) =>
    renderComValoresOcultos(<div>{renderSensivel(node, modo)}</div>).container;

  it("'sensivel' sempre esconde (mesmo sem R$)", () => {
    const c = casos('sensivel', '9.876.543,21');
    expectPilulas(c, 1);
    expectSemValoresExpostos(c);
  });

  it("'sensivel-curto' usa a pílula curta", () => {
    const c = casos('sensivel-curto', '7.777');
    expect(c.querySelector('.mf-sensivel--curto')).not.toBeNull();
    expectSemValoresExpostos(c);
  });

  it("'visivel' nunca esconde", () => {
    const c = casos('visivel', 'R$ 5,37');
    expectPilulas(c, 0);
    expect(c.querySelector('[data-mf-valor-visivel]')).toHaveTextContent('R$ 5,37');
  });

  it("'auto' esconde string com R$ e deixa o resto intacto", () => {
    expectPilulas(casos('auto', SALDO), 1);
    expectPilulas(casos('auto', '12,5%'), 0);
    expectPilulas(casos(undefined, <b>R$ 1,00</b>), 0);
    expect(casos('auto', 42).textContent).toBe('42');
  });

  it('<ConteudoSensivel> é o mesmo que renderSensivel', () => {
    const { container } = renderComValoresOcultos(<ConteudoSensivel>{SALDO}</ConteudoSensivel>);
    expectPilulas(container, 1);
  });
});

describe('expectSemValoresExpostos (o próprio helper)', () => {
  it('acusa sentinela sem R$ e valor em title', () => {
    const qtd = render(<span>7.777 cotas</span>).container;
    expect(() => expectSemValoresExpostos(qtd)).toThrow();
    const titulo = render(<span title={SALDO}>x</span>).container;
    expect(() => expectSemValoresExpostos(titulo)).toThrow();
  });
});

/** Olho fechado, mas sem cobertura local (a rota mockada, /historico-alteracoes, não é coberta). */
function ComValoresOcultosSemCobertura({ children }: { children: React.ReactNode }) {
  return (
    <ValoresOcultosProvider habilitado inicial>
      {children}
    </ValoresOcultosProvider>
  );
}
