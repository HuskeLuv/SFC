import { afterEach, describe, expect, it, vi } from 'vitest';

const mockPrisma = vi.hoisted(() => ({ userChangeLog: { findMany: vi.fn() } }));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

import {
  movidoInfoPorEntidade,
  originalPorEntidade,
  resumirMovido,
  resumirOriginal,
  type EventoMover,
} from '../movidoInfo';
import { MOVER_ACTIONS, type MoverSnapshotEstado } from '@/lib/carteiraMover';

afterEach(() => {
  vi.unstubAllEnvs();
  mockPrisma.userChangeLog.findMany.mockReset();
});

let t = 0;
const ev = (antes: MoverSnapshotEstado, depois: MoverSnapshotEstado): EventoMover => ({
  entityId: 'p-1',
  action: MOVER_ACTIONS.investimentoMover,
  createdAt: new Date(Date.UTC(2026, 9, 2, 12, t++)),
  viaConsultant: false,
  snapshot: { v: 1, kind: 'mover', data: antes, meta: { after: depois } },
});

const TESOURO = { symbol: 'TESOURO-SELIC-2031', type: 'tesouro-direto', currency: 'BRL' };
const CDB = { symbol: 'RENDA-FIXA-1', type: 'bond', currency: 'BRL' };

describe('movidoInfo com BaseCtx (fase 2, chave ligada)', () => {
  it('CDB da RF movido para a Emergência: original = RF, subgrupo null (seção derivada)', () => {
    vi.stubEnv('MOVER_CAIXA_RF_HABILITADO', 'true');
    const eventos = [
      ev({ categoriaOverride: null, objetivo: 0 }, { categoriaOverride: 'reservaEmergencia' }),
    ];
    expect(resumirMovido(eventos).movido).toBe(true);
    expect(resumirOriginal(eventos, { asset: CDB, tipo: 'posicao' })).toMatchObject({
      categoria: 'rendaFixaFundos',
      subgrupo: null,
    });
  });

  it('Tesouro de catálogo da Emergência movido para a RF: original = Emergência só com o ctx', () => {
    vi.stubEnv('MOVER_CAIXA_RF_HABILITADO', 'true');
    const eventos = [
      ev({ categoriaOverride: null, objetivo: 0 }, { categoriaOverride: 'rendaFixaFundos' }),
    ];
    const comCtx = resumirOriginal(eventos, {
      asset: TESOURO,
      tipo: 'posicao',
      baseCtx: { reservaDestino: 'emergencia' },
    });
    expect(comCtx).toMatchObject({ categoria: 'reservaEmergencia', subgrupo: null });
    // Sem o ctx a base seria a RF (override = base → não é movido de verdade).
    expect(resumirOriginal(eventos, { asset: TESOURO, tipo: 'posicao' })?.categoria).toBe(
      'rendaFixaFundos',
    );
  });

  it('originalPorEntidade e movidoInfoPorEntidade repassam o ctx', async () => {
    vi.stubEnv('MOVER_CAIXA_RF_HABILITADO', 'true');
    const eventos = [
      ev({ categoriaOverride: null, objetivo: 0 }, { categoriaOverride: 'rendaFixaFundos' }),
    ];
    mockPrisma.userChangeLog.findMany.mockResolvedValue(eventos);
    const original = await originalPorEntidade('u1', 'p-1', {
      asset: TESOURO,
      baseCtx: { reservaDestino: 'emergencia' },
    });
    expect(original?.categoria).toBe('reservaEmergencia');
    const optsDe = vi.fn(() => ({
      asset: TESOURO,
      baseCtx: { reservaDestino: 'emergencia' as const },
    }));
    const selos = await movidoInfoPorEntidade('u1', ['p-1'], optsDe);
    expect(selos.get('p-1')?.movido).toBe(true);
    expect(optsDe).toHaveBeenCalledWith('p-1');
  });

  it('chave desligada: o trio não tem aba base (categoria null, como na fase 1)', () => {
    vi.stubEnv('MOVER_CAIXA_RF_HABILITADO', 'false');
    const eventos = [
      ev({ categoriaOverride: null, objetivo: 0 }, { categoriaOverride: 'reservaEmergencia' }),
    ];
    expect(resumirOriginal(eventos, { asset: CDB, tipo: 'posicao' })).toMatchObject({
      categoria: null,
      subgrupo: null,
    });
  });
});
