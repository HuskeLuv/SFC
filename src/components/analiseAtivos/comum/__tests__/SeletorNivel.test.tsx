// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import SeletorNivel from '@/components/analiseAtivos/comum/SeletorNivel';
import { TEXTOS_RAIO_X } from '@/services/analiseAtivos/textosRaioX';
import { CORES_PERMITIDAS } from '@/constants/analiseAtivosVisual';
import type { NivelFundamentos } from '@/types/analiseAtivosBlocoD';

const OPCOES = [
  { valor: 'essencial', rotulo: TEXTOS_RAIO_X.seletor.essencial },
  { valor: 'raioX', rotulo: TEXTOS_RAIO_X.seletor.raioX },
] as const;

function montar(ativo: NivelFundamentos, onTrocar = vi.fn()) {
  render(
    <SeletorNivel<NivelFundamentos>
      opcoes={OPCOES}
      ativo={ativo}
      onTrocar={onTrocar}
      rotuloGrupo={TEXTOS_RAIO_X.seletor.rotuloGrupo}
    />,
  );
  return onTrocar;
}

describe('SeletorNivel', () => {
  afterEach(cleanup);

  it('grupo nomeado com botões aria-pressed', () => {
    montar('essencial');
    const grupo = screen.getByRole('group', { name: 'Nível de detalhe dos fundamentos' });
    expect(grupo).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Essencial' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Raio-X' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('clique troca; clicar no ativo não chama de novo', () => {
    const onTrocar = montar('essencial');
    fireEvent.click(screen.getByRole('button', { name: 'Raio-X' }));
    expect(onTrocar).toHaveBeenCalledWith('raioX');
    fireEvent.click(screen.getByRole('button', { name: 'Essencial' }));
    expect(onTrocar).toHaveBeenCalledTimes(1);
  });

  it('setas ← → trocam de opção (com volta)', () => {
    const onTrocar = montar('raioX');
    const grupo = screen.getByRole('group');
    fireEvent.keyDown(grupo, { key: 'ArrowRight' });
    expect(onTrocar).toHaveBeenLastCalledWith('essencial');
    fireEvent.keyDown(grupo, { key: 'ArrowLeft' });
    expect(onTrocar).toHaveBeenLastCalledWith('essencial');
  });

  it('decisão 13: todo botão com min-h-11 (44px) em todos os tamanhos', () => {
    montar('essencial');
    for (const b of screen.getAllByRole('button')) {
      expect(b.className).toMatch(/(^|\s)min-h-11(\s|$)/);
      // nenhum override menor em breakpoint
      expect(b.className).not.toMatch(/\b(sm|md|lg|xl):min-h-(?!11)/);
    }
  });

  it('só cores da paleta permitida', () => {
    const fonte = readFileSync(path.join(__dirname, '..', 'SeletorNivel.tsx'), 'utf8');
    const permitidas = new Set(CORES_PERMITIDAS.map((c) => c.toUpperCase()));
    const fora = [...fonte.matchAll(/#[0-9a-fA-F]{6}\b/g)]
      .map((m) => m[0])
      .filter((c) => !permitidas.has(c.toUpperCase()));
    expect(fora).toEqual([]);
  });
});
