// @vitest-environment jsdom
import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { mockFetchResponse } from '@/test/mocks/fetch';
import type { WizardErrors, WizardFormData } from '@/types/wizard';

/**
 * Emissor na renda fixa coberta pelo FGC (ClickUp 86e2xqh69, fatia C): seção "Emissor" do
 * Step4RendaFixaFields e as linhas Corretora/Emissor da confirmação.
 */

// Ícones SVG (imports de .svg não carregam no jsdom). Objeto explícito: um Proxy que responde a
// tudo (inclusive 'then') faz o import do mock nunca resolver.
vi.mock('@/icons', () => {
  const StubIcon = ({ className }: { className?: string }) => <span className={className} />;
  return { ChevronDownIcon: StubIcon };
});
// Os date pickers (flatpickr) não são o alvo e pesam no jsdom.
vi.mock('@/components/form/date-picker', () => ({ default: () => null }));
vi.mock('../shared/BusinessDayDatePicker', () => ({ default: () => null }));
vi.mock('../shared/PlanejamentoVinculoField', () => ({ default: () => null }));
vi.mock('../shared/UsarCaixaField', () => ({ default: () => null }));
vi.mock('@/hooks/useCategoriaEfetivaAtivo', () => ({
  useCategoriaEfetivaAtivo: () => ({ categoria: null, override: false, carregando: true }),
}));

import Step4RendaFixaFields from '../Step4RendaFixaFields';
import Step5Confirmation from '../Step5Confirmation';
import { DECIMAL_INPUT_PROPS, INTEGER_INPUT_PROPS } from '../step4Utils';

const BTG = { id: 'inst-btg', nome: 'BTG Pactual', rotulo: 'CNPJ 30.306.294/0001-45' };

const buildFormData = (overrides: Partial<WizardFormData> = {}): WizardFormData =>
  ({
    operacao: 'compra',
    tipoAtivo: 'renda-fixa',
    rendaFixaVariante: 'pre',
    rendaFixaTipo: 'CDB_PRE',
    instituicao: BTG.nome,
    instituicaoId: BTG.id,
    instituicaoTipoBacen: null,
    instituicaoCnpjRotulo: BTG.rotulo,
    emissorInstituicaoId: BTG.id,
    emissorInstituicaoNome: BTG.nome,
    emissorInstituicaoCnpjRotulo: BTG.rotulo,
    emissorEditado: false,
    descricao: '',
    dataInicio: '',
    dataVencimento: '',
    valorAplicado: 0,
    taxaJurosAnual: 0,
    observacoes: '',
    ...overrides,
  }) as WizardFormData;

/** Harness com estado: as mudanças voltam como props, igual ao AddAssetWizard. */
function Harness({
  inicial,
  errosIniciais = {},
}: {
  inicial: WizardFormData;
  errosIniciais?: WizardErrors;
}) {
  const [formData, setFormData] = useState(inicial);
  const [errors, setErrors] = useState<WizardErrors>(errosIniciais);
  return (
    <>
      <Step4RendaFixaFields
        formData={formData}
        errors={errors}
        handleInputChange={(field, value) => {
          setFormData((prev) => ({ ...prev, [field]: value }));
          setErrors((prev) => ({ ...prev, [field]: undefined }));
        }}
        handleDecimalInputChange={() => vi.fn()}
        getDecimalInputValue={() => ''}
        parseDecimalValue={() => null}
        decimalInputProps={DECIMAL_INPUT_PROPS}
        integerInputProps={INTEGER_INPUT_PROPS}
        onFormDataChange={(d) => setFormData((prev) => ({ ...prev, ...d }))}
      />
      <span data-testid="emissor-id">{formData.emissorInstituicaoId}</span>
      <span data-testid="emissor-editado">{String(formData.emissorEditado)}</span>
      <button type="button">fora</button>
    </>
  );
}

