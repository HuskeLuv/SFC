import { createHash } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { URL_CLASSIF_SETORIAL } from '@/services/analiseAtivos/b3/b3Arquivos';
import {
  lerClassifSetorial,
  sincronizarB3Cadastro,
} from '@/services/analiseAtivos/b3/sincronizarB3Cadastro';
import { ErroFonte, ErroLayoutFonte } from '@/services/analiseAtivos/fontes/erros';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import type { AlertaJob, JobContexto } from '@/services/analiseAtivos/tipos';
import { CLASSIF_TRECHOS, stubFetch } from './helpers';

/** .xlsx montado a partir dos trechos REAIS do ClassifSetorial (mesmas linhas/colunas B..G). */
function xlsx(linhas: unknown[][]): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), 'Planilha');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

type Setor = { raiz: string; presenteUltimoArquivo: boolean; [k: string]: unknown };

function criarPrisma(iniciais: Setor[] = [], fonte: Record<string, unknown> | null = null) {
  const setores = new Map(iniciais.map((s) => [s.raiz, { ...s }]));
  const assetSetorB3 = {
    findMany: vi.fn(async () => [...setores.values()]),
    createMany: vi.fn(async ({ data }: { data: Setor[] }) => {
      for (const d of data) setores.set(d.raiz, { ...d });
      return { count: data.length };
    }),
    update: vi.fn(async ({ where, data }: { where: { raiz: string }; data: Setor }) => {
      setores.set(where.raiz, { ...setores.get(where.raiz)!, ...data });
    }),
    updateMany: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { raiz?: { in: string[] }; presenteUltimoArquivo?: boolean };
        data: object;
      }) => {
        let n = 0;
        for (const [k, s] of setores) {
          const ok = where.raiz
            ? where.raiz.in.includes(k)
            : s.presenteUltimoArquivo === where.presenteUltimoArquivo;
          if (ok) {
            setores.set(k, { ...s, ...data });
            n++;
          }
        }
        return { count: n };
      },
    ),
  };
  const prisma = {
    assetSetorB3,
    analiseFonteArquivo: {
      findUnique: vi.fn(async () => fonte),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
  };
  return { prisma, setores };
}

function criarCtx(prisma: unknown) {
  const alertas: AlertaJob[] = [];
  const ctx: JobContexto = {
    prisma: prisma as PrismaClient,
    prazo: Date.now() + 60_000,
    restanteMs: () => 60_000,
    estourouPrazo: () => false,
    alertar: (a) => alertas.push(a),
    contar: () => {},
    params: SCORING_PARAMS_V1,
    paramsVersion: 1,
    hoje: '2026-10-04',
    origem: 'cron',
    aplicar: true,
  };
  return { ctx, alertas };
}

afterEach(() => vi.unstubAllGlobals());

describe('lerClassifSetorial', () => {
  it('lê o .xlsx e aplica o parser (WEGE, ITUB, SIMH)', () => {
    const s = new Map(lerClassifSetorial(xlsx(CLASSIF_TRECHOS)).map((x) => [x.raiz, x]));
    expect(s.get('WEGE')?.segmento).toBe('Motores, Compressores e Outros');
    expect(s.get('ITUB')?.segmento).toBe('Bancos');
    expect(s.get('SIMH')?.segmento).toBe('Holdings Diversificadas');
  });

  it('arquivo que não é planilha ⇒ ErroLayoutFonte', () => {
    expect(() => lerClassifSetorial(Buffer.from('<html>erro</html>'))).toThrow(ErroLayoutFonte);
  });
});

