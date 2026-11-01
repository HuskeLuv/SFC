// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { calc } from '@/services/planejamento/aposentadoria';
import type { PlanoUpsertPayload } from '@/hooks/useAposentadoria';
import {
  ComValoresOcultos,
  SENTINELAS,
  expectPilulas,
  expectSemValoresExpostos,
  renderComValoresOcultos,
} from '@/test/valoresOcultos';
import LeftPanel, { PARAM_FIELDS } from '../LeftPanel';
import type { AutoValues } from '../autoFields';
import PremissasCard from '../mobile/PremissasCard';
import PremissasSheet from '../mobile/PremissasSheet';
import RegistrarMesSheet, { type RegistrarMesSheetProps } from '../mobile/RegistrarMesSheet';
import AcompanhamentoCards, { type AcompanhamentoRow } from '../mobile/AcompanhamentoCards';

/**
 * Esconder valores (Fase 3, fatia 3): painel da Aposentadoria (LeftPanel) e celular (cartão de
 * premissas, sheet de premissas, registrar mês e cartões do acompanhamento). Os CAMPOS continuam
 * com o número (decisão 3); o que está fora deles em R$ — eco do campo, valor automático, resumo
 * projetado, "Necessário:", sugestão da carteira, Δ vs plano — vira pílula. % e idades ficam.
 */

vi.mock('next/navigation', () => ({ usePathname: () => '/planejamento-financeiro' }));

function stubMatchMedia(mobile = true) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: mobile,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

beforeEach(() => stubMatchMedia(true));

const SALDO = SENTINELAS.saldo; // 9.876.543,21
const APLICADO = SENTINELAS.aplicado; // 8.765.432,10
const PRECO = SENTINELAS.precoMedio; // 66,66
const SENT = [SALDO, APLICADO, PRECO];

const PARAMS: PlanoUpsertPayload = {
  idade: 35,
  apos: 60,
  vida: 90,
  rentNom: 11.5,
  inflacao: 4.5,
  rentNomRetiro: null,
  patrimonio: SALDO,
  aporteM: PRECO,
  renda: APLICADO,
  trackStartMonth: 1,
  trackStartYear: 2026,
  eventos: [{ tipo: 'aporte', idade: 45, valor: APLICADO }],
  // Tudo travado: o atalho "↺ usar <auto>" aparece em todos os campos auto.
  fieldLocks: ['patrimonio', 'aporteM', 'renda', 'rentNom', 'inflacao'],
};

const AUTO: AutoValues = {
  patrimonio: { autoValue: APLICADO, label: 'do seu patrimônio' },
  aporteM: { autoValue: SALDO, label: 'da sua sobra de caixa' },
  renda: { autoValue: SALDO, label: 'das suas despesas mensais' },
  rentNom: { autoValue: 11.15, label: 'CDI atual' },
  inflacao: { autoValue: 4.68, label: 'IPCA 12m' },
};

/** innerHTML sem os ids do useId (mudam a cada render), para comparar o DOM. */
const semIds = (html: string) => html.replace(/_r_[0-9a-z]+_/g, '_r_');

const leftPanel = () => (
  <LeftPanel
    params={PARAMS}
    onChange={vi.fn()}
    autoValues={AUTO}
    onResync={vi.fn()}
    rentCarteiraAA={null}
    rentCarteiraLoading={false}
    onUseCarteira={vi.fn()}
  />
);

const premissasSheet = () => (
  <PremissasSheet
    isOpen
    onClose={vi.fn()}
    params={PARAMS}
    projection={calc(PARAMS)}
    onChange={vi.fn()}
    autoValues={AUTO}
    onResync={vi.fn()}
    rentCarteiraAA={null}
    rentCarteiraLoading={false}
    onUseCarteira={vi.fn()}
  />
);

const registrarProps: RegistrarMesSheetProps = {
  isOpen: true,
  onClose: vi.fn(),
  params: PARAMS,
  retM: 300,
  curOffset: 3,
  setCurOffset: vi.fn(),
  aporteStr: String(PRECO),
  setAporteStr: vi.fn(),
  patStr: String(SALDO),
  setPatStr: vi.fn(),
  preview: {
    rent: 0.87,
    metaMensal: 0.55,
    dPat: -APLICADO,
    dPatPct: -12.3,
    aporteNecessario: APLICADO,
    patrimonioNecessario: SALDO,
  },
  sugestao: { aporteReal: PRECO, patFinal: APLICADO },
  editingExists: false,
  saving: false,
  onSave: vi.fn(),
  onDelete: vi.fn(),
};

