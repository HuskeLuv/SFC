// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/wrappers';
import type { WizardErrors, WizardFormData } from '@/types/wizard';

/**
 * Emissor na renda fixa coberta pelo FGC (ClickUp 86e2xqh69, fatia C), do lado do AddAssetWizard:
 * o emissor acompanha a corretora até ser trocado, o Avançar sem emissor mostra o erro (não trava
 * calado) e o POST /api/carteira/operacao leva só emissorInstituicaoId, e só em produto coberto.
 * As etapas são trocadas por stubs com botões que mexem no formData.
 */
vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get:
        () =>
        ({ children, ...rest }: { children?: React.ReactNode } & Record<string, unknown>) => {
          const props: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(rest)) {
            if (['className', 'role', 'aria-modal', 'aria-labelledby', 'id'].includes(k)) {
              props[k] = v;
            }
          }
          return <div {...props}>{children}</div>;
        },
    },
  ),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
const { csrfFetch } = vi.hoisted(() => ({ csrfFetch: vi.fn() }));
vi.mock('@/hooks/useCsrf', () => ({ useCsrf: () => ({ csrfFetch }) }));
vi.mock('@/hooks/useMediaQuery', () => ({ useIsBelowLg: () => false }));
vi.mock('@/hooks/useKeyboardInset', () => ({
  useKeyboardInset: () => ({ height: null, offsetTop: 0 }),
}));
vi.mock('../wizard/usePriceDeviationWarning', () => ({
  usePriceDeviationWarning: () => ({ warning: null, referencePrice: null, effectiveDate: null }),
}));

type StubProps = {
  formData: WizardFormData;
  errors: WizardErrors;
  onFormDataChange: (d: Partial<WizardFormData>) => void;
};

const { stubs } = vi.hoisted(() => {
  const BTG = {
    instituicao: 'BTG Pactual',
    instituicaoId: 'inst-btg',
    instituicaoTipoBacen: null,
    instituicaoCnpjRotulo: 'CNPJ 30.306.294/0001-45',
  };
  const ITAU = {
    instituicao: 'Itaú Unibanco',
    instituicaoId: 'inst-itau',
    instituicaoTipoBacen: 'B1',
    instituicaoCnpjRotulo: 'CNPJ 60.701.190/0001-04',
  };
  const estado = (nome: string) =>
    function Stub({ formData, errors, onFormDataChange }: StubProps) {
      return (
        <div data-testid="etapa" data-etapa={nome}>
          <span data-testid="emissor-id">{formData.emissorInstituicaoId}</span>
          <span data-testid="emissor-nome">{formData.emissorInstituicaoNome}</span>
          <span data-testid="emissor-rotulo">{formData.emissorInstituicaoCnpjRotulo}</span>
          <span data-testid="erro-emissor">{errors.emissorInstituicaoId ?? ''}</span>
          <button type="button" onClick={() => onFormDataChange({ tipoAtivo: 'renda-fixa' })}>
            tipo RF
          </button>
          <button type="button" onClick={() => onFormDataChange(BTG)}>
            corretora BTG
          </button>
          <button type="button" onClick={() => onFormDataChange(ITAU)}>
            corretora Itaú
          </button>
          <button
            type="button"
            onClick={() => onFormDataChange({ rendaFixaVariante: 'pre', rendaFixaTipo: 'CDB_PRE' })}
          >
            CDB
          </button>
          <button
            type="button"
            onClick={() => onFormDataChange({ rendaFixaVariante: 'pre', rendaFixaTipo: 'LF_PRE' })}
          >
            LF
          </button>
          <button
            type="button"
            onClick={() =>
              onFormDataChange({
                descricao: 'CDB XP 2028',
                dataInicio: '2026-10-14',
                dataVencimento: '2028-10-16',
                valorAplicado: 1000,
                taxaJurosAnual: 14,
              })
            }
          >
            dados
          </button>
          <button
            type="button"
            onClick={() =>
              onFormDataChange({
                emissorInstituicaoId: 'inst-bxp',
                emissorInstituicaoNome: 'Banco XP S.A.',
                emissorInstituicaoCnpjRotulo: 'CNPJ 33.264.668',
                emissorEditado: true,
              })
            }
          >
            emissor XP
          </button>
          <button
            type="button"
            onClick={() =>
              onFormDataChange({
                emissorInstituicaoId: '',
                emissorInstituicaoNome: '',
                emissorInstituicaoCnpjRotulo: '',
              })
            }
          >
            limpar emissor
          </button>
        </div>
      );
    };
  return { stubs: { estado } };
});