describe('sincronizarB3Cadastro', () => {
  it('1ª carga: grava todas as raízes, sem alerta de raiz nova', async () => {
    const { prisma, setores } = criarPrisma();
    stubFetch({ [URL_CLASSIF_SETORIAL]: xlsx(CLASSIF_TRECHOS) });
    const { ctx, alertas } = criarCtx(prisma);
    const r = await sincronizarB3Cadastro(ctx);
    expect(setores.size).toBeGreaterThan(60);
    expect(setores.get('WEGE')).toMatchObject({
      setor: 'Bens Industriais',
      subsetor: 'Máquinas e Equipamentos',
      presenteUltimoArquivo: true,
    });
    expect(alertas).toEqual([]);
    expect(r.detalhes).toMatchObject({ primeiraCarga: true, novas: setores.size });
    expect(prisma.analiseFonteArquivo.update).toHaveBeenCalledTimes(1);
  });

  it('raiz que sumiu ⇒ presenteUltimoArquivo=false + aviso; raiz nova ⇒ info', async () => {
    const { prisma, setores } = criarPrisma([
      { raiz: 'OIBR', presenteUltimoArquivo: true, setor: 'Comunicações' },
    ]);
    const semSimh = CLASSIF_TRECHOS.filter((l) => !(l as string[]).includes('SIMH'));
    stubFetch({ [URL_CLASSIF_SETORIAL]: xlsx(semSimh) });
    const { ctx, alertas } = criarCtx(prisma);
    await sincronizarB3Cadastro(ctx);
    expect(setores.get('OIBR')?.presenteUltimoArquivo).toBe(false);
    expect(setores.has('SIMH')).toBe(false);
    expect(alertas.filter((a) => a.codigo === 'raiz_sumida')).toEqual([
      expect.objectContaining({ nivel: 'aviso', ref: 'OIBR' }),
    ]);
    expect(alertas.filter((a) => a.codigo === 'raiz_nova').length).toBeGreaterThan(0);
    expect(alertas.find((a) => a.codigo === 'raiz_nova')?.nivel).toBe('info');
  });

  it('segmento alterado na B3 ⇒ regrava só aquela raiz', async () => {
    const { prisma } = criarPrisma();
    stubFetch({ [URL_CLASSIF_SETORIAL]: xlsx(CLASSIF_TRECHOS) });
    await sincronizarB3Cadastro(criarCtx(prisma).ctx);
    prisma.assetSetorB3.update.mockClear();
    const alterado = CLASSIF_TRECHOS.map((l) =>
      (l as string[]).includes('ITUB')
        ? (l as string[]).map((c) => (c === 'Nível 1' ? 'Nível 2' : c))
        : l,
    );
    stubFetch({ [URL_CLASSIF_SETORIAL]: xlsx(alterado) });
    await sincronizarB3Cadastro(criarCtx(prisma).ctx);
    expect(prisma.assetSetorB3.update).toHaveBeenCalledTimes(1);
    expect(prisma.assetSetorB3.update.mock.calls[0][0]).toMatchObject({
      where: { raiz: 'ITUB' },
      data: { segmentoListagem: 'Nível 2' },
    });
  });

  it('sha256 igual ao último processado ⇒ não reprocessa, só confirma o frescor', async () => {
    const buf = xlsx(CLASSIF_TRECHOS);
    const sha256 = createHash('sha256').update(buf).digest('hex');
    const { prisma } = criarPrisma([{ raiz: 'WEGE', presenteUltimoArquivo: true }], {
      url: URL_CLASSIF_SETORIAL,
      etag: null,
      lastModified: null,
      bytes: BigInt(buf.length),
      sha256,
      baixadoEm: new Date(),
      processadoEm: new Date(),
      jobUltimo: 'b3-cadastro',
    });
    stubFetch({ [URL_CLASSIF_SETORIAL]: buf });
    const r = await sincronizarB3Cadastro(criarCtx(prisma).ctx);
    expect(r.detalhes).toMatchObject({ confirmadas: 1 });
    expect(prisma.assetSetorB3.createMany).not.toHaveBeenCalled();
  });

  it('planilha com menos da metade das raízes do cadastro ⇒ ErroFonte (não marca o mercado como sumido)', async () => {
    const muitas = Array.from({ length: 200 }, (_, i) => ({
      raiz: `R${String(i).padStart(3, '0')}`,
      presenteUltimoArquivo: true,
    }));
    const { prisma, setores } = criarPrisma(muitas);
    stubFetch({ [URL_CLASSIF_SETORIAL]: xlsx(CLASSIF_TRECHOS) });
    await expect(sincronizarB3Cadastro(criarCtx(prisma).ctx)).rejects.toBeInstanceOf(ErroFonte);
    expect([...setores.values()].every((s) => s.presenteUltimoArquivo)).toBe(true);
  });

  it('.xlsx que infla além do teto ⇒ ErroFonte antes do XLSX.read (achado zip bomb)', async () => {
    const { prisma } = criarPrisma();
    // ~21 MB de célula repetida comprime para poucos KB (cabe no maxBytes do download)
    const wb = XLSX.utils.book_new();
    const linhas = [...CLASSIF_TRECHOS, ...Array.from({ length: 700 }, () => ['y'.repeat(30_000)])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), 'Planilha');
    const grande = XLSX.write(wb, {
      type: 'buffer',
      bookType: 'xlsx',
      compression: true,
    }) as Buffer;
    expect(grande.length).toBeLessThan(1_000_000);
    stubFetch({ [URL_CLASSIF_SETORIAL]: grande });
    await expect(sincronizarB3Cadastro(criarCtx(prisma).ctx)).rejects.toMatchObject({
      codigo: 'zip_corrompido',
    });
    expect(prisma.assetSetorB3.createMany).not.toHaveBeenCalled();
  });
});
