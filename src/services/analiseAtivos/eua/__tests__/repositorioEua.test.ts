/**
 * fundamentei-regras F3 (A2.d): remuneração em ações (SBC) na comparação de versão da SEC —
 * idempotência com ANALISE_ATIVOS_SEC_SBC desligada e ligada (Prisma em memória, fixtures
 * recortadas dos companyfacts da SEC, sem rede).
 *
 * - desligada: a impressão digital é a de hoje (SBC fora dos valores e dos conceitos), nenhuma linha
 *   grava remuneracaoAcoes e duas rodadas seguidas = 0 versões novas;
 * - ligada: os FY com SBC ganham versao+1 UMA vez; a 2ª rodada = 0 (SELECT_VERSAO_SEC lê a coluna);
 * - desligar de novo depois de ligar = 0 versões novas.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CompanyFactsSec } from '@/services/analiseAtivos/eua/extrairFundamentosSec';
import { processarCikSec } from '@/services/analiseAtivos/eua/jobs/secFundamentos';
import {
  COLUNAS_VALOR_SEC,
  colunasValorSec,
  impressaoPeriodoSec,
} from '@/services/analiseAtivos/repositorio/eua';
import { criarPrismaFakeEua } from './prismaFakeEua';

const FIX = path.join(__dirname, 'fixtures');
const cf = (nome: string): CompanyFactsSec =>
  JSON.parse(readFileSync(path.join(FIX, 'companyfacts', `${nome}.json`), 'utf8'));
const O_CIK = '726728';
const rodar = (prisma: Parameters<typeof processarCikSec>[0], incluirSbc?: boolean) =>
  processarCikSec(prisma, O_CIK, {
    cf: cf('O'),
    anoMinimo: 2014,
    aplicar: true,
    ...(incluirSbc === undefined ? {} : { incluirSbc }),
  });

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Impressão de hoje (antes da F3), reescrita aqui para conferir byte a byte. */
function impressaoLegada(p: Parameters<typeof impressaoPeriodoSec>[0]): string {
  const valores = COLUNAS_VALOR_SEC.map((c) => (p[c] === null ? '' : String(p[c])));
  const conceitos = Object.keys(p.sourceConcept)
    .sort()
    .map((k) => `${k}=${p.sourceConcept[k]}`);
  return [
    p.anoFiscal,
    p.dtIni,
    valores.join(','),
    p.dpaOrigem ?? '',
    [...p.flags].sort().join(','),
    conceitos.join(';'),
  ].join('|');
}

const base = {
  ...(Object.fromEntries(COLUNAS_VALOR_SEC.map((c, i) => [c, i * 10])) as Record<
    (typeof COLUNAS_VALOR_SEC)[number],
    number | null
  >),
  anoFiscal: 2024,
  dtIni: '2024-01-01',
  dpaOrigem: 'cash_paid',
  sourceConcept: { receita: 'Revenues', fco: 'NetCashProvidedByUsedInOperatingActivities' },
  flags: ['ebitda_lucro'],
};

describe('impressão digital da SEC com a SBC', () => {
  it('desligada: idêntica à de hoje, mesmo com SBC no FY ou o conceito gravado', () => {
    expect(impressaoPeriodoSec(base)).toBe(impressaoLegada(base));
    const comSbc = {
      ...base,
      remuneracaoAcoes: 57_493_000,
      sourceConcept: { ...base.sourceConcept, remuneracaoAcoes: 'ShareBasedCompensation' },
    };
    expect(impressaoPeriodoSec(comSbc)).toBe(impressaoLegada(base));
    expect(impressaoPeriodoSec(comSbc, { incluirSbc: false })).toBe(impressaoLegada(base));
    expect(colunasValorSec()).toBe(COLUNAS_VALOR_SEC);
  });

  it('ligada: SBC no fim dos valores e o conceito nos conceitos; SBC nula = campo vazio', () => {
    const comSbc = {
      ...base,
      remuneracaoAcoes: 57_493_000,
      sourceConcept: { ...base.sourceConcept, remuneracaoAcoes: 'ShareBasedCompensation' },
    };
    const on = impressaoPeriodoSec(comSbc, { incluirSbc: true });
    expect(on).not.toBe(impressaoLegada(base));
    expect(on.split('|')[2].split(',').pop()).toBe('57493000');
    expect(on).toContain('remuneracaoAcoes=ShareBasedCompensation');
    expect(colunasValorSec({ incluirSbc: true })).toEqual([
      ...COLUNAS_VALOR_SEC,
      'remuneracaoAcoes',
    ]);
    const nula = impressaoPeriodoSec({ ...base, remuneracaoAcoes: null }, { incluirSbc: true });
    expect(nula.split('|')[2].split(',').pop()).toBe('');
  });
});