const BANCOS = {
  institutions: [
    {
      id: 'inst-bxp',
      nome: 'Banco XP S.A.',
      codigo: '348',
      status: 'ATIVA',
      cnpj: '33264668000103',
      cnpjCalculado: true,
      tipoBacen: 'B1',
    },
  ],
};

describe('Step4RendaFixaFields — seção Emissor', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(mockFetchResponse(BANCOS));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each(['CDB_PRE', 'LCI_HIB', 'RDC_PRE'])('%s mostra a seção Emissor', (tipo) => {
    render(
      <Harness
        inicial={buildFormData({
          rendaFixaTipo: tipo,
          tipoAtivo: tipo.endsWith('_HIB') ? 'renda-fixa-hibrida' : 'renda-fixa',
        })}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Emissor' })).toBeInTheDocument();
    expect(screen.getByLabelText('Banco emissor *')).toHaveAttribute('id', 'emissorInstituicao');
  });

  it.each(['LF_PRE', 'CRI_PRE', 'CRA_HIB'])('%s não mostra a seção Emissor', (tipo) => {
    render(
      <Harness
        inicial={buildFormData({
          rendaFixaTipo: tipo,
          tipoAtivo: tipo.endsWith('_HIB') ? 'renda-fixa-hibrida' : 'renda-fixa',
        })}
      />,
    );
    expect(screen.queryByRole('heading', { name: 'Emissor' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Banco emissor *')).not.toBeInTheDocument();
  });

  it('faixa "Via <corretora> · <produto>" no topo (pós sem o "Pré")', () => {
    const { container, unmount } = render(<Harness inicial={buildFormData()} />);
    const via = container.querySelector('[data-mf-rf-via]') as HTMLElement;
    expect(via).toHaveTextContent('Via BTG Pactual');
    expect(via).toHaveTextContent('CDB Pré');
    unmount();
    const pos = render(
      <Harness
        inicial={buildFormData({ tipoAtivo: 'renda-fixa-posfixada', rendaFixaVariante: 'pos' })}
      />,
    );
    const viaPos = pos.container.querySelector('[data-mf-rf-via]') as HTMLElement;
    expect(viaPos.textContent).toMatch(/CDB$/);
  });

  it('vem com a corretora e a pill "Mesmo da corretora"', () => {
    render(<Harness inicial={buildFormData()} />);
    expect(screen.getByLabelText('Banco emissor *')).toHaveValue('BTG Pactual');
    expect(screen.getByText('Mesmo da corretora')).toBeInTheDocument();
    expect(
      screen.getByText('Preenchido com a corretora. Troque se o título for de outro banco.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Corretoras normalmente não emitem/)).not.toBeInTheDocument();
  });

  it('corretora N2 mostra o aviso âmbar sem tirar o valor', () => {
    render(<Harness inicial={buildFormData({ instituicaoTipoBacen: 'N2' })} />);
    expect(
      screen.getByText(
        'Corretoras normalmente não emitem títulos. Confira o banco emissor na nota de negociação.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Mesmo da corretora')).toBeInTheDocument();
    expect(screen.getByLabelText('Banco emissor *')).toHaveValue('BTG Pactual');
  });

  it('busca em papel=emissor, troca para outro banco e mostra CNPJ + limite do FGC', async () => {
    render(<Harness inicial={buildFormData()} />);
    const input = screen.getByLabelText('Banco emissor *');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'xp' } });
    const opcao = await screen.findByRole('button', { name: /Banco XP S\.A\./ });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('papel=emissor'))).toBe(true);
    expect(within(opcao).getByText('Banco · CNPJ 33.264.668')).toBeInTheDocument();
    fireEvent.click(opcao);

    expect(screen.getByTestId('emissor-id')).toHaveTextContent('inst-bxp');
    expect(screen.getByTestId('emissor-editado')).toHaveTextContent('true');
    expect(screen.queryByText('Mesmo da corretora')).not.toBeInTheDocument();
    expect(
      screen.getByText(
        (_texto, el) =>
          el?.tagName === 'P' &&
          el.textContent ===
            'CNPJ 33.264.668 · Para o FGC, este título conta no limite do Banco XP S.A.',
      ),
    ).toBeInTheDocument();
  });

  it('apagar e sair do campo volta para a corretora', async () => {
    render(<Harness inicial={buildFormData()} />);
    const input = screen.getByLabelText('Banco emissor *');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '' } });
    expect(screen.getByTestId('emissor-id')).toHaveTextContent('');
    fireEvent.blur(input, { relatedTarget: screen.getByRole('button', { name: 'fora' }) });
    await waitFor(() => expect(screen.getByTestId('emissor-id')).toHaveTextContent(BTG.id));
    expect(screen.getByLabelText('Banco emissor *')).toHaveValue('BTG Pactual');
    expect(screen.getByText('Mesmo da corretora')).toBeInTheDocument();
  });

  it('sem corretora para voltar, sair do campo vazio mostra o erro inline', () => {
    render(
      <Harness
        inicial={buildFormData({
          instituicaoId: '',
          instituicao: '',
          emissorInstituicaoId: '',
          emissorInstituicaoNome: '',
        })}
      />,
    );
    const input = screen.getByLabelText('Banco emissor *');
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(screen.getByText('Escolha o banco emissor na lista.')).toBeInTheDocument();
  });

  it('mostra o erro que o Avançar gravou em errors.emissorInstituicaoId', () => {
    render(
      <Harness
        inicial={buildFormData({ emissorInstituicaoId: '', emissorInstituicaoNome: '' })}
        errosIniciais={{ emissorInstituicaoId: 'Escolha o banco emissor na lista.' }}
      />,
    );
    expect(screen.getByText('Escolha o banco emissor na lista.')).toBeInTheDocument();
  });

  it('"Por que pedimos o emissor?" é um details nativo', () => {
    render(<Harness inicial={buildFormData()} />);
    const summary = screen.getByText('Por que pedimos o emissor?');
    expect(summary.tagName).toBe('SUMMARY');
    expect(summary.className).toContain('min-h-11');
  });
});

