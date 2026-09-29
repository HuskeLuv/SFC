// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const toggleTheme = vi.fn();
vi.mock('@/context/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme }),
}));
// O mock acima cobre os DOIS caminhos de import (alias e relativo).
vi.mock('../../../context/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme }),
}));

import { ThemeToggleButton } from '../ThemeToggleButton';
import ThemeTogglerTwo from '../ThemeTogglerTwo';

describe('ThemeToggles — nome acessível (acabamento PWA fase 5)', () => {
  it('ThemeToggleButton tem aria-label e alterna o tema', () => {
    render(<ThemeToggleButton />);
    const botao = screen.getByRole('button', { name: 'Alternar tema claro/escuro' });
    fireEvent.click(botao);
    expect(toggleTheme).toHaveBeenCalled();
  });

  it('ThemeTogglerTwo tem o mesmo aria-label', () => {
    render(<ThemeTogglerTwo />);
    expect(screen.getByRole('button', { name: 'Alternar tema claro/escuro' })).toBeInTheDocument();
  });
});
