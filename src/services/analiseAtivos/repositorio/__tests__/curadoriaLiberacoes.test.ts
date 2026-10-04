/**
 * Bloco C — liberação da curadoria em grupo de escopo 'empresa' vale para os tickers irmãos.
 */
import { describe, expect, it } from 'vitest';
import {
  chaveLiberacao,
  conjuntoLiberacoes,
  expandirLiberacoesEmpresa,
} from '@/services/analiseAtivos/repositorio/curadoria';
import type { PrismaClient } from '@prisma/client';

const CNPJ = new Map([
  ['CELP3', 'C'],
  ['CELP5', 'C'],
  ['CELP6', 'C'],
  ['SBSP3', 'S'],
]);

describe('expandirLiberacoesEmpresa', () => {
  it('regra de escopo empresa (pl_minimo) libera a mesma chave em todos os tickers do CNPJ', () => {
    const out = expandirLiberacoesEmpresa(
      [{ symbol: 'CELP3', regraCodigo: 'pl_minimo', chaveDeteccao: '2026-06-30' }],
      CNPJ,
    ).map(chaveLiberacao);
    expect(out.sort()).toEqual([
      'CELP3|pl_minimo|2026-06-30',
      'CELP5|pl_minimo|2026-06-30',
      'CELP6|pl_minimo|2026-06-30',
    ]);
  });

  it('escopo ticker (desvio_mediana), revisão e símbolo sem CNPJ não expandem', () => {
    const libs = [
      { symbol: 'CELP3', regraCodigo: 'desvio_mediana', chaveDeteccao: '2026-08-25' },
      { symbol: 'CELP3', regraCodigo: 'variacao_lucro', chaveDeteccao: '2025' },
      { symbol: 'NOVO3', regraCodigo: 'pl_minimo', chaveDeteccao: '2026-06-30' },
    ];
    expect(expandirLiberacoesEmpresa(libs, CNPJ)).toEqual(libs);
  });

  it('conjuntoLiberacoes com o mapa de CNPJ expande; sem ele, fica por símbolo', async () => {
    const prisma = {
      analiseCasoDado: {
        findMany: async () => [
          { symbol: 'celp5', regraCodigo: 'acoes_escala:pl_minimo', chaveDeteccao: '2026-06-30' },
        ],
      },
    } as unknown as PrismaClient;
    expect([...(await conjuntoLiberacoes(prisma))]).toEqual(['CELP5|pl_minimo|2026-06-30']);
    expect([...(await conjuntoLiberacoes(prisma, CNPJ))].sort()).toEqual([
      'CELP3|pl_minimo|2026-06-30',
      'CELP5|pl_minimo|2026-06-30',
      'CELP6|pl_minimo|2026-06-30',
    ]);
  });
});
