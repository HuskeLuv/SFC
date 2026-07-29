/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * QA PROD — Evolução do Patrimônio (modelo ENCADEADO, PR #46) na conta qa.teste.
 *
 * 1. RESET: apaga os dados do usuário de teste (carteira, fluxo de caixa,
 *    planejamento, snapshots) direto no banco — escopado por userId.
 * 2. SEED via API HTTP real (mesmo caminho da UI):
 *    - compra R$ 100.000 em dez/2025 → base aplicada do ano anterior
 *    - compra R$ 5.000 em mar/2026 (aporte) e venda R$ 2.000 em jun/2026 (resgate)
 *    - planilha 2026: Salário 20.000/mês, Aluguel 15.000/mês (sobra 5.000/mês)
 *    - Conta Corrente: dez/2025 = 10.000 (carry cross-year); jan/2026 = 15.000
 *      (cliente registrou a sobra; fev em diante NÃO registra — exercita os
 *      dois ramos do modelo encadeado: desconto do carry e sobra que permanece)
 * 3. VERIFY: insumos via API + série server-side (computeEvolucaoDoMes, o mesmo
 *    módulo do cron de snapshot) comparados com a série calculada à mão.
 *
 * Série esperada (jan→dez):
 *   jan 115.000 = 100.000 (base) + 15.000 (fluxo livre: 5.000 sobra + 10.000 carry dez)
 *   fev 120.000 = 115.000 + (20.000 fluxo livre − 15.000 carry registrado)
 *   mar 125.000 = 120.000 + 5.000 aporte + (0 fluxo livre: sobra virou aporte)
 *   abr 130.000 … mai 135.000
 *   jun 140.000 = 135.000 − 2.000 resgate + 7.000 fluxo livre (sobra + resgate)
 *   jul 145.000 … dez 170.000 (= 100k base + 10k carry + 12×5k de sobras)
 *
 * Uso (EC2, DENTRO do release atual — precisa do node_modules/tsconfig dele):
 *   cd $(readlink -f /opt/myfinance/current)
 *   DATABASE_URL=... SFC_BASE_URL=http://localhost:3000 \
 *     npx --no-install tsx scripts/qa-evolucao-encadeada-prod.ts
 */
import prisma from '../src/lib/prisma';
import { computeEvolucaoDoMes } from '../src/services/cashflow/evolucaoPatrimonioServer';

const BASE_URL = process.env.SFC_BASE_URL || 'http://localhost:3000';
const EMAIL = process.env.QA_EMAIL || 'qa.teste@appmyfinance.com.br';
const PASSWORD = process.env.QA_PASSWORD || 'QaTeste@2026';
const YEAR = 2026;
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// ── esperado (calculado à mão a partir do cenário acima) ──
const EXPECTED_SERIE = [
  115000, 120000, 125000, 130000, 135000, 140000, 145000, 150000, 155000, 160000, 165000, 170000,
];
const EXPECTED_FLUXO_LIVRE = [
  15000, 20000, 0, 5000, 5000, 7000, 5000, 5000, 5000, 5000, 5000, 5000,
];
const EXPECTED_APORTES = [0, 0, 5000, 0, 0, -2000, 0, 0, 0, 0, 0, 0];

// ── infra http (mesmo padrão dos demais qa-prod-*.ts) ──
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
const approx = (a: number, b: number, tol = 0.5) => Math.abs(a - b) <= tol;
const checks: { level: 'PASS' | 'FAIL'; msg: string }[] = [];
function assert(cond: boolean, pass: string, fail: string) {
  checks.push({ level: cond ? 'PASS' : 'FAIL', msg: cond ? pass : fail });
  console.log(`  ${cond ? '✓' : '✗'} ${cond ? pass : fail}`);
}
const row = (label: string, vals: number[]) =>
  console.log(label.padEnd(12) + vals.map((v) => String(Math.round(v)).padStart(8)).join(''));

// ── helpers de árvore de cashflow ──
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\s/]+/g, '');
type Flat = { group: any; item: any };
function flatten(groups: any[]): Flat[] {
  const out: Flat[] = [];
  const walk = (g: any) => {
    for (const it of g.items ?? []) out.push({ group: g, item: it });
    (g.children ?? []).forEach(walk);
  };
  groups.forEach(walk);
  return out;
}
async function getTree(year: number) {
  return (await api(`/api/cashflow?year=${year}`)).json?.groups ?? [];
}
/** soma por tipo de grupo (entrada/despesa/saldo), mês a mês */
function sumByType(groups: any[]): Record<string, number[]> {
  const sums: Record<string, number[]> = {
    entrada: Array(12).fill(0),
    despesa: Array(12).fill(0),
    saldo: Array(12).fill(0),
  };
  const walk = (g: any) => {
    if (sums[g.type]) {
      for (const it of g.items ?? [])
        for (const v of it.values ?? []) sums[g.type][num(v.month)] += num(v.value);
    }
    (g.children ?? []).forEach(walk);
  };
  groups.forEach(walk);
  return sums;
}