describe('Step5Confirmation — Corretora e Emissor', () => {
  const confirma = (overrides: Partial<WizardFormData>) =>
    render(
      <Step5Confirmation
        formData={buildFormData({
          descricao: 'CDB XP 2028',
          dataInicio: '2026-10-14',
          dataVencimento: '2028-10-16',
          valorAplicado: 180000,
          taxaJurosAnual: 14.35,
          ...overrides,
        })}
        onFormDataChange={vi.fn()}
        onSubmit={vi.fn()}
        loading={false}
      />,
    );

  it('CDB: "Corretora" + "Emissor" com o CNPJ e a faixa do limite', () => {
    const { container } = confirma({
      emissorInstituicaoId: 'inst-bxp',
      emissorInstituicaoNome: 'Banco XP S.A.',
      emissorInstituicaoCnpjRotulo: 'CNPJ 33.264.668',
      emissorEditado: true,
    });
    expect(screen.getByText('Corretora:')).toBeInTheDocument();
    expect(screen.queryByText('Instituição:')).not.toBeInTheDocument();
    const emissor = container.querySelector('[data-mf-confirma-emissor]') as HTMLElement;
    expect(emissor).toHaveTextContent('Banco XP S.A.');
    expect(emissor).toHaveTextContent('CNPJ 33.264.668');
    expect(container.querySelector('[data-mf-confirma-fgc]')).toHaveTextContent(
      'Na Cobertura FGC, este título entra no limite do Banco XP S.A. (até R$ 250 mil por CPF), somado a outros títulos do mesmo banco.',
    );
  });

  it('LF: continua "Instituição" e sem emissor', () => {
    const { container } = confirma({ rendaFixaTipo: 'LF_PRE' });
    expect(screen.getByText('Instituição:')).toBeInTheDocument();
    expect(container.querySelector('[data-mf-confirma-emissor]')).toBeNull();
    expect(container.querySelector('[data-mf-confirma-fgc]')).toBeNull();
  });
});
