// @vitest-environment jsdom
/**
 * Decisão 6 (Wellington, 06/11/2026): "PGBL" e "dedução" proibidos em todo o Basic/Pro; "aporte"
 * proibido em tudo que o Basic vê e, no Pro, permitido só nas seções 4a/5/6 (corpos reais).
 * Vale para o HTML, para o conteúdo fictício desfocado e para o código que vai ao chunk de quem
 * vê o cadeado (cascas, fictícios e dados fixos).
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MESES_RELATORIO } from '@/types/relatorioFinanceiro';
import { relatorioExemplo } from '../__fixtures__/relatorioExemplo';
import { SecaoCarteira } from '../secoes/SecaoCarteira';
import { SecaoIr } from '../secoes/SecaoIr';
import { SecaoPlanejamento } from '../secoes/SecaoPlanejamento';
import { SecaoSaude } from '../secoes/SecaoSaude';
import { SecaoSonhos } from '../secoes/SecaoSonhos';
import { CarteiraAvancadaFicticia } from '../secoes/ficticio/CarteiraAvancadaFicticia';
import { CarteiraFicticia } from '../secoes/ficticio/CarteiraFicticia';
import { IrFicticio } from '../secoes/ficticio/IrFicticio';
import { PlanejamentoFicticio } from '../secoes/ficticio/PlanejamentoFicticio';
import { SaudeFicticia } from '../secoes/ficticio/SaudeFicticia';
import { SonhosFicticios } from '../secoes/ficticio/SonhosFicticios';

vi.mock('next/dynamic', () => import('./dynamicMock'));

const PGBL_DEDUCAO = /PGBL|dedu[cç]/i;
const TODAS = /PGBL|dedu[cç]|aporte/i;

const RAIZ = path.resolve(__dirname, '..');

describe.each(MESES_RELATORIO)('palavras proibidas com n=%i', (n) => {
  it('Basic: nem PGBL, nem dedução, nem aporte em todo o HTML das seções 4 a 8', () => {
    const rel = relatorioExemplo(n, 'basic');
    const { container } = render(
      <>
        <SecaoCarteira relatorio={rel} />
        <SecaoPlanejamento relatorio={rel} />
        <SecaoSonhos relatorio={rel} />
        <SecaoSaude relatorio={rel} />
        <SecaoIr relatorio={rel} />
      </>,
    );
    expect(container.querySelectorAll('.locked')).toHaveLength(6);
    expect(container.innerHTML).not.toMatch(TODAS);
  });

  it('Pro: sem PGBL/dedução em tudo; sem aporte nas seções 7 e 8 e nos cadeados', async () => {
    const rel = relatorioExemplo(n, 'pro');
    const { container } = render(
      <>
        <SecaoCarteira relatorio={rel} />
        <SecaoPlanejamento relatorio={rel} />
        <SecaoSonhos relatorio={rel} />
      </>,
    );
    await waitFor(() => expect(container.querySelector('.dreams')).not.toBeNull());
    await waitFor(() => expect(container.textContent).toContain('Rentabilidade mensal x meta'));
    expect(container.innerHTML).not.toMatch(PGBL_DEDUCAO);
    const cadeados = [...container.querySelectorAll('.locked')];
    expect(cadeados).toHaveLength(1);
    cadeados.forEach((c) => expect(c.innerHTML).not.toMatch(TODAS));

    const s78 = render(
      <>
        <SecaoSaude relatorio={rel} />
        <SecaoIr relatorio={rel} />
      </>,
    );
    expect(s78.container.querySelectorAll('.locked')).toHaveLength(2);
    expect(s78.container.innerHTML).not.toMatch(TODAS);
  });

  it('corpos fictícios: nenhuma das palavras', () => {
    const { container } = render(
      <>
        <CarteiraFicticia meses={n} />
        <CarteiraAvancadaFicticia meses={n} />
        <PlanejamentoFicticio meses={n} />
        <SonhosFicticios meses={n} />
        <SaudeFicticia meses={n} />
        <IrFicticio meses={n} />
      </>,
    );
    expect(container.innerHTML).not.toMatch(TODAS);
  });
});

describe('código que vai ao chunk de quem vê o cadeado', () => {
  const arquivos = [
    ...['SecaoCarteira', 'SecaoPlanejamento', 'SecaoSonhos', 'SecaoSaude', 'SecaoIr'].map((f) =>
      path.join('secoes', `${f}.tsx`),
    ),
    path.join('secoes', 'apoio.ts'),
    ...readdirSync(path.join(RAIZ, 'secoes', 'ficticio')).map((f) =>
      path.join('secoes', 'ficticio', f),
    ),
    ...readdirSync(path.join(RAIZ, 'ficticio')).map((f) => path.join('ficticio', f)),
  ];

  it.each(arquivos)('%s não contém PGBL, dedução nem aporte', (arquivo) => {
    const fonte = readFileSync(path.join(RAIZ, arquivo), 'utf8');
    expect(fonte).not.toMatch(TODAS);
  });

  it('as cascas só importam real/* e adv/* por next/dynamic', () => {
    for (const f of [
      'SecaoCarteira',
      'SecaoPlanejamento',
      'SecaoSonhos',
      'SecaoSaude',
      'SecaoIr',
    ]) {
      const fonte = readFileSync(path.join(RAIZ, 'secoes', `${f}.tsx`), 'utf8');
      expect(fonte).not.toMatch(/^import[^;]*from '(\.\/real|\.\.\/adv)\//m);
      expect(fonte).toMatch(/dynamic\(\(\) => import\('(\.\/real|\.\.\/adv)\//);
    }
  });
});
