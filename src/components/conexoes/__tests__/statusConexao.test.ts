import { describe, expect, it } from 'vitest';
import { rotuloConta, statusConexao, tempoRelativo, textoAvisos } from '../statusConexao';

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

  it('desconectada pelo banco pede reconexão; sucesso parcial vira aviso', () => {
    expect(statusConexao({ status: 'DELETED', lastSyncError: null })).toMatchObject({
      rotulo: 'Desconectada pelo banco',
      precisaReconectar: true,
    });
    expect(
      statusConexao({
        status: 'UPDATED',
        lastSyncError: null,
        avisos: [{ produto: 'investments', ultimaColeta: null }],
      }),
    ).toMatchObject({
      rotulo: 'Sincronizada, com avisos',
      cor: 'warning',
      precisaReconectar: false,
    });
  });

  it('texto dos avisos lista os produtos que não vieram', () => {
    expect(textoAvisos([])).toBeNull();
    expect(textoAvisos([{ produto: 'investments', ultimaColeta: null }])).toMatch(
      /^Investimentos não vieram na última atualização/,
    );
    expect(
      textoAvisos([
        { produto: 'investments', ultimaColeta: null },
        { produto: 'loans', ultimaColeta: null },
        { produto: 'identity', ultimaColeta: null },
      ]),
    ).toMatch(/^Investimentos, empréstimos e dados cadastrais não vieram/);
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
