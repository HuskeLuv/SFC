/**
 * Prévia do caixa no assistente de compra com o mover entre Reservas e Renda Fixa
 * (fase 2): com override (dado do servidor), vale a aba efetiva — inclusive sobre o
 * `tesouroDestino` do formulário. Sem override, a regra por tipo de sempre.
 */
import { describe, it, expect } from 'vitest';
import { abaDaCompra, abaDaCompraEfetiva } from '../caixaDaOperacao';
import type { WizardFormData } from '@/types/wizard';

const form = (over: Partial<WizardFormData>) =>
  ({ tipoAtivo: 'tesouro-direto', tesouroDestino: '', ...over }) as WizardFormData;

describe('abaDaCompraEfetiva — trio Reservas + Renda Fixa', () => {
  it('Tesouro comprado para a reserva, movido para a RF → caixa da RF', () => {
    const f = form({ tesouroDestino: 'reserva-emergencia' });
    expect(abaDaCompra(f)).toBeNull();
    expect(abaDaCompraEfetiva(f, { categoria: 'rendaFixaFundos', override: true })).toBe(
      'rendaFixa',
    );
  });

  it('Tesouro de RF movido para uma reserva → só o caixa livre', () => {
    const f = form({ tesouroDestino: 'renda-fixa-posfixada' });
    expect(abaDaCompra(f)).toBe('rendaFixa');
    expect(abaDaCompraEfetiva(f, { categoria: 'reservaOportunidade', override: true })).toBeNull();
    expect(abaDaCompraEfetiva(f, { categoria: 'reservaEmergencia', override: true })).toBeNull();
  });

  it('sem override (ou chave desligada no servidor): regra por tipo', () => {
    const f = form({ tesouroDestino: 'reserva-emergencia' });
    expect(abaDaCompraEfetiva(f, { categoria: 'reservaEmergencia', override: false })).toBeNull();
    expect(abaDaCompraEfetiva(f, { categoria: null, override: false })).toBeNull();
    expect(abaDaCompraEfetiva(form({}), null)).toBe('rendaFixa');
  });
});