describe('sec-fundamentos com a SBC (idempotência)', () => {
  it('chave desligada (env ausente): nada de SBC gravado e 2ª rodada = 0 versões', async () => {
    vi.stubEnv('ANALISE_ATIVOS_SEC_SBC', '');
    const { prisma, tabelas } = criarPrismaFakeEua();
    const r1 = await rodar(prisma);
    expect(r1.novasVersoes).toBe(r1.periodos);
    expect(r1.periodos).toBeGreaterThan(10);
    for (const l of tabelas.assetFundamentalsPeriod) {
      expect('remuneracaoAcoes' in l).toBe(false);
      expect((l.sourceConcept as Record<string, string>).remuneracaoAcoes).toBeUndefined();
    }
    const r2 = await rodar(prisma);
    expect(r2.novasVersoes).toBe(0);
  });

  it('ligar depois de hoje: versao+1 só nos FY com SBC, uma vez; 2ª rodada = 0', async () => {
    const { prisma, tabelas } = criarPrismaFakeEua();
    const hoje = await rodar(prisma, false);
    const linhasHoje = tabelas.assetFundamentalsPeriod.length;

    vi.stubEnv('ANALISE_ATIVOS_SEC_SBC', 'true');
    const on1 = await rodar(prisma); // lê a chave
    expect(on1.novasVersoes).toBe(hoje.periodos); // O informa a SBC em todo FY da fixture
    const v2 = tabelas.assetFundamentalsPeriod.filter((l) => l.versao === 2);
    expect(v2).toHaveLength(on1.novasVersoes);
    const fy24 = v2.find((l) => l.anoFiscal === 2024)!;
    expect(String(fy24.remuneracaoAcoes)).toBe('57493000');
    expect((fy24.sourceConcept as Record<string, string>).remuneracaoAcoes).toBe(
      'ShareBasedCompensation',
    );

    const on2 = await rodar(prisma);
    expect(on2.novasVersoes).toBe(0);
    expect(tabelas.assetFundamentalsPeriod).toHaveLength(linhasHoje + on1.novasVersoes);

    // desligar de novo (reverter = desligar a chave): nenhuma versão nova
    vi.stubEnv('ANALISE_ATIVOS_SEC_SBC', 'false');
    const off = await rodar(prisma);
    expect(off.novasVersoes).toBe(0);
  });

  it('ligada com SBC ausente no 10-K: null e nenhuma versão nova sobre a de hoje', async () => {
    const { prisma, tabelas } = criarPrismaFakeEua();
    const semSbc = cf('O');
    delete semSbc.facts['us-gaap'].ShareBasedCompensation;
    delete semSbc.facts['us-gaap'].AllocatedShareBasedCompensationExpense;
    const opts = { cf: semSbc, anoMinimo: 2014, aplicar: true };
    await processarCikSec(prisma, O_CIK, { ...opts, incluirSbc: false });
    const on = await processarCikSec(prisma, O_CIK, {
      ...opts,
      cf: JSON.parse(JSON.stringify(semSbc)),
      incluirSbc: true,
    });
    expect(on.novasVersoes).toBe(0);
    expect(tabelas.assetFundamentalsPeriod.every((l) => l.versao === 1)).toBe(true);
  });

  it('dois companyfacts iguais com a chave ligada desde o início: 2ª rodada = 0', async () => {
    const { prisma, tabelas } = criarPrismaFakeEua();
    const r1 = await rodar(prisma, true);
    const r2 = await rodar(prisma, true);
    expect(r1.novasVersoes).toBe(r1.periodos);
    expect(r2.novasVersoes).toBe(0);
    expect(tabelas.assetFundamentalsPeriod.every((l) => l.remuneracaoAcoes !== null)).toBe(true);
  });
});