// ── fase 1: reset ──
async function reset(userId: string) {
  console.log('── RESET (dados do qa.teste em prod) ──');
  const del = async (label: string, fn: () => Promise<{ count: number }>) => {
    const r = await fn();
    console.log(`  − ${label}: ${r.count}`);
  };
  // fluxo de caixa (valores → itens → grupos do usuário) + snapshots
  await del('CashflowValue', () => prisma.cashflowValue.deleteMany({ where: { userId } }));
  await del('CashflowItem', () => prisma.cashflowItem.deleteMany({ where: { userId } }));
  await del('CashflowGroup', () => prisma.cashflowGroup.deleteMany({ where: { userId } }));
  await del('CashflowPatrimonioSnapshot', () =>
    prisma.cashflowPatrimonioSnapshot.deleteMany({ where: { userId } }),
  );
  // planejamento (linhas-espelho e vínculos afetam a planilha)
  await del('PlanejamentoObjetivo (+entries em cascata)', () =>
    prisma.planejamentoObjetivo.deleteMany({ where: { userId } }),
  );
  await del('AposentadoriaPlano (+entries em cascata)', () =>
    prisma.aposentadoriaPlano.deleteMany({ where: { userId } }),
  );
  // carteira
  await del('StockTransaction', () => prisma.stockTransaction.deleteMany({ where: { userId } }));
  await del('PortfolioProvento', () => prisma.portfolioProvento.deleteMany({ where: { userId } }));
  await del('FixedIncomeAsset', () => prisma.fixedIncomeAsset.deleteMany({ where: { userId } }));
  await del('Portfolio', () => prisma.portfolio.deleteMany({ where: { userId } }));
  // derivados/caches de carteira
  await del('PortfolioDailySnapshot', () =>
    prisma.portfolioDailySnapshot.deleteMany({ where: { userId } }),
  );
  await del('PortfolioPerformance', () =>
    prisma.portfolioPerformance.deleteMany({ where: { userId } }),
  );
  await del('PortfolioSensibilidadeCache', () =>
    prisma.portfolioSensibilidadeCache.deleteMany({ where: { userId } }),
  );
  await del('PortfolioRiscoRetornoCache', () =>
    prisma.portfolioRiscoRetornoCache.deleteMany({ where: { userId } }),
  );
  await del('PortfolioGoal', () => prisma.portfolioGoal.deleteMany({ where: { userId } }));
}

// ── fase 2: seed via API ──
async function login() {
  const res = await api('/api/auth/login', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD },
  });
  if (!res.ok) throw new Error(`login falhou: ${res.status} ${res.text.slice(0, 200)}`);
  await api('/api/profile');
  if (!cookies['csrf-token']) await api('/api/carteira/acoes');
  if (!cookies['csrf-token']) throw new Error('csrf ausente');
  console.log('  ✓ logado, csrf ok');
}

function findPortfolioRow(node: any, symbol: string): any | null {
  const all: any[] = [];
  const walk = (o: any) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) return o.forEach(walk);
    if (o.ticker === symbol && (o.id || o.portfolioId)) all.push(o);
    Object.values(o).forEach(walk);
  };
  walk(node);
  return all[0] ?? null;
}

async function batchSet(
  groupId: string,
  itemId: string,
  values: { month: number; value: number }[],
  year: number,
) {
  const r = await api('/api/cashflow/batch-update', {
    method: 'PUT',
    csrf: true,
    body: { groupId, updates: [{ itemId, values }], year },
  });
  if (!r.ok) throw new Error(`batch-update falhou (${r.status}): ${r.text.slice(0, 200)}`);
}

