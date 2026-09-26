// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MobileStatusPill, STATUS_PILL_TONES, type MobileStatusTone } from '../MobileStatusPill';

const TONES: MobileStatusTone[] = ['ok', 'atencao', 'problema', 'neutro'];

describe('MobileStatusPill', () => {
  it.each(TONES)('%s: ponto + palavra, sem verde', (tone) => {
    const { container } = render(<MobileStatusPill tone={tone}>Palavra</MobileStatusPill>);
    expect(screen.getByText('Palavra')).toBeInTheDocument();
    const html = container.innerHTML;
    expect(html).not.toMatch(/green|emerald|success/);
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('#0079F2 só no ponto (nunca em texto)', () => {
    expect(STATUS_PILL_TONES.ok.dot).toContain('#0079F2');
    for (const tone of TONES) expect(STATUS_PILL_TONES[tone].text).not.toContain('0079F2');
  });

  it('cores do âmbar e do vermelho combinadas', () => {
    expect(STATUS_PILL_TONES.atencao.dot).toBe('bg-[#D97706] dark:bg-[#FBBF24]');
    expect(STATUS_PILL_TONES.atencao.text).toBe('text-[#B45309] dark:text-[#FBBF24]');
    expect(STATUS_PILL_TONES.problema.text).toBe('text-[#D92D20] dark:text-[#F97066]');
  });
});