vi.mock('../wizard/Step1AssetType', () => ({ default: stubs.estado('tipo') }));
vi.mock('../wizard/Step2Institution', () => ({ default: stubs.estado('instituicao') }));
vi.mock('../wizard/Step3Asset', () => ({ default: stubs.estado('ativo') }));
vi.mock('../wizard/Step4AssetInfo', () => ({ default: stubs.estado('info') }));
vi.mock('../wizard/Step5Confirmation', () => ({ default: stubs.estado('confirmacao') }));

import AddAssetWizard, {
  ERRO_EMISSOR_OBRIGATORIO,
  corpoOperacao,
  mesclarFormData,
} from '../AddAssetWizard';

const etapa = () => screen.getByTestId('etapa').getAttribute('data-etapa');
const txt = (id: string) => screen.getByTestId(id).textContent;
const clicar = (nome: string) => fireEvent.click(screen.getByRole('button', { name: nome }));
const avancar = () => clicar('Avançar');

function renderWizard() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <AddAssetWizard isOpen onClose={vi.fn()} onSuccess={vi.fn()} />
    </QueryClientProvider>,
  );
}

/** Tipo → corretora → CDB (ou LF) → etapa de informações com os dados preenchidos. */
function ateInfo(produto: 'CDB' | 'LF' = 'CDB') {
  renderWizard();
  clicar('tipo RF');
  avancar();
  expect(etapa()).toBe('instituicao');
  clicar('corretora BTG');
  avancar();
  expect(etapa()).toBe('ativo');
  clicar(produto);
  avancar();
  expect(etapa()).toBe('info');
  clicar('dados');
}

beforeEach(() => {
  vi.clearAllMocks();
  csrfFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
});

describe('mesclarFormData — o emissor acompanha a corretora', () => {
  const base = {
    instituicao: 'BTG Pactual',
    instituicaoId: 'inst-btg',
    instituicaoTipoBacen: null,
    instituicaoCnpjRotulo: 'CNPJ 30.306.294/0001-45',
    emissorInstituicaoId: 'inst-btg',
    emissorInstituicaoNome: 'BTG Pactual',
    emissorInstituicaoCnpjRotulo: 'CNPJ 30.306.294/0001-45',
    emissorEditado: false,
  } as WizardFormData;
  const itau = {
    instituicao: 'Itaú Unibanco',
    instituicaoId: 'inst-itau',
    instituicaoCnpjRotulo: 'CNPJ 60.701.190/0001-04',
  };

  it('a primeira corretora vira o emissor', () => {
    const vazio = {
      ...base,
      instituicao: '',
      instituicaoId: '',
      emissorInstituicaoId: '',
      emissorInstituicaoNome: '',
    };
    const r = mesclarFormData(vazio, { instituicao: 'BTG Pactual', instituicaoId: 'inst-btg' });
    expect(r.emissorInstituicaoId).toBe('inst-btg');
    expect(r.emissorInstituicaoNome).toBe('BTG Pactual');
  });

  it('trocar a corretora sem ter editado o emissor leva o emissor junto', () => {
    const r = mesclarFormData(base, itau);
    expect(r.emissorInstituicaoId).toBe('inst-itau');
    expect(r.emissorInstituicaoNome).toBe('Itaú Unibanco');
    expect(r.emissorInstituicaoCnpjRotulo).toBe('CNPJ 60.701.190/0001-04');
    expect(r.emissorEditado).toBe(false);
  });

  it('depois de trocar o emissor para outro banco, a corretora nova não o leva', () => {
    const editado = {
      ...base,
      emissorInstituicaoId: 'inst-bxp',
      emissorInstituicaoNome: 'Banco XP S.A.',
      emissorEditado: true,
    };
    const r = mesclarFormData(editado, itau);
    expect(r.instituicaoId).toBe('inst-itau');
    expect(r.emissorInstituicaoId).toBe('inst-bxp');
    expect(r.emissorInstituicaoNome).toBe('Banco XP S.A.');
  });

  it('mudança que não toca a corretora não mexe no emissor', () => {
    const r = mesclarFormData(base, { descricao: 'x', emissorInstituicaoId: 'inst-bxp' });
    expect(r.emissorInstituicaoId).toBe('inst-bxp');
  });
});

