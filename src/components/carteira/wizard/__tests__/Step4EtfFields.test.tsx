// @vitest-environment jsdom
import React, { useState } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { WizardErrors, WizardFormData } from '@/types/wizard';

/**
 * ETF americano em US$ (ticket 86e3fq1yh, fatia FB): o passo 4 do ETF tem dois modos. O ETF-MANUAL
 * (VOO, QQQ) é em dólar, com região e moeda fixas; o do catálogo (B3) é em reais, com a região
 * livre — a região nunca decide a moeda. A dica da #288 ("Informe o preço em reais") saiu.
 */
vi.mock('@/icons', () => {
  const StubIcon = ({ className }: { className?: string }) => <span className={className} />;
  return { ChevronDownIcon: StubIcon };
});
vi.mock('../shared/BusinessDayDatePicker', () => ({ default: () => null }));
vi.mock('@/components/carteira/mover/SecaoAtualNaCarteira', () => ({
  SecaoAtualNaCarteira: () => null,
}));

import Step4EtfFields from '../Step4EtfFields';
import Step4PlanejarFields from '../Step4PlanejarFields';
import Step3Asset, { avisoTickerEtfManual } from '../Step3Asset';
import { DECIMAL_INPUT_PROPS, INTEGER_INPUT_PROPS } from '../step4Utils';
import { isEtfManual, isRecusaEtfB3, ajustarCompraEtf } from '../../AddAssetWizard';

const etf = (over: Partial<WizardFormData> = {}): WizardFormData =>
  ({
    operacao: 'compra',
    tipoAtivo: 'etf',
    ativo: 'VOO',
    assetId: 'ETF-MANUAL',
    dataCompra: '2026-10-14',
    quantidade: 4,
    cotacaoUnitaria: 480,
    cotacaoMoeda: 5.2,
    taxaCorretagem: 10,
    moeda: '',
    ...over,
  }) as WizardFormData;

let ultimo: WizardFormData;
function Harness({ inicial }: { inicial: WizardFormData }) {
  const [formData, setFormData] = useState(inicial);
  ultimo = formData;
  const handleInputChange = React.useCallback(
    (field: keyof WizardFormData, value: string | number | boolean) =>
      setFormData((prev) => ({ ...prev, [field]: value })),
    [],
  );
  return (
    <Step4EtfFields
      formData={formData}
      errors={{}}
      handleInputChange={handleInputChange}
      handleDecimalInputChange={() => vi.fn()}
      getDecimalInputValue={(f) => {
        const v = formData[f];
        return typeof v === 'number' && v > 0 ? String(v) : '';
      }}
      parseDecimalValue={() => null}
      decimalInputProps={DECIMAL_INPUT_PROPS}
      integerInputProps={INTEGER_INPUT_PROPS}
      onFormDataChange={(d) => setFormData((prev) => ({ ...prev, ...d }))}
    />
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Step4EtfFields — ETF americano manual (US$)', () => {
  it('mostra câmbio, preço em US$ e total em US$; região e moeda fixas', async () => {
    render(<Harness inicial={etf()} />);
    expect(screen.getByLabelText(/Cotação do dólar no dia da compra \(R\$\)/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Preço por Cota \(US\$\)/)).toBeInTheDocument();
    expect(
      screen.getByText('Fica em reais e não entra no preço médio em US$.'),
    ).toBeInTheDocument();
    expect((screen.getByLabelText(/Total Investido \(US\$\)/) as HTMLInputElement).value).toMatch(
      /US\$\s1\.920,00/,
    );
    // Região travada (sem select) e moeda fixa.
    expect(document.querySelector('#regiaoEtf')!.textContent).toMatch(/EUA.*fixo/);
    expect(screen.getByText('USD · Dólar americano')).toBeInTheDocument();
    expect(screen.queryByText('Selecione a região do ETF')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(ultimo.moeda).toBe('USD');
      expect(ultimo.regiaoEtf).toBe('estados_unidos');
    });
  });
});

