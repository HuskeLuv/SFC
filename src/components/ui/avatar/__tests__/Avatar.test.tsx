// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import Avatar from '../Avatar';

describe('Avatar', () => {
  it('sem foto mostra as iniciais do nome', () => {
    render(<Avatar name="Usuário Demo" />);
    expect(screen.getByText('UD')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('foto de outro domínio usa <img> comum — não o otimizador do next/image', () => {
    // Regressão: next/image lança com host não configurado e o erro derrubava
    // a página inteira de Perfil.
    render(<Avatar src="https://exemplo.com/foto.png" name="Ana" alt="Avatar de Ana" />);
    const img = screen.getByAltText('Avatar de Ana');
    expect(img.getAttribute('src')).toBe('https://exemplo.com/foto.png');
    // O next/image reescreve o src para /_next/image?url=…
    expect(img.getAttribute('src')).not.toContain('/_next/image');
  });

  it('data:image também não passa pelo otimizador', () => {
    const data = 'data:image/png;base64,iVBORw0KGgo=';
    render(<Avatar src={data} name="Ana" alt="Avatar de Ana" />);
    expect(screen.getByAltText('Avatar de Ana').getAttribute('src')).toBe(data);
  });

  it('URL quebrada cai nas iniciais em vez do ícone de imagem partida', () => {
    render(<Avatar src="https://exemplo.com/nao-existe.png" name="Bruno Silva" />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByText('BS')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('arquivo do próprio app continua no next/image', () => {
    render(<Avatar src="/images/user/foto.jpg" name="Ana" alt="Avatar de Ana" />);
    expect(screen.getByAltText('Avatar de Ana').getAttribute('src')).toContain('/_next/image');
  });
});