describe('corpoOperacao — payload do POST', () => {
  const form = {
    tipoAtivo: 'renda-fixa',
    rendaFixaTipo: 'CDB_PRE',
    instituicaoId: 'inst-btg',
    instituicaoTipoBacen: 'N2',
    instituicaoCnpjRotulo: 'CNPJ x',
    emissorInstituicaoId: 'inst-bxp',
    emissorInstituicaoNome: 'Banco XP S.A.',
    emissorInstituicaoCnpjRotulo: 'CNPJ 33.264.668',
    emissorEditado: true,
  } as WizardFormData;

  it('produto coberto: manda emissorInstituicaoId e nenhum campo auxiliar', () => {
    const corpo = corpoOperacao(form, true) as Record<string, unknown>;
    expect(corpo.emissorInstituicaoId).toBe('inst-bxp');
    expect(corpo.instituicaoId).toBe('inst-btg');
    for (const campo of [
      'emissorInstituicaoNome',
      'emissorInstituicaoCnpjRotulo',
      'emissorEditado',
      'instituicaoTipoBacen',
      'instituicaoCnpjRotulo',
    ]) {
      expect(corpo).not.toHaveProperty(campo);
    }
  });

  it('produto não coberto: sem emissorInstituicaoId', () => {
    expect(corpoOperacao(form, false)).not.toHaveProperty('emissorInstituicaoId');
  });
});

describe('AddAssetWizard — emissor no fluxo', () => {
  it('CDB: sem tocar no emissor, ele já vem com a corretora (nenhum clique a mais)', () => {
    ateInfo();
    expect(txt('emissor-id')).toBe('inst-btg');
    expect(txt('emissor-rotulo')).toBe('CNPJ 30.306.294/0001-45');
    expect(screen.getByRole('button', { name: 'Avançar' })).toBeEnabled();
    avancar();
    expect(etapa()).toBe('confirmacao');
  });

  it('avançar sem emissor mostra o erro em vez de travar o botão', () => {
    ateInfo();
    clicar('limpar emissor');
    const botao = screen.getByRole('button', { name: 'Avançar' });
    expect(botao).toBeEnabled();
    avancar();
    expect(etapa()).toBe('info');
    expect(txt('erro-emissor')).toBe(ERRO_EMISSOR_OBRIGATORIO);
    expect(ERRO_EMISSOR_OBRIGATORIO).toBe('Escolha o banco emissor na lista.');
  });

  it('voltar e trocar a corretora: leva o emissor se não foi editado; mantém se foi', () => {
    ateInfo();
    clicar('Voltar');
    clicar('Voltar');
    expect(etapa()).toBe('instituicao');
    clicar('corretora Itaú');
    expect(txt('emissor-id')).toBe('inst-itau');

    clicar('emissor XP');
    clicar('corretora BTG');
    expect(txt('emissor-id')).toBe('inst-bxp');
    expect(txt('emissor-nome')).toBe('Banco XP S.A.');
  });

  it('confirmar CDB envia emissorInstituicaoId e não os campos auxiliares', async () => {
    ateInfo();
    clicar('emissor XP');
    avancar();
    expect(etapa()).toBe('confirmacao');
    clicar('Confirmar');
    await waitFor(() => expect(csrfFetch).toHaveBeenCalled());
    const [url, init] = csrfFetch.mock.calls[0];
    expect(url).toBe('/api/carteira/operacao');
    const corpo = JSON.parse(init.body);
    expect(corpo.emissorInstituicaoId).toBe('inst-bxp');
    expect(corpo.instituicaoId).toBe('inst-btg');
    expect(corpo).not.toHaveProperty('emissorInstituicaoNome');
    expect(corpo).not.toHaveProperty('emissorEditado');
    expect(corpo).not.toHaveProperty('instituicaoTipoBacen');
    expect(corpo).not.toHaveProperty('emissorId');
  });

  it('LF não pede nem manda emissor', async () => {
    ateInfo('LF');
    clicar('limpar emissor');
    avancar();
    expect(etapa()).toBe('confirmacao');
    clicar('Confirmar');
    await waitFor(() => expect(csrfFetch).toHaveBeenCalled());
    const corpo = JSON.parse(csrfFetch.mock.calls[0][1].body);
    expect(corpo).not.toHaveProperty('emissorInstituicaoId');
  });
});
