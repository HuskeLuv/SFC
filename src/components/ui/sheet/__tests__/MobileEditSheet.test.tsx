// @vitest-environment jsdom
import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  MobileEditSheet,
  SAVE_ERROR_MESSAGE,
  type MobileEditSheetProps,
  type MobileEditValue,
} from '../MobileEditSheet';

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

type HarnessProps = Partial<MobileEditSheetProps> & {
  onSubmit: MobileEditSheetProps['onSubmit'];
};

/** Controla `isOpen` como um consumidor real (o sheet fica montado; só `isOpen` muda). */
function Harness(props: HarnessProps) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <span data-testid="estado">{open ? 'aberto' : 'fechado'}</span>
      <MobileEditSheet
        title="Editar objetivo"
        label="Objetivo"
        kind="percent"
        initialValue={10}
        {...props}
        isOpen={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

const field = () => screen.getByLabelText('Objetivo') as HTMLInputElement;
const save = () => screen.getByRole('button', { name: 'Salvar' });

async function type(value: string) {
  fireEvent.change(field(), { target: { value } });
}

describe('MobileEditSheet', () => {
  beforeEach(() => {
    stubMatchMedia(true);
    document.body.style.overflow = '';
  });
  afterEach(() => {
    vi.useRealTimers();
    // @ts-expect-error — remove o stub
    delete window.matchMedia;
  });

  it("abre com o valor atual e '12,5' chama onSubmit(12.5)", async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(<Harness onSubmit={onSubmit} />);
    expect(field().value).toBe('10');
    expect(field()).toHaveAttribute('inputmode', 'decimal');
    await type('12,5');
    await act(async () => {
      fireEvent.click(save());
    });
    expect(onSubmit).toHaveBeenCalledWith(12.5);
  });

  it('Enter no campo numérico salva', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<Harness onSubmit={onSubmit} />);
    await type('7');
    await act(async () => {
      fireEvent.submit(field().form!);
    });
    expect(onSubmit).toHaveBeenCalledWith(7);
    expect(screen.getByTestId('estado')).toHaveTextContent('fechado');
  });

  it('retorno false mantém aberto com o erro e o valor digitado', async () => {
    const onSubmit = vi.fn().mockResolvedValue(false);
    render(<Harness onSubmit={onSubmit} />);
    await type('15');
    await act(async () => {
      fireEvent.click(save());
    });
    expect(screen.getByTestId('estado')).toHaveTextContent('aberto');
    expect(screen.getByRole('alert')).toHaveTextContent(SAVE_ERROR_MESSAGE);
    expect(field().value).toBe('15');
    expect(screen.queryByRole('status')).not.toHaveTextContent('Salvo');
  });

  it('{ error } mantém aberto só com o motivo, sem o erro genérico', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ error: 'A reserva não cabe no caixa.' });
    render(<Harness onSubmit={onSubmit} />);
    await act(async () => {
      fireEvent.click(save());
    });
    expect(screen.getByTestId('estado')).toHaveTextContent('aberto');
    expect(screen.getByRole('alert')).toHaveTextContent('A reserva não cabe no caixa.');
    expect(screen.getByRole('alert')).not.toHaveTextContent(SAVE_ERROR_MESSAGE);
  });

  it('exceção mantém aberto com o erro', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('500'));
    render(<Harness onSubmit={onSubmit} />);
    await act(async () => {
      fireEvent.click(save());
    });
    expect(screen.getByTestId('estado')).toHaveTextContent('aberto');
    expect(screen.getByRole('alert')).toHaveTextContent(SAVE_ERROR_MESSAGE);
  });

  it('durante o save o botão fica ocupado e desabilitado', async () => {
    let resolve!: (v: boolean) => void;
    const onSubmit = vi.fn(() => new Promise<boolean>((r) => (resolve = r)));
    render(<Harness onSubmit={onSubmit} />);
    await act(async () => {
      fireEvent.click(save());
    });
    const busy = screen.getByRole('button', { name: /Salvando/ });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');
    await act(async () => resolve(true));
    expect(screen.getByTestId('estado')).toHaveTextContent('fechado');
  });

  it('sucesso fecha e mostra o aviso "salvo" por 4s, sem Desfazer', async () => {
    vi.useFakeTimers();
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(
      <Harness onSubmit={onSubmit} savedMessage={(v: MobileEditValue) => `Objetivo: ${v}%`} />,
    );
    await type('20');
    await act(async () => {
      fireEvent.click(save());
    });
    expect(screen.getByTestId('estado')).toHaveTextContent('fechado');
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Objetivo: 20%');
    expect(screen.queryByRole('button', { name: /Desfazer/ })).toBeNull();
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.getByRole('status')).toHaveTextContent('');
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('showSavedToast=false fecha sem aviso', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(<Harness onSubmit={onSubmit} showSavedToast={false} />);
    await act(async () => {
      fireEvent.click(save());
    });
    expect(screen.getByTestId('estado')).toHaveTextContent('fechado');
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('minExclusive: igual ao mínimo é erro inline e não chama onSubmit', async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} kind="currency" min={0} minExclusive initialValue={5} />);
    fireEvent.change(screen.getByLabelText('Objetivo'), { target: { value: '0' } });
    await act(async () => {
      fireEvent.click(save());
    });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('maior que 0');
    expect(screen.getByLabelText('Objetivo')).toHaveAttribute('aria-invalid', 'true');
  });

  it('vazio, NaN e acima do máximo são erros inline', async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} max={100} />);
    for (const [value, msg] of [
      ['', 'Preencha'],
      ['abc', 'número válido'],
      ['101', 'máximo'],
    ]) {
      await type(value);
      await act(async () => {
        fireEvent.click(save());
      });
      expect(screen.getByRole('alert')).toHaveTextContent(msg);
    }
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('validate() bloqueia com a mensagem dele', async () => {
    const onSubmit = vi.fn();
    render(
      <Harness
        onSubmit={onSubmit}
        validate={(v) => (typeof v === 'number' && v > 50 ? 'Soma passa de 100%' : null)}
      />,
    );
    await type('60');
    await act(async () => {
      fireEvent.click(save());
    });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Soma passa de 100%');
  });

  it('parseValue próprio (ex.: reserva em R$)', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(
      <Harness
        onSubmit={onSubmit}
        kind="currency"
        parseValue={(raw) => Number(raw.replace(/\D/g, '')) / 100}
      />,
    );
    await type('1.234,56');
    await act(async () => {
      fireEvent.click(save());
    });
    expect(onSubmit).toHaveBeenCalledWith(1234.56);
  });

  it('textarea: Enter quebra linha e não envia', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(<Harness onSubmit={onSubmit} kind="textarea" label="Observação" initialValue="a" />);
    const textarea = screen.getByLabelText('Observação');
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });
    fireEvent.change(textarea, { target: { value: 'linha 1\nlinha 2' } });
    expect(onSubmit).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(save());
    });
    expect(onSubmit).toHaveBeenCalledWith('linha 1\nlinha 2');
  });

  it("date devolve 'yyyy-mm-dd'", async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(
      <Harness onSubmit={onSubmit} kind="date" label="Vencimento" initialValue="2027-01-15" />,
    );
    const input = screen.getByLabelText('Vencimento');
    expect(input).toHaveAttribute('type', 'date');
    fireEvent.change(input, { target: { value: '2028-03-01' } });
    await act(async () => {
      fireEvent.click(save());
    });
    expect(onSubmit).toHaveBeenCalledWith('2028-03-01');
  });

  it('nunca salva no blur', async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    await type('33');
    fireEvent.blur(field());
    await waitFor(() => expect(onSubmit).not.toHaveBeenCalled());
  });
});
