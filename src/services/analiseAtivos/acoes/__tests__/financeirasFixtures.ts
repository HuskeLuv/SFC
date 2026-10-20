/**
 * A6, fatia B — apoio dos testes da ingestão CVM das financeiras. Fixtures: recortes REAIS dos dados
 * abertos da CVM (fixtures/financeiras/: DFP 2025, DFP 2022 e ITR 2025 de BBAS3, ITUB4, BPAC11,
 * SANB11, BBSE3, PSSA3, CXSE3, IRBR3 e WEGE3), montados em zip como a CVM publica.
 */
import { mkdtempSync, readFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { ErroFonte } from '@/services/analiseAtivos/fontes/erros';
import type { baixarParaArquivo } from '@/services/analiseAtivos/fontes/download';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import type { AlertaJob, JobContexto } from '@/services/analiseAtivos/tipos';
import {
  sincronizarCvmCias,
  type DetalheArquivo,
  type OpcoesCvmCias,
} from '@/services/analiseAtivos/acoes/sincronizarCvmCias';
import { criarPrismaFake } from '@/services/analiseAtivos/acoes/__tests__/prismaFake';
import { montarZip } from '@/services/analiseAtivos/acoes/__tests__/zipFixtures';

/** Pasta temporária dos zips (o teste apaga no afterAll). */
export const dirZips = mkdtempSync(path.join(os.tmpdir(), 'sync-cvm-fin-'));

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
export type Cia = keyof typeof CNPJ;

const SYMBOL: Record<Cia, string> = {
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

const SEGMENTO: Partial<Record<Cia, string>> = {
  BBAS: 'Bancos',
  ITUB: 'Bancos',
  BPAC: 'Bancos',
  SANB: 'Bancos',
  BBSE: 'Seguradoras',
  PSSA: 'Seguradoras',
  CXSE: 'Seguradoras',
  IRBR: 'Resseguradoras',
};

export function fx(nome: string): string {
  return readFileSync(path.join(__dirname, 'fixtures', 'financeiras', nome), 'utf8');
}
const cabecalho = (nome: string) => `${fx(nome).split('\n')[0]}\n`;

/** Universo (cnpj → symbols) das fixtures. */
export function universoFixtures(): Map<string, string[]> {
  return new Map((Object.keys(CNPJ) as Cia[]).map((k) => [CNPJ[k], [SYMBOL[k]]]));
}

/** AssetSetorB3 das fixtures (raiz → segmento), menos `fora`. */
export function setoresFixtures(fora: Cia[] = []): Array<Record<string, unknown>> {
  return (Object.keys(SEGMENTO) as Cia[])
    .filter((k) => !fora.includes(k))
    .map((k) => ({
      raiz: SYMBOL[k].slice(0, 4),
      setor: 'Financeiro',
      subsetor: 'x',
      segmento: SEGMENTO[k],
    }));
}

/**
 * DFP do ano com os recortes; `ajustar` muda o texto de uma entrada (ex.: trocar o CNPJ de um bloco
 * de linhas para simular uma industrial com o mesmo rótulo).
 */
export function zipDfpFin(
  ano: 2025 | 2022,
  o: { semDva?: boolean; nome?: string; ajustar?: (entrada: string, t: string) => string } = {},
): string {
  const e: Record<string, string> = {};
  const nome = (dem: string, esc: string) => `dfp_cia_aberta_${dem}_${esc}_${ano}.csv`;
  e[`dfp_cia_aberta_${ano}.csv`] = fx(`dfp_cia_aberta_${ano}.csv`);
  for (const dem of ['DRE', 'BPA', 'BPP']) {
    e[nome(dem, 'con')] = fx(nome(dem, 'con'));
    e[nome(dem, 'ind')] = ano === 2025 ? fx(nome(dem, 'ind')) : cabecalho(nome(dem, 'con'));
  }
  if (ano === 2025) {
    e[nome('DFC_MI', 'con')] = fx(nome('DFC_MI', 'con'));
    if (!o.semDva) {
      e[nome('DVA', 'con')] = fx(nome('DVA', 'con'));
      e[nome('DVA', 'ind')] = fx(nome('DVA', 'ind'));
    }
  }
  if (o.ajustar) for (const k of Object.keys(e)) e[k] = o.ajustar(k, e[k]);
  return montarZip(dirZips, o.nome ?? `dfp_cia_aberta_${ano}_${Math.random()}.zip`, e);
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
  return montarZip(dirZips, 'itr_cia_aberta_2025_fin.zip', e);
}

export type CtxFin = JobContexto & { alertas: AlertaJob[] };

export function criarCtx(prisma: PrismaClient, extra: Partial<JobContexto> = {}): CtxFin {
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

type LinhaFake = Record<string, unknown>;
export const num = (x: unknown) => (x === null || x === undefined ? null : Number(String(x)));
export const dia = (d: unknown) => (d as Date).toISOString().slice(0, 10);

export function linhaFund(
  tabelas: Record<string, LinhaFake[]>,
  cnpj: string,
  escopo: 'con' | 'ind',
  tipo: string,
  dtFim: string,
): LinhaFake | undefined {
  return tabelas.assetFundamentalsPeriod.find(
    (l) =>
      l.emissorId === cnpj &&
      l.escopo === escopo &&
      l.tipoPeriodo === tipo &&
      dia(l.dtFim) === dtFim,
  );
}

/** Restaura variáveis de ambiente mexidas pelo teste. */
export function guardarEnv(nomes: string[]): () => void {
  const antes = Object.fromEntries(nomes.map((n) => [n, process.env[n]]));
  return () => {
    for (const [n, v] of Object.entries(antes)) {
      if (v === undefined) delete process.env[n];
      else process.env[n] = v;
    }
  };
}
