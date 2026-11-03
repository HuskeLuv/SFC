// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import PerguntasFrequentes from '../PerguntasFrequentes';
import { EMAIL_SUPORTE, FAQ } from '@/content/faq';

const PERGUNTA_OPEN_FINANCE =
  'Se eu lançar no fluxo de caixa errado, consigo editar o lançamento feito do Open Finance?';

describe('PerguntasFrequentes', () => {
  it('lista todas as perguntas fechadas e o contato do suporte', () => {
    render(<PerguntasFrequentes />);
    for (const item of FAQ) {
      const botao = screen.getByRole('button', { name: item.pergunta });
      expect(botao.getAttribute('aria-expanded')).toBe('false');
    }
    expect(screen.getByRole('link', { name: EMAIL_SUPORTE }).getAttribute('href')).toBe(
      `mailto:${EMAIL_SUPORTE}`,
    );
  });

  it('abre e fecha a resposta ao clicar na pergunta', () => {
    render(<PerguntasFrequentes />);
    const botao = screen.getByRole('button', { name: PERGUNTA_OPEN_FINANCE });
    const painel = document.getElementById(botao.getAttribute('aria-controls') ?? '');
    expect(painel?.hidden).toBe(true);

    fireEvent.click(botao);
    expect(botao.getAttribute('aria-expanded')).toBe('true');
    expect(painel?.hidden).toBe(false);
    expect(screen.getByText(/no fluxo · tirar/)).toBeTruthy();

    fireEvent.click(botao);
    expect(botao.getAttribute('aria-expanded')).toBe('false');
    expect(painel?.hidden).toBe(true);
  });

  it('ids das perguntas são únicos (viram âncora /ajuda#id)', () => {
    const ids = FAQ.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
