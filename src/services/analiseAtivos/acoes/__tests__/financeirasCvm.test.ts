/**
 * A6, fatia B — ingestão CVM das financeiras (templates de banco e seguradora). Fixtures: recortes
 * REAIS dos dados abertos da CVM (fixtures/financeiras/: DFP 2025, DFP 2022 e ITR 2025 de BBAS3,
 * ITUB4, BPAC11, SANB11, BBSE3, PSSA3, CXSE3, IRBR3 e WEGE3), montados em zip como a CVM publica.
 */
import { mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
import { cnpjsFinanceirosPorSegmento } from '@/services/analiseAtivos/repositorio/universo';
import { criarPrismaFake } from '@/services/analiseAtivos/acoes/__tests__/prismaFake';
import { montarZip } from '@/services/analiseAtivos/acoes/__tests__/zipFixtures';
import { readFileSync } from 'fs';

const dir = mkdtempSync(path.join(os.tmpdir(), 'sync-cvm-fin-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

export const CNPJ = {
  BBAS: '00000000000191',
  ITUB: '60872504000123',
  BPAC: '30306294000145',
  SANB: '90400888000142',
  BBSE: '17344597000194',
  PSSA: '02149205000169',
  CXSE: '22543331000100',
  IRBR: '33376989000191',
  WEGE: '84429695000111',
} as const;

const SYMBOL: Record<keyof typeof CNPJ, string> = {
  BBAS: 'BBAS3',
  ITUB: 'ITUB4',
  BPAC: 'BPAC11',
  SANB: 'SANB11',
  BBSE: 'BBSE3',
  PSSA: 'PSSA3',
  CXSE: 'CXSE3',
  IRBR: 'IRBR3',
  WEGE: 'WEGE3',
};

const SEGMENTO: Partial<Record<keyof typeof CNPJ, string>> = {
  BBAS: 'Bancos',
  ITUB: 'Bancos',
  BPAC: 'Bancos',
  SANB: 'Bancos',
  BBSE: 'Seguradoras',
  PSSA: 'Seguradoras',
  CXSE: 'Seguradoras',
  IRBR: 'Resseguradoras',
};

function fx(nome: string): string {
  return readFileSync(path.join(__dirname, 'fixtures', 'financeiras', nome), 'utf8');
}
const cabecalho = (nome: string) => `${fx(nome).split('\n')[0]}\n`;

/** Universo (cnpj → symbols) das fixtures. */
export function universoFixtures(): Map<string, string[]> {
  return new Map(
    (Object.keys(CNPJ) as Array<keyof typeof CNPJ>).map((k) => [CNPJ[k], [SYMBOL[k]]]),
  );
}

/** AssetSetorB3 das fixtures (raiz → segmento). */
export function setoresFixtures(): Array<Record<string, unknown>> {
  return (Object.keys(SEGMENTO) as Array<keyof typeof CNPJ>).map((k) => ({
    raiz: SYMBOL[k].slice(0, 4),
    setor: 'Financeiro',
    subsetor: 'x',
    segmento: SEGMENTO[k],
  }));
}

export function zipDfpFin(ano: 2025 | 2022, semDva = false): string {
  const e: Record<string, string> = {};
  const nome = (dem: string, esc: string) => `dfp_cia_aberta_${dem}_${esc}_${ano}.csv`;
  e[`dfp_cia_aberta_${ano}.csv`] = fx(`dfp_cia_aberta_${ano}.csv`);
  for (const dem of ['DRE', 'BPA', 'BPP']) {
    e[nome(dem, 'con')] = fx(nome(dem, 'con'));
    e[nome(dem, 'ind')] = ano === 2025 ? fx(nome(dem, 'ind')) : cabecalho(nome(dem, 'con'));
  }
  if (ano === 2025) {
    e[nome('DFC_MI', 'con')] = fx(nome('DFC_MI', 'con'));
    if (!semDva) {
      e[nome('DVA', 'con')] = fx(nome('DVA', 'con'));
      e[nome('DVA', 'ind')] = fx(nome('DVA', 'ind'));
    }
  }
  return montarZip(dir, `dfp_cia_aberta_${ano}${semDva ? '_sem_dva' : ''}.zip`, e);
}

export function zipItrFin(): string {
  const e: Record<string, string> = {};
  e['itr_cia_aberta_2025.csv'] = fx('itr_cia_aberta_2025.csv');
  for (const dem of ['DRE', 'BPA', 'BPP', 'DVA']) {
    e[`itr_cia_aberta_${dem}_con_2025.csv`] = fx(`itr_cia_aberta_${dem}_con_2025.csv`);
  }
  for (const dem of ['DRE', 'BPA', 'BPP']) {
    e[`itr_cia_aberta_${dem}_ind_2025.csv`] = cabecalho(`itr_cia_aberta_${dem}_con_2025.csv`);
  }
  return montarZip(dir, 'itr_cia_aberta_2025_fin.zip', e);
}

type Ctx = JobContexto & { alertas: AlertaJob[] };

export function criarCtx(prisma: PrismaClient, extra: Partial<JobContexto> = {}): Ctx {
  const alertas: AlertaJob[] = [];
  return {
    prisma,
    prazo: Number.MAX_SAFE_INTEGER,
    restanteMs: () => 1e9,
    estourouPrazo: () => false,
    alertar: (a) => alertas.push(a),
    contar: () => {},
    params: SCORING_PARAMS_V1,
    paramsVersion: 1,
    hoje: '2026-10-19',
    origem: 'script',
    aplicar: true,
    ...extra,
    alertas,
  };
}

/** Download mockado: serve os zips montados (sem condicional). */
export function baixarMock(zips: Record<string, string>) {
  return vi.fn(async (url: string, _opts: Parameters<typeof baixarParaArquivo>[1]) => {
    const caminho = zips[url];
    if (!caminho) throw new ErroFonte('http_erro', `404 ${url}`, 404);
    return {
      status: 'baixado' as const,
      caminho,
      bytes: readFileSync(caminho).length,
      etag: null,
      lastModified: null,
      sha256: `${url}:${Math.random()}`,
      descartar: async () => {},
    };
  });
}

export async function rodarFin(
  prisma: PrismaClient,
  zips: Record<string, string>,
  opts: Omit<OpcoesCvmCias, 'baixar'>,
  extra: Partial<JobContexto> = {},
) {
  const ctx = criarCtx(prisma, extra);
  const r = await sincronizarCvmCias(ctx, {
    perfil: 'dev',
    universo: universoFixtures(),
    reprocessar: true,
    ...opts,
    baixar: baixarMock(zips),
  });
  return { ctx, r, arquivos: (r.detalhes?.arquivos ?? []) as DetalheArquivo[] };
}

/** Banco fake com o cadastro (AssetSetorB3) das fixtures. */
export function fakeComSetores(comSetores = true) {
  const fake = criarPrismaFake();
  if (comSetores) fake.tabelas.assetSetorB3.push(...setoresFixtures());
  return fake;
}

let envDva: string | undefined;
beforeEach(() => {
  envDva = process.env.ANALISE_ATIVOS_CVM_DVA;
});
afterEach(() => {
  if (envDva === undefined) delete process.env.ANALISE_ATIVOS_CVM_DVA;
  else process.env.ANALISE_ATIVOS_CVM_DVA = envDva;
});

describe('Set de CNPJs financeiros/seguradores (AssetSetorB3)', () => {
  it('bancos e seguradoras pelo segmento B3 da raiz; indústria fora', async () => {
    const { prisma } = fakeComSetores();
    const s = await cnpjsFinanceirosPorSegmento(prisma, universoFixtures());
    expect([...s.bancos].sort()).toEqual([CNPJ.BBAS, CNPJ.SANB, CNPJ.BPAC, CNPJ.ITUB].sort());
    expect([...s.seguradoras].sort()).toEqual([CNPJ.PSSA, CNPJ.BBSE, CNPJ.CXSE, CNPJ.IRBR].sort());
    expect(s.financeiras.size).toBe(8);
    expect(s.financeiras.has(CNPJ.WEGE)).toBe(false);
  });

  it('sem AssetSetorB3 ⇒ Sets vazios (comportamento de antes) e alerta das financeiras sem segmento', async () => {
    const { prisma, tabelas } = fakeComSetores(false);
    tabelas.cvmCompany.push({ cnpj: CNPJ.ITUB, layoutFinanceiro: true, mesFimExercicio: 12 });
    const s = await cnpjsFinanceirosPorSegmento(prisma, universoFixtures());
    expect(s.financeiras.size + s.bancos.size + s.seguradoras.size).toBe(0);
    const { ctx } = await rodarFin(
      prisma,
      { [urlArquivoCvm('dfp', 2025)]: zipDfpFin(2025) },
      {
        doc: 'dfp',
        anos: [2025],
      },
    );
    const a = ctx.alertas.find((x) => x.codigo === 'financeira_sem_segmento');
    expect(a?.nivel).toBe('info');
    expect(a?.mensagem).toContain(CNPJ.ITUB);
  });
});
