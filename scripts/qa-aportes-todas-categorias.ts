/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * QA PROD — semeia UM aporte por categoria da linha "Aporte/Resgate" no
 * qa.teste (FII, ETF, BDR, REIT, cripto, renda fixa, tesouro, fundo,
 * previdência, reservas, moeda, personalizado) e, após CADA aporte, verifica:
 *   1. a categoria aparece em /api/cashflow/investimentos no mês esperado;
 *   2. a série da Evolução do Patrimônio NÃO muda (aporte é descontado do
 *      Fluxo de Caixa Livre no mesmo mês — patrimônio só muda de bolso).
 *
 * Fora do escopo (por desenho): Imóveis Físicos (criação não passa por
 * /api/carteira/operacao), Conta Corrente ('cash') e Outros (buckets de
 * fluxos específicos/fallback).
 *
 * Uso (EC2, DENTRO do release atual):
 *   DATABASE_URL=... SFC_BASE_URL=http://localhost:3000 \
 *     npx --no-install tsx scripts/qa-aportes-todas-categorias.ts
 */
import prisma from '../src/lib/prisma';
import { computeEvolucaoDoMes } from '../src/services/cashflow/evolucaoPatrimonioServer';

const BASE_URL = process.env.SFC_BASE_URL || 'http://localhost:3000';
const EMAIL = process.env.QA_EMAIL || 'qa.teste@appmyfinance.com.br';
const PASSWORD = process.env.QA_PASSWORD || 'QaTeste@2026';
const YEAR = 2026;

