// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import PriceDeviationConfirmModal from '../PriceDeviationConfirmModal';
import Step5Confirmation from '../Step5Confirmation';
import Step5AporteConfirmation from '../Step5AporteConfirmation';
import UsarCaixaField from '../shared/UsarCaixaField';
import CreditarCaixaField from '../shared/CreditarCaixaField';
import { CarteiraResumoProvider } from '@/context/CarteiraResumoContext';
import type { CarteiraResumo } from '@/hooks/useCarteira';
import type { WizardFormData } from '@/types/wizard';
import {
  ComValoresOcultos,
  SENTINELAS,
  expectPilulas,
  expectSemValoresExpostos,
  textosExpostos,
} from '@/test/valoresOcultos';

/**
 * Esconder valores (Fase 6, fatia 3): os assistentes de Lançar/Aporte/Resgate são FORMULÁRIOS e
 * ficam visíveis com o olho fechado (decisão 3) — confirmação e aviso de preço mostram os números
 * e nenhuma pílula aparece. O preço de fechamento é mercado. Exceção (follow-up de 03/11): o texto
 * de apoio do "Descontar do Caixa para Investir" mostra o saldo do caixa, que não foi digitado, e
 * esconde.
 */
vi.mock('../shared/PlanejamentoVinculoField', () => ({ default: () => null }));
vi.mock('@/hooks/useCategoriaEfetivaAtivo', () => ({
  useCategoriaEfetivaAtivo: () => ({ categoria: null, override: false, carregando: false }),
}));

const texto = (el: HTMLElement) => (el.textContent ?? '').replace(/\s/g, ' ');

const comCaixa = (ui: React.ReactElement, total: number, porAba: Record<string, number>) => {
  const reservado = Object.values(porAba).reduce((a, b) => a + b, 0);
  const value = {
    resumo: {
      caixaParaInvestir: total,
      caixa: { total, reservado, livre: total - reservado, porAba },
    } as unknown as CarteiraResumo,
    loading: false,
    error: null,
    formatCurrency: () => '',
    formatPercentage: () => '',
    updateMeta: vi.fn(),
    updateCaixaParaInvestir: vi.fn(),
    refetch: vi.fn(),
    necessidadeAporteMap: {},
    isAlocacaoLoading: false,
    invalidateAssets: vi.fn(),
  };
  return <CarteiraResumoProvider value={value}>{ui}</CarteiraResumoProvider>;
};

const fechado = (ui: React.ReactElement) => render(<ComValoresOcultos>{ui}</ComValoresOcultos>);

describe('assistentes da carteira com o olho fechado (decisão 3)', () => {
  it('aviso de preço: preço informado e fechamento ficam visíveis', () => {
    const { container } = fechado(
      <PriceDeviationConfirmModal
        isOpen
        enteredPrice={SENTINELAS.precoMedio}
        referencePrice={28.3}
        effectiveDate="2022-05-10"
        ratio={1.355}
        direction="acima"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const tudo = texto(document.body);
    expect(tudo).toContain('R$ 66,66');
    expect(tudo).toContain('R$ 28,30');
    expectPilulas(container, 0);
    expect(document.querySelectorAll('.mf-sensivel')).toHaveLength(0);
  });

  it('confirmação do aporte: valor do aporte fica visível e o caixa de hoje vira pílula', () => {
    const formData = {
      operacao: 'aporte',
      tipoAtivo: 'acao',
      ativo: 'PETR4',
      dataAporte: '2026-10-22',
      valorAporte: SENTINELAS.aplicado,
    } as unknown as WizardFormData;
    const { container } = fechado(
      comCaixa(
        <Step5AporteConfirmation formData={formData} onFormDataChange={vi.fn()} />,
        SENTINELAS.saldo,
        {},
      ),
    );
    const expostos = textosExpostos(container).join(' ').replace(/\s/g, ' ');
    expect(expostos).toContain('R$ 8.765.432,10');
    expect(expostos).not.toContain('9.876.543,21');
    expectPilulas(container, 1);
  });

  it('Descontar do Caixa ligado: o total depois vira pílula', () => {
    const { container } = fechado(
      comCaixa(
        <UsarCaixaField valor={1000} aba="acoes" checked onChange={vi.fn()} />,
        SENTINELAS.saldo,
        { acoes: 3000 },
      ),
    );
    expect(texto(container)).toContain('O caixa total fica em');
    expectSemValoresExpostos(container);
    expectPilulas(container);
  });

  it('Descontar do Caixa desligado: caixa de hoje e reserva viram pílula', () => {
    const { container } = fechado(
      comCaixa(
        <UsarCaixaField valor={1000} aba="acoes" checked={false} onChange={vi.fn()} />,
        SENTINELAS.saldo,
        { acoes: SENTINELAS.aplicado },
      ),
    );
    expect(texto(container)).toContain('O caixa não será alterado (hoje:');
    expectSemValoresExpostos(container);
    expectPilulas(container, 2);
  });

  it('Descontar do Caixa com o olho aberto: texto igual ao de antes', () => {
    const { container } = render(
      <ComValoresOcultos ocultos={false}>
        {comCaixa(
          <UsarCaixaField valor={1000} aba="acoes" checked onChange={vi.fn()} />,
          SENTINELAS.saldo,
          { acoes: 3000 },
        )}
      </ComValoresOcultos>,
    );
    expect(texto(container)).toContain('O caixa total fica em R$ 9.875.543,21');
    expectPilulas(container, 0);
  });

  it('Devolver ao Caixa (resgate): valor digitado visível, total do caixa vira pílula', () => {
    const { container } = fechado(
      comCaixa(
        <CreditarCaixaField valor={1000} moeda="BRL" checked onChange={vi.fn()} />,
        SENTINELAS.saldo,
        {},
      ),
    );
    expect(texto(container)).toContain(
      'R$ 1.000,00 voltam como caixa livre. O caixa total fica em',
    );
    expect(texto(container.querySelector('[data-mf-valor-visivel]')!)).toBe('R$ 1.000,00');
    expect(textosExpostos(container).join('')).not.toContain('9.877.543,21');
    expectPilulas(container, 1);
  });

  it('confirmação do lançamento em dólar: total, equivalente e corretagem ficam visíveis', () => {
    const formData = {
      operacao: 'novo-ativo',
      tipoAtivo: 'stock',
      assetId: 'STOCK-MANUAL',
      ativo: 'MSFT',
      estrategia: 'growth',
      dataCompra: '2026-10-22',
      quantidade: 2,
      cotacaoUnitaria: 512.4,
      cotacaoMoeda: 5.0385,
      taxaCorretagem: 10,
      moeda: 'USD',
    } as unknown as WizardFormData;
    const { container } = fechado(
      comCaixa(<Step5Confirmation formData={formData} onSubmit={vi.fn()} loading={false} />, 0, {}),
    );
    expect(texto(container.querySelector('[data-total-usd]')!)).toMatch(/US\$ 1\.024,80/);
    expect(texto(container.querySelector('[data-equivale-brl]')!)).toMatch(/R\$ 5\.173,45/);
    expect(texto(container.querySelector('[data-equivale-brl]')!)).toMatch(/\+ R\$ 10,00/);
    expectPilulas(container, 0);
  });
});
