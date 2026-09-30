import AdmZip from 'adm-zip';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErroLayoutFonte } from '@/services/analiseAtivos/fontes/erros';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import type { AlertaJob, JobContexto } from '@/services/analiseAtivos/tipos';

const m = vi.hoisted(() => ({ baixar: vi.fn() }));
vi.mock('@/services/analiseAtivos/fontes/download', () => ({ baixarParaArquivo: m.baixar }));

import { sincronizarIpe } from '@/services/analiseAtivos/eventos/sincronizarIpe';

const FIXTURE = readFileSync(
  path.join(__dirname, '../../regras/eventos/__tests__/fixtures/ipe_cia_aberta_2026_amostra.csv'),
);
const LINHAS = FIXTURE.toString('latin1').split(/\r?\n/).filter(Boolean);
const CABECALHO = LINHAS[0];

const BB = '00.000.000/0001-91'; // como a fatia A grava (máscara da CVM)
const WEG = '84.429.695/0001-11';
const AGORA = new Date('2026-09-30T09:25:00Z');

const dir = mkdtempSync(path.join(os.tmpdir(), 'ipe-sync-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let seq = 0;
/** cria <dir>/<sub>/ipe_cia_aberta_<ano>.zip com as linhas dadas (por ano); devolve o diretório */
function zipIpe(linhas: string[], porAno: Record<number, string[]> = {}): string {
  const sub = path.join(dir, `c${++seq}`);
  for (const [ano, ls] of Object.entries({ 2026: linhas, ...porAno })) {
    if (ls.length === 0) continue;
    const zip = new AdmZip();
    zip.addFile(`ipe_cia_aberta_${ano}.csv`, Buffer.from(`${ls.join('\r\n')}\r\n`, 'latin1'));
    zip.writeZip(path.join(sub, `ipe_cia_aberta_${ano}.zip`));
  }
  return sub;
}

// --- prisma falso em memória (só o que o job usa) ---------------------------------------------
interface Ev {
  id: string;
  cnpj: string;
  tipo: string;
  subtipo: string;
  periodoRef: string | null;
  chave: string;
  data: Date;
  estimado: boolean;
  substituidoEm: Date | null;
  assunto: string | null;
  sourceUrl: string | null;
  sourceDocId: string | null;
  versao: number | null;
  fetchedAt: Date;
}

function criarPrisma() {
  const eventos: Ev[] = [];
  let ids = 0;
  const tickers: Array<{ symbol: string; cnpj: string; classeTitulo: string }> = [];
  const fundamentos: Array<Record<string, unknown>> = [];
  const escritas = { create: 0, update: 0, delete: 0, updateMany: 0 };
  const inIds = (w: { id: { in: string[] } }) => new Set(w.id.in);
  const prisma = {
    cvmCompanyTicker: {
      findMany: vi.fn(async () =>
        tickers.map((t) => ({ ...t, unitQtdOn: null, unitQtdPn: null, validTo: null })),
      ),
    },
    assetFundamentalsPeriod: { findMany: vi.fn(async () => fundamentos) },
    analiseFonteArquivo: {
      findUnique: vi.fn(async () => null),
      upsert: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
    },
    assetEvento: {
      findMany: vi.fn(
        async ({ where }: { where: { tipo: { in: string[] }; cnpj: { in: string[] } } }) =>
          eventos
            .filter((e) => where.tipo.in.includes(e.tipo) && where.cnpj.in.includes(e.cnpj))
            .map((e) => ({ ...e })),
      ),
      createMany: vi.fn(async ({ data }: { data: Array<Omit<Ev, 'id' | 'substituidoEm'>> }) => {
        let count = 0;
        for (const d of data) {
          if (eventos.some((e) => e.cnpj === d.cnpj && e.tipo === d.tipo && e.chave === d.chave))
            continue;
          eventos.push({ ...d, id: `ev${++ids}`, substituidoEm: null });
          count++;
        }
        escritas.create += count;
        return { count };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Ev> }) => {
        const e = eventos.find((x) => x.id === where.id)!;
        Object.assign(e, data);
        escritas.update++;
        return e;
      }),
      deleteMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => {
        const alvo = inIds(where);
        const antes = eventos.length;
        for (let i = eventos.length - 1; i >= 0; i--)
          if (alvo.has(eventos[i].id)) eventos.splice(i, 1);
        escritas.delete += antes - eventos.length;
        return { count: antes - eventos.length };
      }),
      updateMany: vi.fn(
        async ({ where, data }: { where: { id: { in: string[] } }; data: Partial<Ev> }) => {
          const alvo = inIds(where);
          let count = 0;
          for (const e of eventos) {
            if (alvo.has(e.id) && e.substituidoEm === null) {
              Object.assign(e, data);
              count++;
            }
          }
          escritas.updateMany += count;
          return { count };
        },
      ),
    },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return { prisma, eventos, tickers, fundamentos, escritas };
}

function criarCtx(prisma: unknown, aplicar = true) {
  const alertas: AlertaJob[] = [];
  const cont = { linhasLidas: 0, linhasGravadas: 0, rejeitadas: 0 };
  const ctx: JobContexto = {
    prisma: prisma as PrismaClient,
    prazo: Date.now() + 60_000,
    restanteMs: () => 60_000,
    estourouPrazo: () => false,
    alertar: (a) => alertas.push(a),
    contar: (c, n = 1) => {
      cont[c] += n;
    },
    params: SCORING_PARAMS_V1,
    paramsVersion: 1,
    hoje: '2026-09-30',
    origem: 'script',
    aplicar,
  };
  return { ctx, alertas, cont };
}

function fundamento(docTipo: 'ITR' | 'DFP', dtFim: string, entrega: string, tri: number | null) {
  return {
    emissorId: WEG,
    docTipo,
    dtFim: new Date(`${dtFim}T00:00:00Z`),
    anoFiscal: Number(dtFim.slice(0, 4)),
    trimestreFiscal: tri,
    dtEntregaOriginal: new Date(`${entrega}T00:00:00Z`),
  };
}

const ENTREGAS_WEG = [
  fundamento('ITR', '2025-03-31', '2025-04-30', 1),
  fundamento('ITR', '2025-06-30', '2025-07-23', 2),
  fundamento('ITR', '2025-09-30', '2025-10-22', 3),
  fundamento('DFP', '2025-12-31', '2026-02-25', 4),
  fundamento('ITR', '2026-03-31', '2026-04-29', 1),
  fundamento('ITR', '2026-06-30', '2026-07-22', 2),
];

let db: ReturnType<typeof criarPrisma>;
beforeEach(() => {
  vi.clearAllMocks();
  db = criarPrisma();
  db.tickers.push(
    { symbol: 'BBAS3', cnpj: BB, classeTitulo: 'ON' },
    { symbol: 'WEGE3', cnpj: WEG, classeTitulo: 'ON' },
  );
});

describe('sincronizarIpe — assembleias', () => {
  it('grava 1 assembleia por (cnpj, subtipo, data) só dos emissores do universo', async () => {
    const { ctx, cont } = criarCtx(db.prisma);
    const r = await sincronizarIpe(ctx, {
      cacheDir: zipIpe(LINHAS),
      agora: AGORA,
      resultados: false,
    });

    const ass = db.eventos.filter((e) => e.tipo === 'assembleia');
    expect(ass.map((e) => [e.cnpj, e.chave, e.estimado]).sort()).toEqual([
      [BB, 'AGO/AGE:2026-04-29', false],
      [WEG, 'AGO:2026-04-23', false],
    ]);
    const weg = ass.find((e) => e.cnpj === WEG)!;
    expect(weg).toMatchObject({ subtipo: 'AGO', versao: 1 });
    expect(weg.sourceDocId).toMatch(/^005410IPE/);
    expect(weg.sourceUrl).toMatch(/^https:\/\/www\.rad\.cvm\.gov\.br\//);
    expect(weg.data.toISOString().slice(0, 10)).toBe('2026-04-23');

    const assembleiaLinhas = LINHAS.filter((l) => l.includes(';Assembleia;')).length;
    expect(cont.linhasLidas).toBe(assembleiaLinhas);
    expect(cont.rejeitadas).toBe(1); // a linha com data 3026
    expect(cont.linhasGravadas).toBe(2);
    const arq = (r.detalhes!.arquivos as Array<Record<string, unknown>>)[0];
    expect(arq).toMatchObject({ origem: 'cache', emissoresUniverso: 2, assembleiasUniverso: 2 });
    expect(arq.emissoresNoArquivo).toBeGreaterThan(2);
    // arquivo do cache não passa pelo registro de download
    expect(db.prisma.analiseFonteArquivo.upsert).not.toHaveBeenCalled();
  });

  it('idempotente: segunda rodada com o mesmo arquivo não escreve nada', async () => {
    const cache = zipIpe(LINHAS);
    await sincronizarIpe(criarCtx(db.prisma).ctx, {
      cacheDir: cache,
      agora: AGORA,
      resultados: false,
    });
    const antes = { ...db.escritas };
    const r = await sincronizarIpe(criarCtx(db.prisma).ctx, {
      cacheDir: cache,
      agora: AGORA,
      resultados: false,
    });
    expect(db.escritas).toEqual(antes);
    expect(r.detalhes!.assembleias).toMatchObject({
      criados: 0,
      atualizados: 0,
      removidos: 0,
      inalterados: 2,
    });
  });

  it('versão nova do protocolo remarcando a data: evento antigo sai, novo entra', async () => {
    const edital = LINHAS.find((l) => l.startsWith('84.429.695') && l.includes(';AGO;Edital'))!;
    await sincronizarIpe(criarCtx(db.prisma).ctx, {
      cacheDir: zipIpe([CABECALHO, edital]),
      agora: AGORA,
      resultados: false,
    });
    const v2 = edital.replace(';2026-04-23;', ';2026-04-30;').replace(/;1;(https:[^;]*)$/, ';2;$1');
    expect(v2).not.toBe(edital);
    await sincronizarIpe(criarCtx(db.prisma).ctx, {
      cacheDir: zipIpe([CABECALHO, v2]),
      agora: AGORA,
      resultados: false,
    });
    expect(db.eventos.map((e) => [e.chave, e.versao])).toEqual([['AGO:2026-04-30', 2]]);
  });

  it('mesma assembleia no IPE de dois anos (Edital em 2025, Ata em 2026): não alterna o documento-base', async () => {
    const weg = LINHAS.filter((l) => l.startsWith('84.429.695') && l.includes(';Assembleia;'));
    const edital = weg.find((l) => l.includes(';Edital'))!;
    const ata = weg.find((l) => l.includes(';Ata;'))!;
    const cache = zipIpe([CABECALHO, ata], { 2025: [CABECALHO, edital] });
    const opts = { cacheDir: cache, anos: [2025, 2026], agora: AGORA, resultados: false };
    await sincronizarIpe(criarCtx(db.prisma).ctx, opts);
    expect(db.eventos).toHaveLength(1);
    const protocoloEdital = edital.split(';')[10];
    expect(db.eventos[0].sourceDocId).toBe(protocoloEdital);
    const antes = { ...db.escritas };
    await sincronizarIpe(criarCtx(db.prisma).ctx, opts);
    expect(db.escritas).toEqual(antes);
    expect(db.eventos[0].sourceDocId).toBe(protocoloEdital);
  });

  it('dry-run (aplicar=false): calcula o plano e não grava nada', async () => {
    const { ctx, cont } = criarCtx(db.prisma, false);
    const r = await sincronizarIpe(ctx, {
      cacheDir: zipIpe(LINHAS),
      agora: AGORA,
      resultados: false,
    });
    expect(db.eventos).toHaveLength(0);
    expect(db.prisma.assetEvento.createMany).not.toHaveBeenCalled();
    expect(cont.linhasGravadas).toBe(0);
    expect(r.detalhes!.assembleias).toMatchObject({ criados: 2 });
  });

  it('header sem Data_Referencia ⇒ ErroLayoutFonte (o wrapper transforma em falha com alerta)', async () => {
    const semData = CABECALHO.replace('Data_Referencia', 'Dt_Ref');
    await expect(
      sincronizarIpe(criarCtx(db.prisma).ctx, {
        cacheDir: zipIpe([semData, ...LINHAS.slice(1)]),
        agora: AGORA,
      }),
    ).rejects.toBeInstanceOf(ErroLayoutFonte);
    expect(db.eventos).toHaveLength(0);
  });

  it('universo vazio (fatia A não rodou): alerta, não grava e não marca o arquivo processado', async () => {
    db.tickers.length = 0;
    m.baixar.mockResolvedValue({
      status: 'baixado',
      caminho: path.join(zipIpe(LINHAS), 'ipe_cia_aberta_2026.zip'),
      bytes: FIXTURE.length,
      etag: '"abc"',
      lastModified: null,
      sha256: 'f'.repeat(64),
      descartar: vi.fn(async () => {}),
    });
    const { ctx, alertas } = criarCtx(db.prisma);
    await sincronizarIpe(ctx, { agora: AGORA });
    expect(alertas.map((a) => a.codigo)).toContain('universo_vazio');
    expect(db.eventos).toHaveLength(0);
    expect(db.prisma.analiseFonteArquivo.upsert).toHaveBeenCalledTimes(1);
    expect(db.prisma.analiseFonteArquivo.update).not.toHaveBeenCalled();
  });

  it('download: URL da CVM do ano corrente; arquivo inalterado (ETag) é pulado', async () => {
    m.baixar.mockResolvedValue({
      status: 'nao_modificado',
      caminho: null,
      bytes: 0,
      etag: '"abc"',
      lastModified: null,
      sha256: null,
      descartar: vi.fn(),
    });
    const r = await sincronizarIpe(criarCtx(db.prisma).ctx, { agora: AGORA, resultados: false });
    expect(m.baixar.mock.calls[0][0]).toBe(
      'https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/IPE/DADOS/ipe_cia_aberta_2026.zip',
    );
    expect(m.baixar.mock.calls[0][1]).toMatchObject({ maxBytes: 150_000_000 });
    expect(r.detalhes!.arquivos).toEqual([
      { ano: 2026, url: expect.any(String), status: 'nao_modificado' },
    ]);
  });

  it('download baixado com universo: registra e marca processado; apaga o arquivo temporário', async () => {
    const descartar = vi.fn(async () => {});
    m.baixar.mockResolvedValue({
      status: 'baixado',
      caminho: path.join(zipIpe(LINHAS), 'ipe_cia_aberta_2026.zip'),
      bytes: FIXTURE.length,
      etag: '"abc"',
      lastModified: null,
      sha256: 'f'.repeat(64),
      descartar,
    });
    await sincronizarIpe(criarCtx(db.prisma).ctx, { agora: AGORA, resultados: false });
    expect(db.prisma.analiseFonteArquivo.update).toHaveBeenCalledTimes(1);
    expect(descartar).toHaveBeenCalledTimes(1);
  });
});

describe('sincronizarIpe — datas de resultado', () => {
  it('reais nas datas de entrega + estimados dos próximos documentos (WEG em 30/09/2026)', async () => {
    db.fundamentos.push(...ENTREGAS_WEG);
    const { ctx } = criarCtx(db.prisma);
    const r = await sincronizarIpe(ctx, { cacheDir: zipIpe([CABECALHO]), agora: AGORA });

    const reais = db.eventos.filter((e) => e.tipo === 'resultado' && e.cnpj === WEG);
    expect(reais.map((e) => [e.chave, e.data.toISOString().slice(0, 10)])).toContainEqual([
      '2026-2T',
      '2026-07-22',
    ]);
    const est = db.eventos
      .filter((e) => e.tipo === 'resultado_estimado')
      .map((e) => [e.subtipo, e.chave, e.data.toISOString().slice(0, 10), e.estimado]);
    expect(est).toEqual([
      ['ITR3', '2026-3T', '2026-10-22', true],
      ['DFP', '2026-FY', '2027-02-25', true],
      ['ITR1', '2027-1T', '2027-04-29', true],
      ['ITR2', '2027-2T', '2027-07-22', true],
    ]);
    expect(r.detalhes!.resultados).toMatchObject({ emissoresComEstimativa: 1 });
  });

  it("entrega real do 3T26 chega ⇒ grava 'resultado' e marca substituidoEm no estimado", async () => {
    db.fundamentos.push(...ENTREGAS_WEG);
    const cache = zipIpe([CABECALHO]);
    await sincronizarIpe(criarCtx(db.prisma).ctx, { cacheDir: cache, agora: AGORA });
    const estimado = db.eventos.find(
      (e) => e.tipo === 'resultado_estimado' && e.chave === '2026-3T',
    )!;
    expect(estimado.substituidoEm).toBeNull();

    db.fundamentos.push(fundamento('ITR', '2026-09-30', '2026-10-21', 3));
    const depois = new Date('2026-10-21T09:25:00Z');
    await sincronizarIpe(criarCtx(db.prisma).ctx, { cacheDir: cache, agora: depois });

    expect(estimado.substituidoEm).toEqual(depois);
    expect(estimado.data.toISOString().slice(0, 10)).toBe('2026-10-22'); // estimado preservado
    const real = db.eventos.find((e) => e.tipo === 'resultado' && e.chave === '2026-3T')!;
    expect(real).toMatchObject({ estimado: false, subtipo: 'ITR3' });
    expect(real.data.toISOString().slice(0, 10)).toBe('2026-10-21');
    // o 3T27 passa a ser o próximo esperado
    expect(db.eventos.some((e) => e.tipo === 'resultado_estimado' && e.chave === '2027-3T')).toBe(
      true,
    );
  });

  it('sem entrega anterior (fundamentos vazios) ⇒ sem estimativa e alerta sem_entregas', async () => {
    const { ctx, alertas } = criarCtx(db.prisma);
    await sincronizarIpe(ctx, { cacheDir: zipIpe([CABECALHO]), agora: AGORA });
    expect(db.eventos.filter((e) => e.tipo !== 'assembleia')).toHaveLength(0);
    expect(alertas.map((a) => a.codigo)).toContain('sem_entregas');
  });
});
