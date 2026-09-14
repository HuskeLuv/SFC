import { describe, expect, it } from 'vitest';
import { rotuloConta, statusConexao, tempoRelativo } from '../statusConexao';

describe('statusConexao', () => {
  it('mapeia os status do item para rótulo/ação', () => {
    expect(statusConexao({ status: 'UPDATED', lastSyncError: null })).toMatchObject({
      rotulo: 'Sincronizada',
      cor: 'success',
      precisaReconectar: false,
    });
    expect(statusConexao({ status: 'UPDATED', lastSyncError: '429' }).cor).toBe('error');
    expect(statusConexao({ status: 'UPDATING', lastSyncError: null }).sincronizando).toBe(true);
    expect(statusConexao({ status: 'LOGIN_ERROR', lastSyncError: null }).precisaReconectar).toBe(
      true,
    );
    expect(
      statusConexao({ status: 'WAITING_USER_INPUT', lastSyncError: null }).precisaReconectar,
    ).toBe(true);
    expect(statusConexao({ status: 'OUTDATED', lastSyncError: null }).cor).toBe('error');
    expect(statusConexao({ status: 'X', lastSyncError: null }).rotulo).toBe('X');
  });

  it('rotula contas e cartões', () => {
    expect(rotuloConta({ type: 'CREDIT', subtype: 'CREDIT_CARD' })).toBe('Cartão de crédito');
    expect(rotuloConta({ type: 'BANK', subtype: 'SAVINGS_ACCOUNT' })).toBe('Poupança');
    expect(rotuloConta({ type: 'BANK', subtype: 'CHECKING_ACCOUNT' })).toBe('Conta corrente');
  });

  it('tempo relativo', () => {
    const agora = new Date('2026-09-14T12:00:00Z');
    expect(tempoRelativo(null, agora)).toBe('nunca');
    expect(tempoRelativo('2026-09-14T11:59:40Z', agora)).toBe('agora');
    expect(tempoRelativo('2026-09-14T11:55:00Z', agora)).toBe('há 5 min');
    expect(tempoRelativo('2026-09-14T09:00:00Z', agora)).toBe('há 3 h');
    expect(tempoRelativo('2026-09-12T12:00:00Z', agora)).toBe('há 2 dias');
    expect(tempoRelativo('2026-09-13T11:00:00Z', agora)).toBe('há 1 dia');
  });
});
