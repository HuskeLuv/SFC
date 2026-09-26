// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import EditableObjetivoCell from '../EditableObjetivoCell';
import EditableValorCell from '../EditableValorCell';
import EditableTextCell from '../EditableTextCell';
import { SAVE_ERROR_MESSAGE } from '@/components/ui/sheet/MobileEditSheet';

function stubMatchMedia(mobile: boolean) {
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

afterEach(() => {
  // @ts-expect-error — limpa o stub entre os testes
  delete window.matchMedia;
});

const fmtPct = (v: number) => `${v.toFixed(2).replace('.', ',')}%`;
const fmtBRL = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;

const campo = () => screen.getByRole('dialog').querySelector('input, textarea') as HTMLElement;
const salvar = () => fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

describe('EditableObjetivoCell no celular', () => {
  it("'12,5' chama onUpdateObjetivo(id, 12.5), fecha e mostra o aviso", async () => {
    stubMatchMedia(true);
    const onUpdate = vi.fn().mockResolvedValue(true);
    render(
      <EditableObjetivoCell
        ativoId="a1"
        objetivo={10}
        formatPercentage={fmtPct}
        onUpdateObjetivo={onUpdate}
        subject="BBAS3"
      />,
    );
    const editar = document.querySelector('[data-mf-edit="objetivo"]') as HTMLElement;
    expect(editar).toHaveAccessibleName(/Editar objetivo de BBAS3/);
    fireEvent.click(editar);
    expect(screen.getByRole('dialog', { name: 'Objetivo de BBAS3' })).toBeInTheDocument();
    fireEvent.change(campo(), { target: { value: '12,5' } });
    salvar();
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('a1', 12.5));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('status')).toHaveTextContent('Objetivo de BBAS3 salvo: 12,50%');
  });

  it('callback → false mantém o sheet aberto com o erro e o valor digitado', async () => {
    stubMatchMedia(true);
    const onUpdate = vi.fn().mockResolvedValue(false);
    render(
      <EditableObjetivoCell
        ativoId="a1"
        objetivo={10}
        formatPercentage={fmtPct}
        onUpdateObjetivo={onUpdate}
        subject="BBAS3"
      />,
    );
    fireEvent.click(document.querySelector('[data-mf-edit="objetivo"]')!);
    fireEvent.change(campo(), { target: { value: '7' } });
    salvar();
    await waitFor(() => expect(screen.getByText(SAVE_ERROR_MESSAGE)).toBeInTheDocument());
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(campo()).toHaveValue('7');
  });

  it('exceção também conta como falha; acima de 100 nem chama', async () => {
    stubMatchMedia(true);
    const onUpdate = vi.fn().mockRejectedValue(new Error('500'));
    render(
      <EditableObjetivoCell
        ativoId="a1"
        objetivo={10}
        formatPercentage={fmtPct}
        onUpdateObjetivo={onUpdate}
        subject="BBAS3"
      />,
    );
    fireEvent.click(document.querySelector('[data-mf-edit="objetivo"]')!);
    fireEvent.change(campo(), { target: { value: '150' } });
    salvar();
    expect(await screen.findByText(/valor máximo/)).toBeInTheDocument();
    expect(onUpdate).not.toHaveBeenCalled();
    fireEvent.change(campo(), { target: { value: '5' } });
    salvar();
    await waitFor(() => expect(screen.getByText(SAVE_ERROR_MESSAGE)).toBeInTheDocument());
  });

  it('sem Desfazer: o aviso não tem ação', async () => {
    stubMatchMedia(true);
    render(
      <EditableObjetivoCell
        ativoId="a1"
        objetivo={10}
        formatPercentage={fmtPct}
        onUpdateObjetivo={vi.fn().mockResolvedValue(true)}
        subject="BBAS3"
      />,
    );
    fireEvent.click(document.querySelector('[data-mf-edit="objetivo"]')!);
    salvar();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('salvo'));
    expect(screen.queryByRole('button', { name: /Desfazer/ })).toBeNull();
  });

  it('>= lg continua a edição inline de sempre (sem sheet)', () => {
    stubMatchMedia(false);
    const onUpdate = vi.fn();
    render(
      <EditableObjetivoCell
        ativoId="a1"
        objetivo={10}
        formatPercentage={fmtPct}
        onUpdateObjetivo={onUpdate}
      />,
    );
    expect(document.querySelector('[data-mf-edit]')).toBeNull();
    fireEvent.click(screen.getByText('10,00%'));
    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '12.5' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onUpdate).toHaveBeenCalledWith('a1', 12.5);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('EditableValorCell no celular', () => {
  it("'1.234,56' chama onUpdateValorAtualizado(id, 1234.56)", async () => {
    stubMatchMedia(true);
    const onUpdate = vi.fn().mockResolvedValue(true);
    render(
      <EditableValorCell
        ativoId="f1"
        valorAtualizado={1000}
        formatCurrency={fmtBRL}
        onUpdateValorAtualizado={onUpdate}
        subject="Fundo X"
      />,
    );
    fireEvent.click(document.querySelector('[data-mf-edit="valor"]')!);
    expect(campo()).toHaveValue('1.000,00');
    fireEvent.change(campo(), { target: { value: '1.234,56' } });
    salvar();
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('f1', 1234.56));
  });

  it('negativo não é enviado', async () => {
    stubMatchMedia(true);
    const onUpdate = vi.fn();
    render(
      <EditableValorCell
        ativoId="f1"
        valorAtualizado={1000}
        formatCurrency={fmtBRL}
        onUpdateValorAtualizado={onUpdate}
      />,
    );
    fireEvent.click(document.querySelector('[data-mf-edit="valor"]')!);
    fireEvent.change(campo(), { target: { value: '-5' } });
    salvar();
    expect(await screen.findByText(/valor mínimo/)).toBeInTheDocument();
    expect(onUpdate).not.toHaveBeenCalled();
  });
});

describe('EditableTextCell no celular', () => {
  it('envia o texto aparado e não envia se não mudou', async () => {
    stubMatchMedia(true);
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(
      <EditableTextCell
        ativoId="f1"
        value="D+1"
        onSubmit={onSubmit}
        subject="Fundo X"
        label="Liquidação"
      />,
    );
    const editar = document.querySelector('[data-mf-edit="texto"]') as HTMLElement;
    expect(editar).toHaveAccessibleName('Editar liquidação de Fundo X');
    fireEvent.click(editar);
    salvar();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.click(editar);
    fireEvent.change(campo(), { target: { value: '  D+30 ' } });
    salvar();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('f1', 'D+30'));
  });
});