async function seed() {
  console.log('\n── SEED via API (caminho real da UI) ──');

  // carteira: PETR4 na XP
  const petr = await (async () => {
    const r = await api('/api/assets?tipo=acao&search=PETR4&limit=5');
    const l: any[] = r.json?.assets ?? [];
    return (l.find((a) => a.symbol === 'PETR4') ?? l[0])?.id;
  })();
  const xp = (await api('/api/institutions?search=XP&limit=5')).json?.institutions?.[0]?.id;
  if (!petr || !xp) throw new Error(`assetId/instituicao não encontrados (petr=${petr}, xp=${xp})`);

  const compra = async (data: string, quantidade: number) => {
    const r = await api('/api/carteira/operacao', {
      method: 'POST',
      csrf: true,
      body: {
        tipoAtivo: 'acao',
        instituicaoId: xp,
        assetId: petr,
        dataCompra: data,
        quantidade,
        cotacaoUnitaria: 40,
        taxaCorretagem: 0,
        estrategia: 'value',
        instituicao: 'XP',
      },
    });
    console.log(`  compra ${quantidade}×40 em ${data} → ${r.status}`);
    if (!r.ok) throw new Error(`compra falhou: ${r.text.slice(0, 200)}`);
  };
  await compra('2025-12-10', 2500); // base aplicada = 100.000
  await compra('2026-03-10', 125); // aporte mar = 5.000

  // venda jun = resgate 2.000 (50 × 40)
  const rowPetr = findPortfolioRow((await api('/api/carteira/acoes')).json, 'PETR4');
  const portfolioId = rowPetr?.portfolioId ?? rowPetr?.id;
  if (!portfolioId) throw new Error('portfolioId do PETR4 não encontrado após compras');
  const rv = await api('/api/carteira/resgate', {
    method: 'POST',
    csrf: true,
    body: {
      portfolioId,
      dataResgate: '2026-06-10',
      metodoResgate: 'quantidade',
      quantidade: 50,
      cotacaoUnitaria: 40,
    },
  });
  console.log(`  venda 50×40 em 2026-06-10 → ${rv.status}`);
  if (!rv.ok) throw new Error(`resgate falhou: ${rv.text.slice(0, 200)}`);

  // planilha 2026: Salário 20.000/mês e Aluguel 15.000/mês
  let tree = await getTree(YEAR);
  let flat = flatten(tree);
  const salario = flat.find((f) => f.group.type === 'entrada' && norm(f.item.name) === 'salario');
  const aluguel = flat.find(
    (f) => f.group.type === 'despesa' && norm(f.item.name) === 'aluguelprestacao',
  );
  if (!salario || !aluguel) throw new Error('itens Salário/Aluguel não encontrados no template');
  const all12 = (v: number) => Array.from({ length: 12 }, (_, month) => ({ month, value: v }));
  await batchSet(salario.group.id, salario.item.id, all12(20000), YEAR);
  console.log('  ✓ Salário 20.000 × 12 (2026)');
  await batchSet(aluguel.group.id, aluguel.item.id, all12(15000), YEAR);
  console.log('  ✓ Aluguel/Prestação 15.000 × 12 (2026)');

  // bloco Conta Corrente (type='saldo'): jan/2026 = 15.000; dez/2025 = 10.000
  tree = await getTree(YEAR); // re-fetch: batch-update pode ter personalizado ids
  flat = flatten(tree);
  let cc = flat.find((f) => f.group.type === 'saldo');
  if (!cc) {
    // template sem item no bloco saldo → cria um
    const saldoGroup = (function find(gs: any[]): any {
      for (const g of gs) {
        if (g.type === 'saldo') return g;
        const c = find(g.children ?? []);
        if (c) return c;
      }
      return null;
    })(tree);
    if (!saldoGroup) throw new Error('grupo Conta Corrente (saldo) não encontrado');
    const created = await api('/api/cashflow/items', {
      method: 'POST',
      csrf: true,
      body: { groupId: saldoGroup.id, name: 'Conta Corrente QA' },
    });
    const id = created.json?.item?.id ?? created.json?.id;
    if (!id) throw new Error(`criar item no bloco saldo falhou: ${created.status}`);
    cc = { group: saldoGroup, item: { id, name: 'Conta Corrente QA' } };
  }
  await batchSet(cc.group.id, cc.item.id, [{ month: 0, value: 15000 }], YEAR);
  console.log(`  ✓ Conta Corrente jan/2026 = 15.000 (item "${cc.item.name}")`);
  await batchSet(cc.group.id, cc.item.id, [{ month: 11, value: 10000 }], YEAR - 1);
  console.log('  ✓ Conta Corrente dez/2025 = 10.000 (carry cross-year)');
}

