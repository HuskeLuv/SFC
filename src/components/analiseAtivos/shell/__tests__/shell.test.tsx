// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import BannerNovidade, {
  CHAVE_BANNER_DISPENSADO,
  LINK_SUPORTE,
  bannerDispensadoRecente,
} from '../BannerNovidade';
import RodapeLegal from '../RodapeLegal';
import { RODAPE_LEGAL } from '@/services/analiseAtivos/textosTela';

const DIA = 24 * 60 * 60 * 1000;

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('BannerNovidade', () => {
  it('aparece na primeira visita com o link do Suporte', () => {
    render(<BannerNovidade />);
    expect(screen.getByRole('region', { name: 'Aviso do beta' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Suporte' })).toHaveAttribute('href', LINK_SUPORTE);
    expect(screen.getByRole('button', { name: 'Entendi' })).toBeInTheDocument();
  });

  it('"Entendi" esconde e grava a data', () => {
    render(<BannerNovidade />);
    fireEvent.click(screen.getByRole('button', { name: 'Entendi' }));
    expect(screen.queryByRole('region', { name: 'Aviso do beta' })).toBeNull();
    expect(Number(window.localStorage.getItem(CHAVE_BANNER_DISPENSADO))).toBeGreaterThan(0);
  });

  it('dispensado não volta antes de 30 dias', () => {
    const agora = new Date('2026-10-02T12:00:00Z').getTime();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(agora);
    window.localStorage.setItem(CHAVE_BANNER_DISPENSADO, String(agora - 29 * DIA));
    render(<BannerNovidade />);
    expect(screen.queryByRole('region', { name: 'Aviso do beta' })).toBeNull();
    expect(bannerDispensadoRecente(agora)).toBe(true);
  });

  it('volta depois de 30 dias', () => {
    const agora = new Date('2026-10-02T12:00:00Z').getTime();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(agora);
    window.localStorage.setItem(CHAVE_BANNER_DISPENSADO, String(agora - 31 * DIA));
    render(<BannerNovidade />);
    expect(screen.getByRole('region', { name: 'Aviso do beta' })).toBeInTheDocument();
  });

  it('remontar depois de dispensar continua escondido', () => {
    const { unmount } = render(<BannerNovidade />);
    fireEvent.click(screen.getByRole('button', { name: 'Entendi' }));
    unmount();
    render(<BannerNovidade />);
    expect(screen.queryByRole('region', { name: 'Aviso do beta' })).toBeNull();
  });

  it('localStorage indisponível: mostra o banner e "Entendi" ainda esconde', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    render(<BannerNovidade />);
    const botao = screen.getByRole('button', { name: 'Entendi' });
    act(() => {
      fireEvent.click(botao);
    });
    expect(screen.queryByRole('region', { name: 'Aviso do beta' })).toBeNull();
  });
});

describe('RodapeLegal', () => {
  it('rodapé presente com o texto da Fase 0', () => {
    const { container } = render(<RodapeLegal className="mt-2" />);
    const p = container.querySelector('[data-rodape-legal]');
    expect(p).not.toBeNull();
    expect(p?.textContent).toBe(RODAPE_LEGAL);
    expect(p?.className).toContain('mt-2');
  });
});
