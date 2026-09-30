/**
 * obterArquivo (FII): dry-run não grava em AnaliseFonteArquivo (achado qa-operacao 30/09 —
 * backfill-fii sem --apply zerava o processadoEm e o cron seguinte reprocessava o arquivo inteiro).
 */
import type { PrismaClient } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { obterArquivo, urlInformeFii } from '@/services/analiseAtivos/fii/fiiArquivos';
import { stubFetch } from '@/services/analiseAtivos/b3/__tests__/helpers';

function criarPrisma() {
  const analiseFonteArquivo = {
    findUnique: vi.fn(async () => null),
    upsert: vi.fn(async () => ({})),
    update: vi.fn(async () => ({})),
  };
  return { prisma: { analiseFonteArquivo } as unknown as PrismaClient, analiseFonteArquivo };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fiiArquivos.obterArquivo', () => {
  const url = urlInformeFii('mensal', 2026);

  it('dry-run (aplicar=false): baixa, mas não grava nem marca processado', async () => {
    const { prisma, analiseFonteArquivo } = criarPrisma();
    stubFetch({ [url]: Buffer.from('PK zip de teste') });
    const arq = await obterArquivo(prisma, url, { aplicar: false });
    expect(arq.status).toBe('baixado');
    await arq.concluir('fii-mensal');
    await arq.descartar();
    expect(analiseFonteArquivo.upsert).not.toHaveBeenCalled();
    expect(analiseFonteArquivo.update).not.toHaveBeenCalled();
    // o condicional continua sendo LIDO (dry-run vê o mesmo "não modificado" do cron)
    expect(analiseFonteArquivo.findUnique).toHaveBeenCalled();
  });

  it('aplicar (padrão): registra o download e marca processado ao concluir', async () => {
    const { prisma, analiseFonteArquivo } = criarPrisma();
    stubFetch({ [url]: Buffer.from('PK zip de teste') });
    const arq = await obterArquivo(prisma, url, {});
    await arq.concluir('fii-mensal');
    await arq.descartar();
    expect(analiseFonteArquivo.upsert).toHaveBeenCalledTimes(1);
    expect(analiseFonteArquivo.update).toHaveBeenCalledTimes(1);
  });
});