// ── fase 3: verify ──
async function verify(userId: string) {
  console.log('\n── VERIFY: insumos via API ──');

  const evo = (await api(`/api/cashflow/evolucao-patrimonio?year=${YEAR}`)).json ?? {};
  assert(
    approx(num(evo.baseAplicadaAnterior), 100000),
    'baseAplicadaAnterior = 100.000',
    `baseAplicadaAnterior = ${evo.baseAplicadaAnterior} (esperado 100.000)`,
  );
  assert(
    (evo.snapshots ?? []).length === 0,
    'sem snapshots travados (série 100% fórmula)',
    `snapshots inesperados: ${JSON.stringify(evo.snapshots)}`,
  );

  const cc = (await api(`/api/cashflow/conta-corrente-anterior?year=${YEAR}`)).json ?? {};
  assert(
    approx(num(cc.saldoDezembroAnterior), 10000),
    'saldoDezembroAnterior = 10.000',
    `saldoDezembroAnterior = ${cc.saldoDezembroAnterior} (esperado 10.000)`,
  );

  const inv = (await api(`/api/cashflow/investimentos?year=${YEAR}`)).json ?? {};
  const totais = (inv.totaisPorMes ?? []).map(num);
  row('aportes:', totais);
  assert(
    EXPECTED_APORTES.every((v, i) => approx(totais[i] ?? 0, v)),
    'Aporte/Resgate por mês = [mar +5.000, jun −2.000, resto 0]',
    `aportes divergem do esperado ${JSON.stringify(EXPECTED_APORTES)}`,
  );

  const sums = sumByType(await getTree(YEAR));
  row('entradas:', sums.entrada);
  row('despesas:', sums.despesa);
  row('cc bloco:', sums.saldo);
  assert(
    sums.entrada.every((v) => approx(v, 20000)),
    'entradas = 20.000 em todos os meses',
    `entradas divergem: ${JSON.stringify(sums.entrada)}`,
  );
  assert(
    sums.despesa.every((v) => approx(v, 15000)),
    'despesas = 15.000 em todos os meses',
    `despesas divergem: ${JSON.stringify(sums.despesa)}`,
  );
  assert(
    approx(sums.saldo[0], 15000) && sums.saldo.slice(1).every((v) => approx(v, 0)),
    'Conta Corrente 2026 = [jan 15.000, resto 0]',
    `bloco Conta Corrente diverge: ${JSON.stringify(sums.saldo)}`,
  );
  const sums25 = sumByType(await getTree(YEAR - 1));
  assert(
    approx(sums25.saldo[11], 10000),
    'Conta Corrente dez/2025 = 10.000',
    `dez/2025 diverge: ${sums25.saldo[11]}`,
  );

  console.log('\n── VERIFY: série server-side (computeEvolucaoDoMes, módulo do cron) ──');
  const serie: number[] = [];
  for (let m = 0; m < 12; m++) serie.push(await computeEvolucaoDoMes(userId, YEAR, m));
  console.log('mês:'.padEnd(12) + MESES.map((m) => m.padStart(8)).join(''));
  row('esperado:', EXPECTED_SERIE);
  row('server:', serie);
  row(
    'diff:',
    serie.map((v, i) => v - EXPECTED_SERIE[i]),
  );
  for (let m = 0; m < 12; m++) {
    assert(
      approx(serie[m], EXPECTED_SERIE[m]),
      `${MESES[m]}: ${serie[m]} = esperado`,
      `${MESES[m]}: ${serie[m]} ≠ esperado ${EXPECTED_SERIE[m]}`,
    );
  }

  console.log('\n(fluxo livre esperado, referência p/ conferência manual)');
  row('fluxoLivre:', EXPECTED_FLUXO_LIVRE);
}

async function main() {
  console.log(`→ base=${BASE_URL} conta=${EMAIL} ano=${YEAR}\n`);
  const user = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true } });
  if (!user) throw new Error(`usuário ${EMAIL} não existe no banco`);

  if (!process.env.QA_SKIP_RESET) await reset(user.id);
  await login();
  if (!process.env.QA_SKIP_SEED) await seed();
  await verify(user.id);

  const fails = checks.filter((c) => c.level === 'FAIL');
  console.log(`\n============ RELATÓRIO EVOLUÇÃO ENCADEADA ============`);
  console.log(`${checks.filter((c) => c.level === 'PASS').length} PASS, ${fails.length} FAIL`);
  if (fails.length) fails.forEach((f) => console.log(`  ✗ ${f.msg}`));
  console.log(`======================================================`);
  await prisma.$disconnect();
  if (fails.length) process.exit(2);
}

main().catch(async (e) => {
  console.error('FATAL', e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