const ROWS: AcompanhamentoRow[] = [
  { off: 1, label: 'Fev/26', aporteReal: PRECO, patFinal: SALDO, rent: 0.87, reqPat: APLICADO },
  { off: 2, label: 'Mar/26', aporteReal: null, patFinal: null, rent: null, reqPat: SALDO },
];

describe('LeftPanel (painel da Aposentadoria no computador)', () => {
  it('olho fechado: eco do campo e valor automático em R$ viram pílula; campos com o número', () => {
    const { container } = renderComValoresOcultos(leftPanel());
    expectSemValoresExpostos(container, { sentinelas: SENT });
    // 3 ecos (patrimônio, aporte, renda) + 3 atalhos "↺ usar R$" — o atalho de % fica.
    expectPilulas(container, 6);
    expect(screen.getByRole('button', { name: /usar 11,2%/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /usar 4,7%/ })).toBeInTheDocument();
    // Formulário visível (decisão 3): os campos de valor e do evento continuam com o número.
    expect(screen.getByLabelText(PARAM_FIELDS.patrimonio.label)).toHaveValue(SALDO);
    expect(screen.getByLabelText(PARAM_FIELDS.renda.label)).toHaveValue(APLICADO);
    const valores = Array.from(container.querySelectorAll('input[type="number"]')).map(
      (el) => (el as HTMLInputElement).valueAsNumber,
    );
    expect(valores).toContain(APLICADO); // valor do evento pontual
    // Idades, taxas reais e % continuam.
    expect(container).toHaveTextContent('Real a.a.:');
    expect(container).toHaveTextContent('%');
  });

  it('olho aberto: DOM idêntico ao de sem o provider', () => {
    const { container: semProvider } = render(leftPanel());
    const html = semIds(semProvider.innerHTML);
    semProvider.remove();
    const { container } = render(
      <ComValoresOcultos ocultos={false}>{leftPanel()}</ComValoresOcultos>,
    );
    expect(semIds(container.innerHTML)).toBe(html);
    expect(container).toHaveTextContent('R$ 9.876.543,21');
  });
});

describe('PremissasCard (celular)', () => {
  it('olho fechado: R$ em pílula curta, também no aria-label; idades e % ficam', () => {
    const { container } = renderComValoresOcultos(
      <PremissasCard params={PARAMS} onOpen={vi.fn()} savedLabel="✔ Salvo" />,
    );
    expectSemValoresExpostos(container, { sentinelas: SENT });
    expect(container.querySelectorAll('.mf-sensivel--curto')).toHaveLength(3);
    const patrimonio = container.querySelector('[data-premissa="patrimonio"]');
    expect(patrimonio).toHaveAttribute(
      'aria-label',
      'Patrimônio atual: R$ •••••. Tocar para editar',
    );
    expect(container.querySelector('[data-premissa="idade"]')).toHaveTextContent('35 anos');
    expect(container.querySelector('[data-premissa="rentNom"]')).toHaveTextContent('11,5%');
  });

  it('olho aberto: DOM idêntico', () => {
    const ui = <PremissasCard params={PARAMS} onOpen={vi.fn()} />;
    const { container: semProvider } = render(ui);
    const html = semProvider.innerHTML;
    semProvider.remove();
    const { container } = render(<ComValoresOcultos ocultos={false}>{ui}</ComValoresOcultos>);
    expect(container.innerHTML).toBe(html);
  });
});

