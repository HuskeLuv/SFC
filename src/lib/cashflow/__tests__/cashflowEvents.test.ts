// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import {
  emitCashflowFlash,
  emitOpenLancamento,
  onCashflowFlash,
  onOpenLancamento,
} from '../cashflowEvents';

describe('cashflowEvents', () => {
  it('flash chega a quem ouve e para depois do unsubscribe', () => {
    const cb = vi.fn();
    const off = onCashflowFlash(cb);
    emitCashflowFlash({ itemId: 'i1', year: 2026, month: 6 });
    expect(cb).toHaveBeenCalledWith({ itemId: 'i1', year: 2026, month: 6 });
    off();
    emitCashflowFlash({ itemId: 'i2', year: 2026, month: 7 });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('abrir o lançamento rápido', () => {
    const cb = vi.fn();
    const off = onOpenLancamento(cb);
    emitOpenLancamento();
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    emitOpenLancamento();
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
