/**
 * A6, fatia B — ingestão CVM das financeiras: Set de CNPJs pelo segmento B3 e DVA (PDD e receita de
 * intermediação) atrás de ANALISE_ATIVOS_CVM_DVA. Recortes reais da CVM (financeirasFixtures).
 */
import { rmSync } from 'fs';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import { urlArquivoCvm } from '@/services/analiseAtivos/acoes/cvmArquivos';
import {
  filtrarUniverso,
  montarLinhasTtm,
} from '@/services/analiseAtivos/acoes/sincronizarCvmCias';
import { zipFca } from '@/services/analiseAtivos/acoes/__tests__/zipFixtures';
import { cnpjsFinanceirosPorSegmento } from '@/services/analiseAtivos/repositorio/universo';
import {
  CNPJ,
  dirZips,
  fakeComSetores,
  guardarEnv,
  linhaFund,
  num,
  rodarFin,
  universoFixtures,
  zipDfpFin,
  zipItrFin,
} from '@/services/analiseAtivos/acoes/__tests__/financeirasFixtures';

afterAll(() => rmSync(dirZips, { recursive: true, force: true }));
let restaurar: () => void;
beforeEach(() => {
  restaurar = guardarEnv(['ANALISE_ATIVOS_CVM_DVA']);
});
afterEach(() => restaurar());

const dfp2025 = (o?: Parameters<typeof zipDfpFin>[1]) => ({
  [urlArquivoCvm('dfp', 2025)]: zipDfpFin(2025, o),
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
    const { ctx } = await rodarFin(prisma, dfp2025(), { doc: 'dfp', anos: [2025] });
    const a = ctx.alertas.find((x) => x.codigo === 'financeira_sem_segmento');
    expect(a?.nivel).toBe('info');
    expect(a?.mensagem).toContain(CNPJ.ITUB);
  });
});

describe('DVA das financeiras (ANALISE_ATIVOS_CVM_DVA)', () => {
  it('BB ind: 7.01.03 da DVA = 3.02.05 do DRE; ITUB con: PDD = 3.02.02 + 3.02.03; BPAC con = 3.01.02; SANB con com DVA', async () => {
    process.env.ANALISE_ATIVOS_CVM_DVA = 'true';
    const { prisma, tabelas } = fakeComSetores();
    await rodarFin(prisma, dfp2025(), { doc: 'dfp', anos: [2025] });
    const fy = (c: string, e: 'con' | 'ind') => linhaFund(tabelas, c, e, 'FY', '2025-12-31')!;
    expect(num(fy(CNPJ.BBAS, 'ind').pdd)).toBe(-65_649_161_000); // = DRE 3.02.05
    expect(num(fy(CNPJ.BBAS, 'ind').receitaIntermediacaoDva)).toBe(293_379_482_000);
    expect(num(fy(CNPJ.BBAS, 'con').pdd)).toBe(-66_633_285_000);
    expect(num(fy(CNPJ.ITUB, 'con').pdd)).toBe(-32_617_000_000 + 3_784_000_000);
    expect(num(fy(CNPJ.ITUB, 'con').receitaIntermediacaoDva)).toBe(339_378_000_000);
    expect(num(fy(CNPJ.BPAC, 'con').pdd)).toBe(-6_401_103_000); // = DRE 3.01.02
    expect(num(fy(CNPJ.SANB, 'con').pdd)).toBe(-29_539_862_000);
  });

  it('emissor não financeiro não lê a DVA, e nenhuma linha DVA vai para asset_statement_lines', async () => {
    process.env.ANALISE_ATIVOS_CVM_DVA = 'true';
    const { prisma, tabelas } = fakeComSetores();
    await rodarFin(prisma, dfp2025(), { doc: 'dfp', anos: [2025] });
    const wege = linhaFund(tabelas, CNPJ.WEGE, 'con', 'FY', '2025-12-31')!;
    expect(wege).toBeDefined();
    expect(wege.pdd ?? null).toBeNull();
    expect(wege.receitaIntermediacaoDva ?? null).toBeNull();
    expect(tabelas.assetStatementLine.length).toBeGreaterThan(0);
    expect(tabelas.assetStatementLine.some((l) => l.demonstrativo === 'DVA')).toBe(false);
    expect(tabelas.assetStatementLine.some((l) => String(l.cdConta).startsWith('7'))).toBe(false);
  });

  it('chave desligada ⇒ nenhuma PDD gravada (a DVA nem é lida)', async () => {
    delete process.env.ANALISE_ATIVOS_CVM_DVA;
    const { prisma, tabelas } = fakeComSetores();
    await rodarFin(prisma, dfp2025(), { doc: 'dfp', anos: [2025] });
    expect(tabelas.assetFundamentalsPeriod.length).toBeGreaterThan(0);
    expect(tabelas.assetFundamentalsPeriod.every((l) => (l.pdd ?? null) === null)).toBe(true);
  });

  it('chave ligada sem Set (AssetSetorB3 vazio) ⇒ nenhuma PDD (comportamento de antes)', async () => {
    process.env.ANALISE_ATIVOS_CVM_DVA = 'true';
    const { prisma, tabelas } = fakeComSetores(false);
    await rodarFin(prisma, dfp2025(), { doc: 'dfp', anos: [2025] });
    expect(tabelas.assetFundamentalsPeriod.every((l) => (l.pdd ?? null) === null)).toBe(true);
  });

  it('zip sem DVA (ano antigo) ⇒ segue sem PDD, sem falhar', async () => {
    process.env.ANALISE_ATIVOS_CVM_DVA = 'true';
    const { prisma, tabelas } = fakeComSetores();
    const { r } = await rodarFin(prisma, dfp2025({ semDva: true }), { doc: 'dfp', anos: [2025] });
    expect(r.parcial).toBeFalsy();
    expect(num(linhaFund(tabelas, CNPJ.ITUB, 'con', 'FY', '2025-12-31')!.pdd)).toBeNull();
  });

  it('ITR: PDD só no YTD (a DVA do ITR é acumulada); o 3M do 1º tri = YTD', async () => {
    process.env.ANALISE_ATIVOS_CVM_DVA = 'true';
    const { prisma, tabelas } = fakeComSetores();
    await rodarFin(
      prisma,
      { [urlArquivoCvm('itr', 2025)]: zipItrFin() },
      {
        doc: 'itr',
        anos: [2025],
      },
    );
    const pdd = (tipo: string, dt: string) =>
      num(linhaFund(tabelas, CNPJ.ITUB, 'con', tipo, dt)!.pdd);
    expect(pdd('YTD', '2025-09-30')).toBe(-24_879_000_000);
    expect(pdd('YTD', '2025-06-30')).toBe(-17_389_000_000);
    expect(pdd('3M', '2025-06-30')).toBeNull();
    expect(pdd('3M', '2025-03-31')).toBe(-9_558_000_000);
  });
});