const cookies: Record<string, string> = {};
function captureCookies(headers: Headers) {
  const anyH = headers as unknown as { getSetCookie?: () => string[] };
  const list =
    typeof anyH.getSetCookie === 'function'
      ? anyH.getSetCookie()
      : (headers.get('set-cookie') ?? '').split(/,(?=\s*[A-Za-z0-9_-]+=)/);
  for (const raw of list) {
    if (!raw) continue;
    const [pair] = raw.trim().split(';');
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    cookies[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
}
const cookieHeader = () =>
  Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
async function api(path: string, init: { method?: string; body?: unknown; csrf?: boolean } = {}) {
  const headers: Record<string, string> = { Cookie: cookieHeader() };
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  if (init.csrf && cookies['csrf-token']) headers['x-csrf-token'] = cookies['csrf-token'];
  const res = await fetch(`${BASE_URL}${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  captureCookies(res.headers);
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* */
  }
  return { status: res.status, ok: res.ok, json, text };
}
const num = (x: any) => {
  const n = typeof x === 'string' ? parseFloat(x) : Number(x);
  return Number.isFinite(n) ? n : 0;
};

let PASS = 0;
const FAILS: string[] = [];
const ok = (cond: boolean, pass: string, fail: string) => {
  if (cond) {
    PASS++;
    console.log(`  ✓ ${pass}`);
  } else {
    FAILS.push(fail);
    console.log(`  ✗ ${fail}`);
  }
};

async function login() {
  const res = await api('/api/auth/login', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD },
  });
  if (!res.ok) throw new Error(`login falhou: ${res.status}`);
  await api('/api/profile');
  if (!cookies['csrf-token']) await api('/api/carteira/acoes');
  if (!cookies['csrf-token']) throw new Error('csrf ausente');
}
async function instId(search: string): Promise<string> {
  const r = await api(`/api/institutions?search=${encodeURIComponent(search)}&limit=5`);
  const id = r.json?.institutions?.[0]?.id;
  if (!id) throw new Error(`instituição ${search} não achada`);
  return id;
}
async function assetIdOf(tipo: string, searches: string[]): Promise<string | null> {
  for (const s of searches) {
    const r = await api(
      `/api/assets?tipo=${encodeURIComponent(tipo)}&search=${encodeURIComponent(s)}&limit=5`,
    );
    const list: any[] = r.json?.assets ?? [];
    const exact = list.find((a) => a.symbol?.toUpperCase() === s.toUpperCase());
    const id = (exact ?? list[0])?.id;
    if (id) return id;
  }
  return null;
}
async function serieEvolucao(uid: string): Promise<number[]> {
  return Promise.all(Array.from({ length: 12 }, (_, m) => computeEvolucaoDoMes(uid, YEAR, m)));
}
async function invMatrix(): Promise<Map<string, number[]>> {
  const inv = (await api(`/api/cashflow/investimentos?year=${YEAR}`)).json ?? {};
  const map = new Map<string, number[]>();
  for (const cat of inv.investimentos ?? []) {
    const a = Array(12).fill(0);
    for (const v of cat.values ?? []) a[num(v.month)] = num(v.value);
    map.set(cat.name, a);
  }
  return map;
}

async function main() {
  console.log(`→ base=${BASE_URL} conta=${EMAIL} ano=${YEAR}\n`);
  const user = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true } });
  if (!user) throw new Error('qa.teste não existe');
  const uid = user.id;
  await login();

  const xp = await instId('XP');
  const btg = await instId('BTG');
  const itau = await instId('Itaú');
  const avenue = await instId('Avenue');

  const hglg = await assetIdOf('fii', ['HGLG11']);
  const bova = await assetIdOf('etf', ['BOVA11', 'IVVB11']);
  const bdr = await assetIdOf('bdr', ['AAPL34', 'MSFT34', 'AMZO34']);
  const btc = await assetIdOf('criptoativo', ['BTC']);
  const usd = await assetIdOf('moeda', ['USD', 'Dólar', 'DOLAR', 'USDBRL']);
  const tesouro = await assetIdOf('tesouro-direto', ['IPCA', 'Tesouro']);

  // [label da categoria, mês(0-11), valor esperado (null = só não-zero), body]
  const OPS: [string, number, number | null, Record<string, unknown> | null][] = [
    [
      'FIIs',
      1,
      1600,
      hglg && {
        tipoAtivo: 'fii',
        instituicaoId: xp,
        assetId: hglg,
        dataCompra: '2026-02-10',
        quantidade: 10,
        cotacaoUnitaria: 160,
        taxaCorretagem: 0,
        tipoFii: 'tijolo',
        instituicao: 'XP',
      },
    ],
    [
      'ETFs',
      1,
      1200,
      bova && {
        tipoAtivo: 'etf',
        instituicaoId: xp,
        assetId: bova,
        dataCompra: '2026-02-10',
        quantidade: 10,
        cotacaoUnitaria: 120,
        taxaCorretagem: 0,
        regiaoEtf: 'brasil',
        instituicao: 'XP',
      },
    ],
    [
      'BDRs',
      3,
      1200,
      bdr && {
        tipoAtivo: 'bdr',
        instituicaoId: xp,
        assetId: bdr,
        dataCompra: '2026-04-10',
        quantidade: 20,
        cotacaoUnitaria: 60,
        taxaCorretagem: 0,
        estrategia: 'value',
        instituicao: 'XP',
      },
    ],
    [
      'REITs',
      4,
      null,
      {
        tipoAtivo: 'reit',
        instituicaoId: avenue,
        assetId: 'REIT-MANUAL',
        ativo: 'Realty Income QA',
        nomePersonalizado: 'Realty Income QA',
        dataCompra: '2026-05-11',
        quantidade: 5,
        cotacaoUnitaria: 60,
        cotacaoMoeda: 5.2,
        estrategiaReit: 'value',
        taxaCorretagem: 0,
        instituicao: 'Avenue',
      },
    ],
    [
      'Criptomoedas',
      4,
      2000,
      btc && {
        tipoAtivo: 'criptoativo',
        instituicaoId: btg,
        assetId: btc,
        dataCompra: '2026-05-11',
        quantidade: 0.005,
        cotacaoCompra: 400000,
        taxaCorretagem: 0,
        instituicao: 'BTG',
      },
    ],
    [
      'Renda Fixa & Fundos Renda Fixa',
      6,
      5000,
      {
        tipoAtivo: 'renda-fixa-posfixada',
        instituicaoId: btg,
        rendaFixaTipo: 'CDB_PRE',
        dataInicio: '2026-07-10',
        dataVencimento: '2028-07-10',
        valorAplicado: 5000,
        descricao: 'CDB QA 110% CDI',
        taxaJurosAnual: 110,
        rendaFixaIndexer: 'CDI',
        rendaFixaIndexerPercent: 110,
        instituicao: 'BTG',
      },
    ],
    [
      'Renda Fixa & Fundos Renda Fixa',
      7,
      null,
      tesouro && {
        tipoAtivo: 'tesouro-direto',
        instituicaoId: xp,
        assetId: tesouro,
        dataCompra: '2026-08-10',
        metodo: 'valor',
        valorInvestido: 3000,
        tesouroDestino: 'renda-fixa-hibrida',
        dataInicio: '2026-08-10',
        dataVencimento: '2045-05-15',
        rendaFixaIndexer: 'IPCA',
        rendaFixaIndexerPercent: 100,
        taxaJurosAnual: 6,
        descricao: 'Tesouro IPCA+ QA',
        instituicao: 'XP',
      },
    ],
    [
      'Fundos (FIM / FIA)',
      8,
      4000,
      {
        tipoAtivo: 'fundo',
        instituicaoId: xp,
        assetId: 'FUNDO-MANUAL',
        ativo: 'Fundo Multimercado QA',
        nomePersonalizado: 'Fundo Multimercado QA',
        fundoDestino: 'fim',
        dataCompra: '2026-09-10',
        valorInvestido: 4000,
        metodo: 'valor',
        instituicao: 'XP',
      },
    ],
    [
      'Previdência e Seguros',
      8,
      2000,
      {
        tipoAtivo: 'previdencia',
        instituicaoId: itau,
        assetId: 'PREVIDENCIA-MANUAL',
        ativo: 'PGBL QA',
        nomePersonalizado: 'PGBL QA',
        dataCompra: '2026-09-10',
        valorInvestido: 2000,
        metodo: 'valor',
        instituicao: 'Itaú',
      },
    ],
    [
      'Reserva Emergência',
      9,
      3000,
      {
        tipoAtivo: 'emergency',
        instituicaoId: itau,
        dataCompra: '2026-10-13',
        valorInvestido: 3000,
        ativo: 'Reserva de Emergência QA',
        instituicao: 'Itaú',
      },
    ],
    [
      'Reserva Oportunidade',
      9,
      2000,
      {
        tipoAtivo: 'opportunity',
        instituicaoId: itau,
        dataCompra: '2026-10-13',
        valorInvestido: 2000,
        ativo: 'Reserva Oportunidade QA',
        instituicao: 'Itaú',
      },
    ],
    [
      'Moedas, Criptomoedas & Outros',
      10,
      null,
      usd && {
        tipoAtivo: 'moeda',
        instituicaoId: avenue,
        assetId: usd,
        dataCompra: '2026-11-10',
        quantidade: 500,
        cotacaoCompra: 5.2,
        taxaCorretagem: 0,
        instituicao: 'Avenue',
      },
    ],
    [
      'Personalizado',
      10,
      1500,
      {
        tipoAtivo: 'personalizado',
        instituicaoId: itau,
        nomePersonalizado: 'Coleção QA',
        dataInicio: '2026-11-10',
        quantidade: 1,
        precoUnitario: 1500,
        metodo: 'valor',
        instituicao: 'Itaú',
      },
    ],
  ];

  const before = await serieEvolucao(uid);
  console.log(`série Evolução ANTES: dez=${before[11]}\n`);
  console.log('── aportes por categoria (com verificação após cada um) ──');

  for (const [cat, month, expected, body] of OPS) {
    if (!body) {
      console.log(`  ⚠ ${cat}: ativo não encontrado no catálogo — pulado`);
      continue;
    }
    const r = await api('/api/carteira/operacao', { method: 'POST', csrf: true, body });
    if (!r.ok) {
      FAILS.push(`${cat}: operacao ${r.status} ${r.text.slice(0, 120)}`);
      console.log(`  ✗ ${cat}: operacao falhou ${r.status} ${r.text.slice(0, 120)}`);
      continue;
    }
    const matrix = await invMatrix();
    const got = matrix.get(cat)?.[month] ?? 0;
    ok(
      expected === null ? got !== 0 : Math.abs(got - expected) <= 0.5,
      `${cat} m${month + 1}=${got}`,
      `${cat} m${month + 1}=${got} (esperado ${expected ?? '≠0'})`,
    );
    const serie = await serieEvolucao(uid);
    const drift = serie.map((v, i) => Math.abs(v - before[i])).reduce((a, b) => Math.max(a, b), 0);
    ok(
      drift <= 0.5,
      `evolução inalterada (invariante aporte↔caixa)`,
      `${cat}: evolução MUDOU (drift máx ${drift.toFixed(2)})`,
    );
  }

  // matriz final
  console.log('\n── matriz final Aporte/Resgate (linhas ≠ 0) ──');
  const matrix = await invMatrix();
  for (const [name, vals] of matrix) {
    if (vals.every((v) => v === 0)) continue;
    console.log(name.padEnd(32) + vals.map((v) => String(Math.round(v)).padStart(7)).join(''));
  }
  const zeroCats = [...matrix.entries()].filter(([, v]) => v.every((x) => x === 0)).map(([n]) => n);
  console.log(`categorias ainda zeradas: ${zeroCats.join(', ') || 'nenhuma'}`);

  console.log(`\n============ RELATÓRIO APORTES ============`);
  console.log(`${PASS} PASS, ${FAILS.length} FAIL`);
  FAILS.forEach((f) => console.log(`  ✗ ${f}`));
  console.log(`===========================================`);
  await prisma.$disconnect();
  if (FAILS.length) process.exit(2);
}

main().catch(async (e) => {
  console.error('FATAL', e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
