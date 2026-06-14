// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SignUpForm from '../SignUpForm';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock icons
vi.mock('@/icons', () => ({
  ChevronLeftIcon: () => <svg data-testid="chevron-left-icon" />,
  EyeIcon: () => <svg data-testid="eye-icon" />,
  EyeCloseIcon: () => <svg data-testid="eye-close-icon" />,
}));

describe('SignUpForm', () => {
  it('exibe o painel de indisponível e NÃO renderiza o form quando registrationDisabled', () => {
    render(<SignUpForm registrationDisabled />);

    expect(screen.getByText('Cadastro temporariamente indisponível')).toBeInTheDocument();
    // Sem campos do formulário nem botão de registrar.
    expect(screen.queryByPlaceholderText('Digite seu email')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Registre-se/i })).not.toBeInTheDocument();
    // Mantém o caminho de login.
    expect(screen.getByRole('link', { name: 'Entrar' })).toBeInTheDocument();
  });

  it('renderiza o formulário normalmente quando cadastro está liberado', () => {
    render(<SignUpForm registrationDisabled={false} />);

    expect(screen.queryByText('Cadastro temporariamente indisponível')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Digite seu email')).toBeInTheDocument();
  });

  it('libera o cadastro por padrão (prop ausente)', () => {
    render(<SignUpForm />);
    expect(screen.getByPlaceholderText('Digite seu email')).toBeInTheDocument();
  });
});