describe('Step4EtfFields — ETF da B3 (catálogo, R$)', () => {
  it('rótulo em R$, sem câmbio; na seção EUA, dica nova e sem a da #288', () => {
    render(
      <Harness
        inicial={etf({
          assetId: 'uuid-ivvb11',
          ativo: 'IVVB11 - iShares S&P 500',
          regiaoEtf: 'estados_unidos',
        })}
      />,
    );
    expect(screen.getByLabelText(/Cotação Unitária \(R\$\)/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Cotação do dólar/)).not.toBeInTheDocument();
    expect(screen.queryByText(/US\$/)).not.toBeInTheDocument();
    expect(
      screen.getByText('ETF da B3 (ex.: IVVB11) é negociado em reais, mesmo na seção EUA.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Informe o preço em reais/)).not.toBeInTheDocument();
    expect(ultimo.moeda).toBe('');
  });

  it('seção Brasil: sem a dica', () => {
    render(
      <Harness inicial={etf({ assetId: 'uuid-bova11', ativo: 'BOVA11', regiaoEtf: 'brasil' })} />,
    );
    expect(screen.queryByText(/negociado em reais/)).not.toBeInTheDocument();
  });
});

describe('Step4PlanejarFields — ETF', () => {
  function PlanejarHarness({ inicial }: { inicial: WizardFormData }) {
    const [formData, setFormData] = useState(inicial);
    ultimo = formData;
    const onFormDataChange = React.useCallback(
      (d: Partial<WizardFormData>) => setFormData((prev) => ({ ...prev, ...d })),
      [],
    );
    return (
      <Step4PlanejarFields
        formData={formData}
        errors={{} as WizardErrors}
        onFormDataChange={onFormDataChange}
        onErrorsChange={() => {}}
      />
    );
  }

  it('ETF-MANUAL: região travada em EUA', async () => {
    render(<PlanejarHarness inicial={etf({ operacao: 'planejar' })} />);
    expect(document.querySelector('#regiaoEtf')!.textContent).toMatch(/EUA.*fixo/);
    await waitFor(() => expect(ultimo.regiaoEtf).toBe('estados_unidos'));
  });

  it('ETF do catálogo: região livre', () => {
    render(<PlanejarHarness inicial={etf({ operacao: 'planejar', assetId: 'uuid-ivvb11' })} />);
    expect(screen.getByText('Selecione a região do ETF')).toBeInTheDocument();
    expect(ultimo.regiaoEtf).toBeUndefined();
  });
});

describe('Step3Asset — ETF', () => {
  it('aviso (não bloqueio) para ticker manual terminado em 11', () => {
    expect(avisoTickerEtfManual('ivvb11')).toMatch(/Parece um ETF da B3/);
    expect(avisoTickerEtfManual('BOVA11.SA')).toMatch(/Parece um ETF da B3/);
    expect(avisoTickerEtfManual('VOO')).toBeNull();
    expect(avisoTickerEtfManual('QQQ')).toBeNull();
  });

  function Step3Harness({ inicial }: { inicial: WizardFormData }) {
    const [formData, setFormData] = useState(inicial);
    const [errors, setErrors] = useState<WizardErrors>({});
    ultimo = formData;
    const onFormDataChange = React.useCallback(
      (d: Partial<WizardFormData>) => setFormData((prev) => ({ ...prev, ...d })),
      [],
    );
    const onErrorsChange = React.useCallback(
      (e: Partial<WizardErrors>) => setErrors((prev) => ({ ...prev, ...e })),
      [],
    );
    return (
      <Step3Asset
        formData={formData}
        errors={errors}
        onFormDataChange={onFormDataChange}
        onErrorsChange={onErrorsChange}
      />
    );
  }

  it('busca sem resultado → "ETF americano (US$)? Adicionar manualmente" → ticker em maiúsculas', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ assets: [] }) }),
    );
    render(<Step3Harness inicial={etf({ ativo: '', assetId: '' })} />);
    expect(screen.getByText(/ETF da B3 \(BOVA11, IVVB11\): escolha na lista/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Buscar ativo/), { target: { value: 'VOO' } });
    const link = await screen.findByRole('button', {
      name: 'ETF americano (US$)? Adicionar manualmente',
    });
    fireEvent.click(link);
    expect(screen.getByText('Entrada manual · ETF americano')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Ticker do ETF *'), { target: { value: 'voo' } });
    expect(ultimo.ativo).toBe('VOO');
    expect(ultimo.assetId).toBe('ETF-MANUAL');
    expect(document.querySelector('[data-manual-aviso]')).toBeNull();
    fireEvent.change(screen.getByLabelText('Ticker do ETF *'), { target: { value: 'ivvb11' } });
    expect(document.querySelector('[data-manual-aviso]')!.textContent).toMatch(
      /Parece um ETF da B3/,
    );
    // Aviso não bloqueia: o assetId continua ETF-MANUAL.
    expect(ultimo.assetId).toBe('ETF-MANUAL');
  });

  it('voltar ao passo 3 com o ETF manual reabre o modo manual', () => {
    render(<Step3Harness inicial={etf()} />);
    expect(screen.getByText('Entrada manual · ETF americano')).toBeInTheDocument();
    expect((screen.getByLabelText('Ticker do ETF *') as HTMLInputElement).value).toBe('VOO');
  });
});

describe('AddAssetWizard — regras do ETF manual', () => {
  it('isEtfManual só para etf + ETF-MANUAL', () => {
    expect(isEtfManual(etf())).toBe(true);
    expect(isEtfManual(etf({ assetId: 'uuid-ivvb11' }))).toBe(false);
    expect(isEtfManual(etf({ tipoAtivo: 'stock', assetId: 'ETF-MANUAL' }))).toBe(false);
  });

  it('recusa anti-B3 do back volta ao passo 3 só no ETF manual', () => {
    const msg = 'Este ETF é negociado na B3: escolha-o na busca';
    expect(isRecusaEtfB3(etf(), msg)).toBe(true);
    expect(isRecusaEtfB3(etf(), 'Cotação da moeda obrigatória')).toBe(false);
    expect(isRecusaEtfB3(etf({ assetId: 'uuid-ivvb11' }), msg)).toBe(false);
  });

  it('corpo da compra: manual em US$/EUA com ticker em maiúsculas; catálogo sem moeda/câmbio', () => {
    const manual = ajustarCompraEtf(etf({ ativo: ' voo ', regiaoEtf: 'brasil' }));
    expect(manual).toMatchObject({
      ativo: 'VOO',
      moeda: 'USD',
      regiaoEtf: 'estados_unidos',
      cotacaoMoeda: 5.2,
      assetId: 'ETF-MANUAL',
    });
    const b3 = ajustarCompraEtf(
      etf({ assetId: 'uuid-ivvb11', moeda: 'USD', cotacaoMoeda: 5.2, regiaoEtf: 'estados_unidos' }),
    );
    expect(b3).toMatchObject({ moeda: '', cotacaoMoeda: 0, regiaoEtf: 'estados_unidos' });
    const stock = etf({ tipoAtivo: 'stock', assetId: 'STOCK-MANUAL', moeda: 'USD' });
    expect(ajustarCompraEtf(stock)).toBe(stock);
  });
});
