// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SignInForm from '../SignInForm';

// Mock next/navigation
const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

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

describe('SignInForm', () => {
  let mockLocationAssign: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLocationAssign = vi.fn();
    vi.stubGlobal('fetch', vi.fn());
    Object.defineProperty(window, 'location', {
      value: { assign: mockLocationAssign },
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders email and password inputs', () => {
    render(<SignInForm />);
    expect(screen.getByPlaceholderText('Digite seu email')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Digite sua senha')).toBeInTheDocument();
  });

  it('shows validation error when submitting empty form', async () => {
    render(<SignInForm />);
    const submitButton = screen.getByRole('button', { name: 'Entrar' });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Preencha todos os campos obrigatórios.')).toBeInTheDocument();
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('toggles password visibility when clicking eye icon', () => {
    render(<SignInForm />);
    const passwordInput = screen.getByPlaceholderText('Digite sua senha');
    expect(passwordInput).toHaveAttribute('type', 'password');

    // Initially shows EyeCloseIcon (password hidden)
    expect(screen.getByTestId('eye-close-icon')).toBeInTheDocument();

    // Click the toggle span (parent of the icon)
    fireEvent.click(screen.getByTestId('eye-close-icon').closest('span')!);

    expect(passwordInput).toHaveAttribute('type', 'text');
    expect(screen.getByTestId('eye-icon')).toBeInTheDocument();
  });

  it('toggles remember me checkbox', () => {
    render(<SignInForm />);
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();

    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  it('calls fetch with correct body on successful login', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ user: { role: 'user' } }),
    });
    vi.stubGlobal('fetch', mockFetch);

    render(<SignInForm />);
    fireEvent.change(screen.getByPlaceholderText('Digite seu email'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Digite sua senha'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        cache: 'no-store',
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password123',
          rememberMe: false,
        }),
      });
    });
  });

  it('shows error message from API response on failed login', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Credenciais inválidas' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    render(<SignInForm />);
    fireEvent.change(screen.getByPlaceholderText('Digite seu email'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Digite sua senha'), {
      target: { value: 'wrong' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => {
      expect(screen.getByText('Credenciais inválidas')).toBeInTheDocument();
    });
  });

  it('shows loading state during submission', async () => {
    let resolveLogin: (value: unknown) => void;
    const loginPromise = new Promise((resolve) => {
      resolveLogin = resolve;
    });
    const mockFetch = vi.fn().mockReturnValue(loginPromise);
    vi.stubGlobal('fetch', mockFetch);

    render(<SignInForm />);
    fireEvent.change(screen.getByPlaceholderText('Digite seu email'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Digite sua senha'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Entrando...' })).toBeDisabled();
    });

    // Resolve to clean up
    resolveLogin!({
      ok: true,
      json: () => Promise.resolve({ user: { role: 'user' } }),
    });
  });

  it('redirects consultant to /dashboard/consultor', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ user: { role: 'consultant' } }),
    });
    vi.stubGlobal('fetch', mockFetch);

    render(<SignInForm />);
    fireEvent.change(screen.getByPlaceholderText('Digite seu email'), {
      target: { value: 'consultant@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Digite sua senha'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => {
      expect(mockLocationAssign).toHaveBeenCalledWith('/dashboard/consultor');
    });
  });

  it('redirects regular user to /carteira', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ user: { role: 'user' } }),
    });
    vi.stubGlobal('fetch', mockFetch);

    render(<SignInForm />);
    fireEvent.change(screen.getByPlaceholderText('Digite seu email'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Digite sua senha'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => {
      expect(mockLocationAssign).toHaveBeenCalledWith('/carteira');
    });
  });

  it('shows generic error on network failure', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('fetch', mockFetch);

    render(<SignInForm />);
    fireEvent.change(screen.getByPlaceholderText('Digite seu email'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Digite sua senha'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => {
      expect(screen.getByText('Erro ao entrar. Tente novamente.')).toBeInTheDocument();
    });
  });
});
