// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AssetNameLink from '../AssetNameLink';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: React.ComponentProps<'a'>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe('AssetNameLink (nome simplificado nas abas da carteira)', () => {
  it('ação: mostra só o ticker numa linha, razão social no hover', () => {
    render(<AssetNameLink portfolioId="p1" ticker="ITSA4" nome="ITAUSA S.A." />);
    const link = screen.getByRole('link');
    expect(link).toHaveTextContent(/^ITSA4$/);
    expect(link).toHaveAttribute('title', 'ITSA4 — ITAUSA S.A.');
    expect(link).toHaveAttribute('href', '/ativos/p1');
  });

  it('nome igual ao ticker: sem tooltip redundante', () => {
    render(<AssetNameLink portfolioId="p1" ticker="HGLG11" nome="HGLG11" />);
    const link = screen.getByRole('link');
    expect(link).toHaveTextContent(/^HGLG11$/);
    expect(link).not.toHaveAttribute('title');
  });

  it('ativo manual (nomeComoPrincipal): tira o sufixo "- R$ valor - data"', () => {
    render(
      <AssetNameLink
        portfolioId="p2"
        ticker="Tesouro Selic 2030 - R$ 2.000 - 31/05/2026"
        nomeComoPrincipal
      />,
    );
    const link = screen.getByRole('link');
    expect(link).toHaveTextContent(/^Tesouro Selic 2030$/);
    expect(link).toHaveAttribute('title', 'Tesouro Selic 2030 - R$ 2.000 - 31/05/2026');
  });

  it('fundo: nome simplificado como rótulo; categoria só no hover', () => {
    render(
      <AssetNameLink
        portfolioId="p3"
        ticker="Multimercado • Macro"
        nome="Fundo XP Macro - R$ 5.000 - 01/06/2026"
        nomeComoPrincipal
      />,
    );
    const link = screen.getByRole('link');
    expect(link).toHaveTextContent(/^Fundo XP Macro$/);
    expect(link).toHaveAttribute(
      'title',
      'Multimercado • Macro — Fundo XP Macro - R$ 5.000 - 01/06/2026',
    );
  });
});