describe('TTM da PDD a partir da DVA YTD (regra 14)', () => {
  it('FY anterior + YTD atual − YTD do ano anterior, sem mexer nas flags da linha', () => {
    const linha = (tipo: string, dtFim: string, pdd: number, receita: number) => ({
      id: `${tipo}${dtFim}`,
      emissorId: CNPJ.ITUB,
      escopo: 'con',
      versao: 1,
      flags: [] as string[],
      tipoPeriodo: tipo,
      dtFim: new Date(`${dtFim}T00:00:00Z`),
      dtIni: new Date(`${dtFim.slice(0, 4)}-01-01T00:00:00Z`),
      pdd,
      receita,
    });
    const periodos = [
      linha('FY', '2024-12-31', -30, 400),
      linha('YTD', '2024-09-30', -20, 300),
      linha('YTD', '2025-09-30', -25, 310),
    ];
    const [ttm] = montarLinhasTtm(
      periodos as never,
      new Map([[CNPJ.ITUB, 12]]),
      { params: SCORING_PARAMS_V1 },
      new Date(),
    );
    expect(Number(ttm.pdd)).toBe(-35); // −30 + (−25) − (−20)
    expect(Number(ttm.receita)).toBe(410);
    expect(ttm.flags).toEqual(['ttm_metodo_ytd']);
  });
});

describe('--somente-financeiras e --tickers (backfill)', () => {
  it('somenteFinanceiras: DFP só dos CNPJs do Set (a indústria não é relida)', async () => {
    const { prisma, tabelas } = fakeComSetores();
    await rodarFin(prisma, dfp2025(), { doc: 'dfp', anos: [2025], somenteFinanceiras: true });
    const emissores = new Set(tabelas.assetFundamentalsPeriod.map((l) => l.emissorId));
    expect(emissores.has(CNPJ.WEGE)).toBe(false);
    expect(emissores.has(CNPJ.ITUB)).toBe(true);
    expect(emissores.has(CNPJ.BBSE)).toBe(true);
  });

  it('somenteTickers: DFP só dos CNPJs dos tickers pedidos', async () => {
    const { prisma, tabelas } = fakeComSetores();
    await rodarFin(prisma, dfp2025(), {
      doc: 'dfp',
      anos: [2025],
      somenteTickers: ['itub4', 'BBSE3'],
    });
    expect(new Set(tabelas.assetFundamentalsPeriod.map((l) => l.emissorId))).toEqual(
      new Set([CNPJ.ITUB, CNPJ.BBSE]),
    );
    // recorte não marca o arquivo como processado (o resto dele segue pendente para o cron)
    expect(tabelas.analiseFonteArquivo).toHaveLength(0);
    expect(filtrarUniverso(universoFixtures()).size).toBe(universoFixtures().size);
  });

  it('FCA recortado (--tickers) grava só o recorte e não fecha os tickers de fora', async () => {
    const { prisma, tabelas } = fakeComSetores();
    tabelas.cvmCompanyTicker.push({
      id: 'x',
      symbol: 'ZZZZ3',
      cnpj: '11111111000111',
      classeTitulo: 'ON',
      validFrom: new Date('2020-01-01T00:00:00Z'),
      validTo: null,
      origem: 'fca',
    });
    await rodarFin(
      prisma,
      { [urlArquivoCvm('fca', 2026)]: zipFca(dirZips, 2026) },
      {
        doc: 'fca',
        anos: [2026],
        somenteTickers: ['WEGE3'],
      },
    );
    const abertos = tabelas.cvmCompanyTicker.filter((t) => t.validTo === null);
    expect(abertos.map((t) => t.symbol).sort()).toEqual(['WEGE3', 'ZZZZ3']);
    expect(tabelas.cvmCompany.map((c) => c.cnpj)).toEqual([CNPJ.WEGE]);
  });
});
