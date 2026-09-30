import { createHash } from 'crypto';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { ErroFonte } from '@/services/analiseAtivos/fontes/erros';
import type { baixarParaArquivo } from '@/services/analiseAtivos/fontes/download';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import type { AlertaJob, JobContexto } from '@/services/analiseAtivos/tipos';
import { urlArquivoCvm } from '@/services/analiseAtivos/acoes/cvmArquivos';
import {
  sincronizarCvmCias,
  type DetalheArquivo,
  type OpcoesCvmCias,
} from '@/services/analiseAtivos/acoes/sincronizarCvmCias';
import { criarPrismaFake } from '@/services/analiseAtivos/acoes/__tests__/prismaFake';
import { zipDfp2025, zipFca, zipItr } from '@/services/analiseAtivos/acoes/__tests__/zipFixtures';

const dir = mkdtempSync(path.join(os.tmpdir(), 'sync-cvm-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const WEGE = '84.429.695/0001-11';
const BBAS = '00.000.000/0001-91';
const VALE = '33.592.510/0001-54';
const TAEE = '07.859.971/0001-30';

type Ctx = JobContexto & {
  contagem: Record<'linhasLidas' | 'linhasGravadas' | 'rejeitadas', number>;
  alertas: AlertaJob[];
};

function criarCtx(prisma: PrismaClient, extra: Partial<JobContexto> = {}): Ctx {
  const contagem = { linhasLidas: 0, linhasGravadas: 0, rejeitadas: 0 };
  const alertas: AlertaJob[] = [];
  return {
    prisma,
    prazo: Number.MAX_SAFE_INTEGER,
    restanteMs: () => 1e9,
    estourouPrazo: () => false,
    alertar: (a) => alertas.push(a),
    contar: (c, n = 1) => {
      contagem[c] += n;
    },
    params: SCORING_PARAMS_V1,
    paramsVersion: 1,
    hoje: '2026-09-30',
    origem: 'script',
    aplicar: true,
    ...extra,
    contagem,
    alertas,
  };
}

const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');

/** Download mockado: serve os zips montados, respeitando o condicional por sha256. */
function baixarMock(zips: Record<string, string>) {
  return vi.fn(async (url: string, opts: Parameters<typeof baixarParaArquivo>[1]) => {
    const caminho = zips[url];
    if (!caminho) throw new ErroFonte('http_erro', `404 ${url}`, 404);
    const s = sha(caminho);
    if (opts.condicional?.sha256 === s) {
      return {
        status: 'nao_modificado' as const,
        caminho: null,
        bytes: 0,
        etag: null,
        lastModified: null,
        sha256: s,
        descartar: async () => {},
      };
    }
    return {
      status: 'baixado' as const,
      caminho,
      bytes: readFileSync(caminho).length,
      etag: null,
      lastModified: null,
      sha256: s,
      descartar: async () => {},
    };
  });
}

function zipsPadrao(): Record<string, string> {
  return {
    [urlArquivoCvm('fca', 2026)]: zipFca(dir, 2026),
    [urlArquivoCvm('dfp', 2025)]: zipDfp2025(dir),
    [urlArquivoCvm('itr', 2025)]: zipItr(dir, 2025),
    [urlArquivoCvm('itr', 2026)]: zipItr(dir, 2026),
  };
}

async function rodar(
  prisma: PrismaClient,
  zips: Record<string, string>,
  opts: Omit<OpcoesCvmCias, 'baixar'>,
  extra: Partial<JobContexto> = {},
) {
  const ctx = criarCtx(prisma, extra);
  const baixar = baixarMock(zips);
  const r = await sincronizarCvmCias(ctx, { perfil: 'dev', ...opts, baixar });
  const arquivos = (r.detalhes?.arquivos ?? []) as DetalheArquivo[];
  return { ctx, r, arquivos, baixar };
}

/** FCA + DFP 2025 + ITR 2025 + ITR 2026 no banco fake. */
async function carregarTudo() {
  const fake = criarPrismaFake();
  const zips = zipsPadrao();
  await rodar(fake.prisma, zips, { doc: 'fca', anos: [2026] });
  await rodar(fake.prisma, zips, { doc: 'dfp', anos: [2025] });
  await rodar(fake.prisma, zips, { doc: 'itr', anos: [2025, 2026] });
  return { ...fake, zips };
}

const mi = (x: unknown) => Math.round(Number(String(x)) / 1e5) / 10;
const dia = (d: unknown) => (d as Date).toISOString().slice(0, 10);

describe('sincronizarCvmCias — FCA (cadastro e vigência de tickers)', () => {
  it('FCA 2025 e 2026 com o mesmo WEGE3→CNPJ ⇒ 1 linha em CvmCompanyTicker', async () => {
    const { prisma, tabelas } = criarPrismaFake();
    const zips = {
      [urlArquivoCvm('fca', 2025)]: zipFca(dir, 2025),
      [urlArquivoCvm('fca', 2026)]: zipFca(dir, 2026),
    };
    await rodar(prisma, zips, { doc: 'fca', anos: [2025] });
    await rodar(prisma, zips, { doc: 'fca', anos: [2026] });
    const wege = tabelas.cvmCompanyTicker.filter((t) => t.symbol === 'WEGE3');
    expect(wege).toHaveLength(1);
    expect(dia(wege[0].validFrom)).toBe('2007-06-22'); // Data_Inicio_Negociacao, não a data do FCA
    expect(wege[0].validTo).toBeNull();
    expect(tabelas.cvmCompanyTicker).toHaveLength(8);
    expect(tabelas.cvmCompany).toHaveLength(6);
    const mglu = tabelas.cvmCompanyTicker.find((t) => t.symbol === 'MGLU3')!;
    expect(mglu).toMatchObject({ classeTitulo: 'ON', classeFca: 'PN' });
    expect(tabelas.cvmCompanyTicker.find((t) => t.symbol === 'TAEE11')).toMatchObject({
      classeTitulo: 'UNIT',
      unitQtdOn: 1,
      unitQtdPn: 2,
    });
  });

  it('troca de CNPJ do ticker ⇒ fecha a vigência anterior e abre outra', async () => {
    const { prisma, tabelas } = criarPrismaFake();
    await rodar(prisma, { [urlArquivoCvm('fca', 2026)]: zipFca(dir, 2026) }, { doc: 'fca' });
    const trocado = zipFca(dir, 2026, (vm) =>
      vm.replace(`${WEGE};2026-01-01;1;`, `${TAEE};2026-01-01;1;`),
    );
    const { ctx } = await rodar(
      prisma,
      { [urlArquivoCvm('fca', 2026)]: trocado },
      { doc: 'fca' },
      { hoje: '2026-10-05' },
    );
    const wege = tabelas.cvmCompanyTicker
      .filter((t) => t.symbol === 'WEGE3')
      .sort((a, b) => (a.validFrom as Date).getTime() - (b.validFrom as Date).getTime());
    expect(wege).toHaveLength(2);
    expect(wege[0]).toMatchObject({ cnpj: WEGE });
    expect(dia(wege[0].validTo)).toBe('2026-10-05');
    expect(wege[1]).toMatchObject({ cnpj: TAEE, validTo: null });
    expect(dia(wege[1].validFrom)).toBe('2026-10-05');
    expect(ctx.alertas.map((a) => a.codigo)).toContain('ticker_trocou_emissor');
  });
});

describe('sincronizarCvmCias — DFP/ITR', () => {
  it('grava con E ind, layout financeiro, contagens (regra 10) e Raio-X do subconjunto dev', async () => {
    const { tabelas } = await carregarTudo();
    const fy = tabelas.assetFundamentalsPeriod.filter((l) => l.tipoPeriodo === 'FY');
    expect(
      fy
        .filter((l) => l.emissorId === BBAS)
        .map((l) => l.escopo)
        .sort(),
    ).toEqual(['con', 'ind']);
    const bbInd = fy.find((l) => l.emissorId === BBAS && l.escopo === 'ind')!;
    expect(bbInd).toMatchObject({ padraoContabil: 'BRGAAP', ebit: null });
    expect(bbInd.naoSeAplica).toContain('ebit');
    expect(tabelas.cvmCompany.find((c) => c.cnpj === BBAS)?.layoutFinanceiro).toBe(true);
    expect(tabelas.cvmCompany.find((c) => c.cnpj === WEGE)?.layoutFinanceiro).toBe(false);

    const vale = fy.find((l) => l.emissorId === VALE)!;
    expect(vale.versao).toBe(2);
    expect(dia(vale.dtEntregaOriginal)).toBe('2026-02-12');
    expect(dia(vale.dtEntrega)).toBe('2026-03-12');

    const contVale = tabelas.assetShareCount.find((c) => c.cnpj === VALE)!;
    expect(contVale.fonte).toBe('dfp_x1000');
    expect(Math.round(Number(String(contVale.total)) / 1e4) / 100).toBe(4268.78);
    const contWege = tabelas.assetShareCount.filter((c) => c.cnpj === WEGE);
    expect(contWege.map((c) => [dia(c.data), c.fonte]).sort()).toEqual([
      ['2025-03-31', 'itr'],
      ['2025-06-30', 'itr'],
      ['2025-09-30', 'itr'],
      ['2025-12-31', 'dfp'],
      ['2026-03-31', 'itr'],
      ['2026-06-30', 'itr'],
    ]);

    const raioX = tabelas.assetStatementLine;
    expect(raioX.some((l) => l.emissorId === WEGE && l.escopo === 'con')).toBe(true);
    expect(new Set(raioX.filter((l) => l.emissorId === BBAS).map((l) => l.escopo))).toEqual(
      new Set(['con', 'ind']),
    );
    expect(raioX.every((l) => l.tipoPeriodo === 'FY')).toBe(true);
  });

  it('TTM gravado: BBAS3 2T26 lucro atribuível 12.272 mi; WEGE3 2T26 receita 40.130,2 mi / lucro 6.254,1 mi', async () => {
    const { tabelas } = await carregarTudo();
    const ttm = (cnpj: string) =>
      tabelas.assetFundamentalsPeriod.find(
        (l) =>
          l.emissorId === cnpj &&
          l.tipoPeriodo === 'TTM' &&
          l.escopo === 'con' &&
          dia(l.dtFim) === '2026-06-30',
      )!;
    expect(mi(ttm(BBAS).lucroAtribuivel)).toBe(12272);
    expect(ttm(BBAS).flags).toContain('ttm_metodo_ytd');
    expect(mi(ttm(WEGE).receita)).toBe(40130.2);
    expect(mi(ttm(WEGE).lucroAtribuivel)).toBe(6254.1);
    expect(ttm(WEGE)).toMatchObject({ docTipo: 'ITR', anoFiscal: 2026, trimestreFiscal: 2 });
    expect(dia(ttm(WEGE).dtIni)).toBe('2025-07-01');
  });

  it('arquivo inalterado ⇒ 0 leituras (nem abre o zip)', async () => {
    const { prisma, zips } = await carregarTudo();
    const { ctx, arquivos, baixar } = await rodar(prisma, zips, { doc: 'itr', anos: [2026] });
    expect(arquivos[0].status).toBe('inalterado');
    expect(ctx.contagem.linhasLidas).toBe(0);
    expect(ctx.contagem.linhasGravadas).toBe(0);
    expect(baixar.mock.calls[0][1].condicional?.sha256).toBe(sha(zips[urlArquivoCvm('itr', 2026)]));
  });

  it('(cnpj, versão) já gravado ⇒ não reprocessa; rodar 2× ⇒ mesmas linhas (idempotente)', async () => {
    const { prisma, tabelas, zips } = await carregarTudo();
    const antes = Object.fromEntries(Object.entries(tabelas).map(([k, v]) => [k, v.length]));
    const { ctx, arquivos } = await rodar(prisma, zips, {
      doc: 'itr',
      anos: [2025, 2026],
      reprocessar: true,
    });
    expect(arquivos.map((a) => [a.status, a.pendentes])).toEqual([
      ['sem_pendentes', 0],
      ['sem_pendentes', 0],
    ]);
    expect(ctx.contagem.linhasGravadas).toBe(0);
    const depois = Object.fromEntries(Object.entries(tabelas).map(([k, v]) => [k, v.length]));
    expect(depois).toEqual(antes);
  });

  it('prazo estourado ⇒ parcial, nada gravado e arquivo NÃO marcado como processado; o run seguinte completa', async () => {
    const { prisma, tabelas } = criarPrismaFake();
    const zips = zipsPadrao();
    await rodar(prisma, zips, { doc: 'fca' });
    const parcial = await rodar(
      prisma,
      zips,
      { doc: 'dfp', anos: [2025] },
      { estourouPrazo: () => true },
    );
    expect(parcial.r.parcial).toBe(true);
    expect(parcial.arquivos[0].status).toBe('parcial');
    expect(tabelas.assetFundamentalsPeriod).toHaveLength(0);
    const fonte = tabelas.analiseFonteArquivo.find((f) => f.url === urlArquivoCvm('dfp', 2025))!;
    expect(fonte.processadoEm).toBeNull();

    const completo = await rodar(prisma, zips, { doc: 'dfp', anos: [2025] });
    expect(completo.arquivos[0].status).toBe('processado');
    expect(tabelas.assetFundamentalsPeriod.filter((l) => l.tipoPeriodo === 'FY').length).toBe(4);
    expect(
      tabelas.analiseFonteArquivo.find((f) => f.url === urlArquivoCvm('dfp', 2025))!.processadoEm,
    ).toBeInstanceOf(Date);
  });

  it('dry-run (aplicar=false) conta tudo e não escreve nada', async () => {
    const { prisma, tabelas, escritas } = criarPrismaFake();
    const zips = zipsPadrao();
    await rodar(prisma, zips, { doc: 'fca' });
    const n = escritas.n;
    const { arquivos } = await rodar(
      prisma,
      zips,
      { doc: 'dfp', anos: [2025] },
      { aplicar: false },
    );
    expect(arquivos[0]).toMatchObject({ status: 'processado', pendentes: 3 });
    expect(arquivos[0].fundamentos).toBe(4);
    expect(escritas.n).toBe(n);
    expect(tabelas.assetFundamentalsPeriod).toHaveLength(0);
  });

  it('sem tickers vigentes ⇒ alerta universo_vazio e não baixa nada', async () => {
    const { prisma } = criarPrismaFake();
    const { ctx, baixar } = await rodar(prisma, zipsPadrao(), { doc: 'dfp', anos: [2025] });
    expect(ctx.alertas.map((a) => a.codigo)).toEqual(['universo_vazio']);
    expect(baixar).not.toHaveBeenCalled();
  });
});

describe('sincronizarCvmCias — escala declarada errada (PDTC3 DFP 2024/2025)', () => {
  it('balanço anterior 1000× maior e LPA sem como conferir ⇒ valores ×1000 com escala_corrigida', async () => {
    // referência: WEGE3 DFP 2025 como publicado
    const normal = criarPrismaFake();
    const zips = zipsPadrao();
    await rodar(normal.prisma, zips, { doc: 'fca', anos: [2026] });
    await rodar(normal.prisma, zips, { doc: 'dfp', anos: [2025] });
    const fyWege = (t: typeof normal.tabelas) =>
      t.assetFundamentalsPeriod.find(
        (l) =>
          l.emissorId === WEGE &&
          l.tipoPeriodo === 'FY' &&
          l.escopo === 'con' &&
          dia(l.dtFim) === '2025-12-31',
      )!;
    const ref = fyWege(normal.tabelas);

    // mesmo DFP, mas o balanço de 2024 já gravado é 1000× o de 2025 (o 2025 "veio em milhares")
    const fake = criarPrismaFake();
    await rodar(fake.prisma, zips, { doc: 'fca', anos: [2026] });
    fake.tabelas.assetFundamentalsPeriod.push({
      id: 'vizinho-2024',
      emissorId: WEGE,
      escopo: 'con',
      tipoPeriodo: 'FY',
      docTipo: 'DFP',
      dtFim: new Date('2024-12-31T00:00:00Z'),
      versao: 1,
      ativoTotal: Number(String(ref.ativoTotal)) * 1000,
      pl: Number(String(ref.pl)) * 1000,
      flags: [],
    });
    const { ctx } = await rodar(fake.prisma, zips, { doc: 'dfp', anos: [2025] });
    const fy = fyWege(fake.tabelas);
    expect(fy.flags).toContain('escala_corrigida');
    expect(Number(String(fy.receita))).toBeCloseTo(Number(String(ref.receita)) * 1000, 0);
    expect(fy.lpaOn).toBe(ref.lpaOn);
    expect(fy.escalaOriginal).toBe(ref.escalaOriginal);
    expect(ctx.alertas.some((a) => a.codigo === 'escala_corrigida' && a.ref === WEGE)).toBe(true);
    // os outros emissores não mudam
    const vale = (t: typeof normal.tabelas) =>
      t.assetFundamentalsPeriod.find(
        (l) => l.emissorId === VALE && l.tipoPeriodo === 'FY' && l.escopo === 'con',
      )!;
    expect(vale(fake.tabelas).receita).toEqual(vale(normal.tabelas).receita);
    expect(vale(fake.tabelas).flags).not.toContain('escala_corrigida');
  });
});
