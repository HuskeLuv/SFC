import { describe, expect, it } from 'vitest';
import { STATUS_OPTIONS } from '../../utils';
import { sonhoSituacao } from '../sonhoSituacao';

describe('sonhoSituacao (só o status que a tabela já mostra, sem verde)', () => {
  it.each([
    ['Iniciado', 'No ritmo', 'ok'],
    ['Concluído', 'Concluído', 'ok'],
    ['Atrasado', 'Atrasado', 'atencao'],
    ['Pausado', 'Pausado', 'neutro'],
    ['Em espera', 'Em espera', 'neutro'],
  ] as const)('%s → %s (%s)', (status, label, tone) => {
    expect(sonhoSituacao({ status })).toEqual({ label, tone });
  });

  it('cobre todos os status do cadastro e nenhum é "problema" (vermelho)', () => {
    for (const status of STATUS_OPTIONS) {
      const s = sonhoSituacao({ status });
      expect(s.label).toBeTruthy();
      expect(s.tone).not.toBe('problema');
    }
  });
});
