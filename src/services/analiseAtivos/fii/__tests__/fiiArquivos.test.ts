/**
 * obterArquivo (FII): dry-run não grava em AnaliseFonteArquivo (achado qa-operacao 30/09 —
 * backfill-fii sem --apply zerava o processadoEm e o cron seguinte reprocessava o arquivo inteiro).
 */
import { createHash } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { obterArquivo, urlInformeFii } from '@/services/analiseAtivos/fii/fiiArquivos';
import { sincronizarFiiMensal } from '@/services/analiseAtivos/fii/sincronizarFiiMensal';
import { sincronizarFiiTrimestral } from '@/services/analiseAtivos/fii/sincronizarFiiTrimestral';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import type { AlertaJob, JobContexto } from '@/services/analiseAtivos/tipos';
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

describe('virada do ano (M13): a CVM só cria o zip do ano no 1º informe', () => {
  const url2027 = urlInformeFii('trimestral', 2027);

  it('404 com naoPublicadoSe404 ⇒ status nao_publicado, sem caminho e sem gravar nada', async () => {
    const { prisma, analiseFonteArquivo } = criarPrisma();
    stubFetch({});
    const arq = await obterArquivo(prisma, url2027, { naoPublicadoSe404: true });
    expect(arq).toMatchObject({ status: 'nao_publicado', caminho: null, bytes: 0 });
    await arq.concluir('fii-trimestral');
    await arq.descartar();
    expect(analiseFonteArquivo.upsert).not.toHaveBeenCalled();
    expect(analiseFonteArquivo.update).not.toHaveBeenCalled();
  });

  it('404 sem a opção (ano já passado) continua erro', async () => {
    const { prisma } = criarPrisma();
    stubFetch({});
    await expect(obterArquivo(prisma, urlInformeFii('mensal', 2026))).rejects.toThrow(/404/);
  });

  it('500 continua erro mesmo com naoPublicadoSe404', async () => {
    const { prisma } = criarPrisma();
    stubFetch({ [url2027]: 500 });
    await expect(obterArquivo(prisma, url2027, { naoPublicadoSe404: true })).rejects.toThrow(/500/);
  });

  /** 2026 publicado e inalterado (sha256 igual ao gravado); 2027 ainda 404. */
  function cenario2027(tipo: 'mensal' | 'trimestral') {
    const corpo = Buffer.from(`zip ${tipo} 2026`);
    const sha256 = createHash('sha256').update(corpo).digest('hex');
    const analiseFonteArquivo = {
      findUnique: vi.fn(async ({ where }: { where: { url: string } }) =>
        where.url === urlInformeFii(tipo, 2026)
          ? { url: where.url, etag: null, lastModified: null, sha256, processadoEm: new Date() }
          : null,
      ),
      upsert: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
    };
    const prisma = {
      analiseFonteArquivo,
      fiiTipoOverride: { findMany: vi.fn(async () => []) },
    } as unknown as PrismaClient;
    stubFetch({ [urlInformeFii(tipo, 2026)]: corpo });
    const alertas: AlertaJob[] = [];
    const ctx: JobContexto = {
      prisma,
      prazo: Number.MAX_SAFE_INTEGER,
      restanteMs: () => 1e9,
      estourouPrazo: () => false,
      alertar: (a) => alertas.push(a),
      contar: () => {},
      params: SCORING_PARAMS_V1,
      paramsVersion: 1,
      hoje: '2027-01-01',
      origem: 'cron',
      aplicar: true,
    };
    return { ctx, alertas, analiseFonteArquivo };
  }

  it.each(['mensal', 'trimestral'] as const)(
    '01/01/2027, job fii-%s na janela do cron {2026, 2027}: 2027 = "não publicado" com aviso, sem falha',
    async (tipo) => {
      const { ctx, alertas, analiseFonteArquivo } = cenario2027(tipo);
      const job = tipo === 'mensal' ? sincronizarFiiMensal : sincronizarFiiTrimestral;
      const r = await job(ctx, { cnpjs: ['32892018000131'] });
      expect(r.parcial).toBe(false);
      expect(r.detalhes?.anos).toEqual([2026, 2027]);
      expect(r.detalhes?.arquivos).toEqual([
        { url: urlInformeFii(tipo, 2026), status: 'nao_modificado' },
        { url: urlInformeFii(tipo, 2027), status: 'nao_publicado' },
      ]);
      expect(alertas).toEqual([
        expect.objectContaining({
          codigo: 'arquivo_ano_nao_publicado',
          nivel: 'aviso',
          ref: urlInformeFii(tipo, 2027),
        }),
      ]);
      expect(analiseFonteArquivo.upsert).not.toHaveBeenCalled();
    },
  );
});