describe('PremissasSheet (celular)', () => {
  it('olho fechado: resumo projetado e atalhos em R$ viram pílula; campos com o número', () => {
    renderComValoresOcultos(premissasSheet());
    const dialogo = screen.getByRole('dialog');
    expectSemValoresExpostos(dialogo, { sentinelas: SENT });
    const resumo = dialogo.querySelector('[data-premissas-resumo]') as HTMLElement;
    expect(resumo.querySelectorAll('.mf-sensivel')).toHaveLength(1);
    expect(resumo).toHaveTextContent('Aos 60:');
    expect(resumo).toHaveTextContent('Renda dura até');
    // 3 atalhos "↺ usar R$" (patrimônio, aporte, renda) — os de % ficam.
    expect(dialogo.querySelectorAll('.mf-sensivel')).toHaveLength(4);
    expect(screen.getByRole('button', { name: /usar 11,2%/ })).toBeInTheDocument();
    // Formulário visível: os campos mostram o número digitável.
    expect(screen.getByLabelText(PARAM_FIELDS.patrimonio.label)).toHaveValue('9.876.543,21');
    expect(screen.getByLabelText(PARAM_FIELDS.renda.label)).toHaveValue('8.765.432,10');
    expect(screen.getByLabelText('Valor')).toHaveValue('8.765.432,10');
  });

  it('olho aberto: o resumo mostra o patrimônio projetado como hoje', () => {
    renderComValoresOcultos(premissasSheet(), { ocultos: false });
    const resumo = document.querySelector('[data-premissas-resumo]') as HTMLElement;
    expect(resumo.querySelector('.mf-sensivel')).toBeNull();
    expect(resumo.textContent).toMatch(/R\$ [\d,]+ M/);
  });
});

describe('RegistrarMesSheet (celular)', () => {
  it('olho fechado: Necessário, sugestão e Δ vs plano viram pílula; campos e % ficam', () => {
    renderComValoresOcultos(<RegistrarMesSheet {...registrarProps} />);
    const dialogo = screen.getByRole('dialog');
    expectSemValoresExpostos(dialogo, { sentinelas: SENT });
    // 2 "Necessário:" + 2 da sugestão + 1 do Δ.
    expectPilulas(dialogo, 5);
    expect(dialogo).toHaveTextContent('Necessário:');
    expect(dialogo).toHaveTextContent('Da sua carteira:');
    const previa = dialogo.querySelector('[data-registrar-mes-previa]') as HTMLElement;
    expect(previa).toHaveTextContent('0,87%');
    expect(previa).toHaveTextContent('0,55%');
    expect(previa).toHaveTextContent('(-12,3%)');
    expect(screen.getByLabelText('Aporte do mês')).toHaveValue('66,66');
    expect(screen.getByLabelText('Patrimônio final do mês')).toHaveValue('9.876.543,21');
  });

  it('olho aberto: os textos de apoio são os de hoje', () => {
    renderComValoresOcultos(<RegistrarMesSheet {...registrarProps} />, { ocultos: false });
    const dialogo = screen.getByRole('dialog');
    expect(dialogo.querySelector('.mf-sensivel')).toBeNull();
    expect(dialogo).toHaveTextContent('Necessário: R$ 8.765.432,10');
    expect(dialogo).toHaveTextContent('Necessário: R$ 9.876.543,21');
    expect(dialogo).toHaveTextContent('aporte R$ 66,66 · patrimônio R$ 8.765.432,10');
    expect(dialogo.querySelector('[data-registrar-mes-previa]')).toHaveTextContent(
      'R$ -8,77 M (-12,3%)',
    );
  });
});

describe('AcompanhamentoCards (celular)', () => {
  it('olho fechado: patrimônio e aporte em pílula curta; rent. e selo ficam', () => {
    const { container } = renderComValoresOcultos(
      <AcompanhamentoCards rows={ROWS} onSelect={vi.fn()} />,
    );
    expectSemValoresExpostos(container, { sentinelas: SENT });
    expect(container.querySelectorAll('.mf-sensivel--curto')).toHaveLength(2);
    const cards = container.querySelectorAll('[data-mf-card]');
    expect(cards[0]).toHaveTextContent('0,87%');
    expect(cards[0]).toHaveTextContent('Na meta');
    expect(cards[1]).toHaveTextContent('—');
  });

  it('olho aberto: DOM idêntico', () => {
    const ui = <AcompanhamentoCards rows={ROWS} onSelect={vi.fn()} />;
    const { container: semProvider } = render(ui);
    const html = semProvider.innerHTML;
    semProvider.remove();
    const { container } = render(<ComValoresOcultos ocultos={false}>{ui}</ComValoresOcultos>);
    expect(container.innerHTML).toBe(html);
  });
});
