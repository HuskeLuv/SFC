// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mockCsrfFetch = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useCsrf', () => ({ useCsrf: () => ({ csrfFetch: mockCsrfFetch }) }));

import PrivacyControls from '../PrivacyControls';

describe('PrivacyControls — troca de senha', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mostra os requisitos da senha e só libera o botão quando todos são atendidos', () => {
    render(<PrivacyControls user={{ id: 'u1' }} section="senha" />);
    const [atual, nova] = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[type="password"]'),
    );
    const botao = screen.getByRole('button', { name: 'Alterar senha' });
    expect(screen.getByText('Pelo menos uma letra maiúscula')).toBeInTheDocument();
    expect(screen.getByText('Pelo menos um símbolo', { exact: false })).toBeInTheDocument();

    fireEvent.change(atual, { target: { value: 'SenhaAtual#1' } });
    fireEvent.change(nova, { target: { value: 'abcdefgh' } });
    expect(botao).toBeDisabled();

    fireEvent.change(nova, { target: { value: 'Abcdefg#1' } });
    expect(botao).toBeEnabled();
  });
});
