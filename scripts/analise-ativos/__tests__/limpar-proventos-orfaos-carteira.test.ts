/**
 * Script dos espelhos órfãos da Carteira (backtest 18/10/2026): dry-run não apaga, --apply apaga só
 * as órfãs e a 2ª execução não muda nada. Linhas reais de prod (17/10/2026, só leitura): PRIO3 e
 * FLRY3 com a irmã de data vizinha; banco em memória.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));

import {
  executarLimpezaOrfaos,
  type DepsOrfaos,
  type LinhaCarteira,
} from '../limpar-proventos-orfaos-carteira';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const linha = (
  id: string,
  userId: string,
  symbol: string,
  pag: string,
  tipo: string,
  valor: number,
): LinhaCarteira => ({
  id,
  userId,
  symbol,
  source: 'brapi',
  dismissed: false,
  tipo,
  dataPagamento: d(pag),
  valorTotal: valor,
  caixaCreditadoEm: null,
});

function banco() {
  let linhas: LinhaCarteira[] = [
    linha('p1', 'u1', 'PRIO3', '2023-12-21', 'DIVIDENDO', 363.22),
    linha('p2', 'u1', 'PRIO3', '2023-12-22', 'DIVIDENDO', 363.22),
    linha('f1', 'u2', 'FLRY3', '2023-05-30', 'JCP', 196.02),
    linha('f2', 'u2', 'FLRY3', '2023-04-28', 'JCP', 196.02),
  ];
  const historico: Record<string, { date: Date; tipo: string }[]> = {
    PRIO3: [{ date: d('2023-12-22'), tipo: 'DIVIDENDO' }],
    FLRY3: [{ date: d('2023-04-28'), tipo: 'JCP' }],
  };
  const deps: DepsOrfaos = {
    linhas: async (f) => linhas.filter((l) => !f || f.includes(l.symbol)),
    historico: async (s) => historico[s] ?? [],
    apagar: async (ids) => {
      const antes = linhas.length;
      linhas = linhas.filter((l) => !ids.includes(l.id));
      return antes - linhas.length;
    },
  };
  return { deps, ids: () => linhas.map((l) => l.id).sort() };
}

const opts = { filtro: null, hoje: d('2026-10-18'), amostra: 3 };

describe('limpar-proventos-orfaos-carteira', () => {
  it('dry-run lista as órfãs (2 linhas, 2 usuários, R$ 559,24) e não apaga nada', async () => {
    const b = banco();
    const r = await executarLimpezaOrfaos({ ...opts, aplicar: false }, b.deps);
    expect(r).toMatchObject({ simbolos: 2, apagar: 2, usuarios: 2, valor: 559.24, apagadas: 0 });
    expect(b.ids()).toEqual(['f1', 'f2', 'p1', 'p2']);
  });

  it('--apply apaga só as órfãs e a 2ª passada dá 0', async () => {
    const b = banco();
    const r = await executarLimpezaOrfaos({ ...opts, aplicar: true }, b.deps);
    expect(r.apagadas).toBe(2);
    expect(b.ids()).toEqual(['f2', 'p2']);
    const r2 = await executarLimpezaOrfaos({ ...opts, aplicar: true }, b.deps);
    expect(r2).toMatchObject({ apagar: 0, apagadas: 0 });
  });

  it('--symbols restringe aos símbolos pedidos', async () => {
    const b = banco();
    const r = await executarLimpezaOrfaos({ ...opts, filtro: ['PRIO3'], aplicar: true }, b.deps);
    expect(r.apagadas).toBe(1);
    expect(b.ids()).toEqual(['f1', 'f2', 'p2']);
  });
});
