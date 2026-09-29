// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React, { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PlanoUpsertPayload } from '@/hooks/useAposentadoria';
import RegistrarMesSheet, {
  monthValueToOff,
  toMonthValue,
  type RegistrarMesSheetProps,
} from '../RegistrarMesSheet';

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

const PARAMS: PlanoUpsertPayload = {
  idade: 64,
  apos: 65,
  vida: 90,
  rentNom: 12,
  inflacao: 5,
  rentNomRetiro: null,
  patrimonio: 10000,
  aporteM: 1000,
  renda: 5000,
  trackStartMonth: 11,
  trackStartYear: 2025,
  eventos: [],
  fieldLocks: [],
};

const PREVIEW = {
  rent: null,
  metaMensal: 0.5,
  dPat: null,
  dPatPct: 0,
  aporteNecessario: 1000,
  patrimonioNecessario: 12000,
};

/** Mesmo arranjo do AcompanhamentoTab: o estado (strings) mora fora do sheet. */
function Harness(props: Partial<RegistrarMesSheetProps> & { spy: (a: string, p: string) => void }) {
  const [curOffset, setCurOffset] = useState(props.curOffset ?? 2);
  const [aporteStr, setAporteStr] = useState(props.aporteStr ?? '');
  const [patStr, setPatStr] = useState(props.patStr ?? '');
  props.spy(aporteStr, patStr);
  return (
    <>
      <span data-testid="off">{curOffset}</span>
      <RegistrarMesSheet
        isOpen
        onClose={props.onClose ?? vi.fn()}
        params={PARAMS}
        retM={12}
        curOffset={curOffset}
        setCurOffset={setCurOffset}
        aporteStr={aporteStr}
        setAporteStr={setAporteStr}
        patStr={patStr}
        setPatStr={setPatStr}
        preview={PREVIEW}
        sugestao={null}
        editingExists={props.editingExists ?? false}
        saving={false}
        onSave={props.onSave ?? vi.fn()}
        onDelete={props.onDelete ?? vi.fn()}
      />
    </>
  );
}

beforeEach(() => stubMatchMedia(true));

describe('RegistrarMesSheet', () => {
  it("'1.500,50' vira '1500.5' no estado (o mesmo que o type=number do desktop)", () => {
    const spy = vi.fn();
    render(<Harness spy={spy} />);
    fireEvent.change(screen.getByLabelText('Aporte do mês'), { target: { value: '1.500,50' } });
    fireEvent.change(screen.getByLabelText('Patrimônio final do mês'), {
      target: { value: '20.000' },
    });
    expect(spy).toHaveBeenLastCalledWith('1500.5', '20000');
    expect(Number('1500.5')).toBe(1500.5);
  });

  it('valor existente aparece com vírgula', () => {
    render(<Harness spy={vi.fn()} aporteStr="1500.5" patStr="20000" />);
    expect(screen.getByLabelText('Aporte do mês')).toHaveValue('1.500,50');
    expect(screen.getByLabelText('Patrimônio final do mês')).toHaveValue('20.000,00');
  });

  it('Salvar travado sem patrimônio; com patrimônio chama o mesmo fluxo de salvar e fecha', async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(<Harness spy={vi.fn()} onSave={onSave} onClose={onClose} />);
    const salvar = screen.getByRole('button', { name: 'Salvar' });
    expect(salvar).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Patrimônio final do mês'), {
      target: { value: '12.345,67' },
    });
    expect(salvar).toBeEnabled();
    fireEvent.click(salvar);
    expect(onSave).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    // Aviso "salvo" (padrão MobileSaveToast) depois que o sheet fechou.
    expect(screen.getByText('Mês registrado')).toBeInTheDocument();
  });

  it('espera a API antes de fechar (acabamento fase 5): pendente = "Salvando…", sem fechar', async () => {
    let resolver: () => void = () => {};
    const onSave = vi.fn(() => new Promise<void>((resolve) => (resolver = resolve)));
    const onClose = vi.fn();
    render(<Harness spy={vi.fn()} onSave={onSave} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText('Patrimônio final do mês'), {
      target: { value: '20.000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('button', { name: 'Salvando…' })).toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();
    act(() => resolver());
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('erro na API mantém o sheet aberto e mostra o aviso', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('rede'));
    const onClose = vi.fn();
    render(<Harness spy={vi.fn()} onSave={onSave} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText('Patrimônio final do mês'), {
      target: { value: '20.000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(
      await screen.findByText('Não foi possível salvar. Tente novamente.'),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled();
  });

  it('mês nativo limitado ao plano (M1..retM) e convertido para o offset', () => {
    render(<Harness spy={vi.fn()} />);
    const month = screen.getByLabelText('Mês de referência');
    expect(month).toHaveAttribute('type', 'month');
    // início 11/2025: M1 = 12/2025, M12 = 11/2026
    expect(month).toHaveAttribute('min', '2025-12');
    expect(month).toHaveAttribute('max', '2026-11');
    expect(month).toHaveValue('2026-01');
    fireEvent.change(month, { target: { value: '2026-05' } });
    expect(screen.getByTestId('off')).toHaveTextContent('6');
    // fora do intervalo: preso ao limite
    fireEvent.change(month, { target: { value: '2030-01' } });
    expect(screen.getByTestId('off')).toHaveTextContent('12');
  });

  it('Remover só aparece quando o mês já tem registro', () => {
    const onDelete = vi.fn();
    const { unmount } = render(<Harness spy={vi.fn()} onDelete={onDelete} />);
    expect(screen.queryByRole('button', { name: 'Remover registro' })).toBeNull();
    unmount();
    render(<Harness spy={vi.fn()} onDelete={onDelete} editingExists />);
    fireEvent.click(screen.getByRole('button', { name: 'Remover registro' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('monthValueToOff é o inverso de off2date', () => {
    expect(monthValueToOff(PARAMS, '2025-12')).toBe(1);
    expect(monthValueToOff(PARAMS, '2026-11')).toBe(12);
    expect(monthValueToOff(PARAMS, 'x')).toBeNull();
    expect(toMonthValue(2026, 3)).toBe('2026-03');
  });
});
