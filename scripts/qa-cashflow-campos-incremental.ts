/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * QA PROD — preenchimento INCREMENTAL do fluxo de caixa (qa.teste) com perfil
 * de usuário normal (família, renda 28k, aluguel, 2 filhos, 2 cães, troca de
 * carro em março), verificando os cálculos automáticos APÓS CADA LINHA:
 *
 *   a cada item gravado →
 *     1. agregados da árvore (entradas/despesas/Conta Corrente por mês) devem
 *        bater com o razão local (ledger) mantido pelo script;
 *     2. a série Evolução do Patrimônio do app (computeEvolucaoDoMes, o mesmo
 *        módulo do cron) deve bater com a série esperada, calculada aqui por
 *        uma REIMPLEMENTAÇÃO independente da regra do Pedro (encadeado).
 *
 * Objetivo: provar que nenhum campo da planilha quebra os cálculos.
 *
 * Carteira: base 100.000 (dez/2025) + aporte mar 5.000 + resgate jun 2.000,
 * e no fim um aporte extra (ago 2.000) pra verificar que a linha Aporte/
 * Resgate automática também re-propaga certo.
 *
 * Uso (EC2, DENTRO do release atual):
 *   DATABASE_URL=... SFC_BASE_URL=http://localhost:3000 \
 *     npx --no-install tsx scripts/qa-cashflow-campos-incremental.ts
 */
import prisma from '../src/lib/prisma';
import { computeEvolucaoDoMes } from '../src/services/cashflow/evolucaoPatrimonioServer';

const BASE_URL = process.env.SFC_BASE_URL || 'http://localhost:3000';
const EMAIL = process.env.QA_EMAIL || 'qa.teste@appmyfinance.com.br';
const PASSWORD = process.env.QA_PASSWORD || 'QaTeste@2026';
const YEAR = 2026;
const BASE_APLICADA = 100000;
const SALDO_DEZ_ANTERIOR = 10000;

// ── infra http ──
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
const approxEq = (a: number[], b: number[], tol = 0.5) =>
  a.every((v, i) => Math.abs(v - (b[i] ?? 0)) <= tol);
const diffStr = (exp: number[], act: number[]) =>
  exp
    .map((v, i) => (Math.abs(v - (act[i] ?? 0)) > 0.5 ? `m${i}:${act[i]}≠${v}` : null))
    .filter(Boolean)
    .join(' ');

// ── perfil "usuário normal" (Grupo::Item → 12 meses) ──
const F = (v: number) => Array(12).fill(v);
const M = (base: number, ov: [number, number][]) => {
  const a = Array(12).fill(base);
  for (const [m, v] of ov) a[m] = v;
  return a;
};
const BUDGET: Record<string, number[]> = {
  Salário: F(20000),
  '13º Salário': M(0, [
    [10, 10000],
    [11, 10000],
  ]),
  Férias: M(0, [[6, 6800]]),
  'Entradas Fixas::Outros': F(8000), // renda do cônjuge
  'Aluguel / Prestação': F(3500),
  Condomínio: F(800),
  'IPTU + Taxas Municipais': M(0, [
    [0, 480],
    [1, 480],
    [2, 480],
    [3, 480],
    [4, 480],
  ]),
  'Conta de energia': [520, 500, 480, 450, 430, 410, 400, 420, 440, 460, 490, 530],
  Internet: F(130),
  'Conta de água': [165, 160, 158, 152, 150, 150, 150, 155, 158, 162, 168, 172],
  Gás: F(125),
  'Telefones celulares': F(260),
  Supermercado: [2000, 1950, 2000, 1950, 2000, 1950, 2050, 2000, 2050, 2100, 2200, 2600],
  Padaria: F(300),
  'Empregados/ Diaristas': F(650),
  'Seguro Residência': F(80),
  'Prestação Moto/ Carro': [0, 0, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500],
  'IPVA + Seguro Obrigatório Carro': [460, 460, 460, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'Seguro Carro': [0, 0, 380, 380, 380, 380, 380, 380, 380, 380, 380, 380],
  Combustível: [720, 700, 780, 800, 820, 800, 850, 830, 800, 780, 800, 900],
  Estacionamentos: F(150),
  'Manutenção / Revisões': M(0, [
    [0, 250],
    [3, 400],
    [5, 250],
    [7, 300],
    [9, 250],
    [11, 300],
  ]),
  Lavagens: F(85),
  Pedágio: F(100),
  'Transporte::Acessórios': M(0, [[2, 2200]]),
  'Plano de Saúde': F(1600),
  'Seguro Vida': F(150),
  'Médicos e terapeutas': M(0, [
    [0, 300],
    [2, 400],
    [4, 350],
    [6, 300],
    [8, 400],
    [10, 300],
  ]),
  Dentista: M(0, [
    [1, 350],
    [4, 300],
    [7, 400],
    [10, 300],
  ]),
  Medicamentos: F(220),
  'Escola/Faculdade': F(2400),
  'Material escolar': M(0, [
    [0, 1300],
    [1, 650],
    [6, 300],
  ]),
  'Transporte escolar': [0, 450, 450, 450, 450, 450, 0, 450, 450, 450, 450, 450],
  Cursos: F(380),
  Ração: F(420),
  Veterinário: M(0, [
    [1, 200],
    [3, 300],
    [5, 200],
    [7, 250],
    [9, 200],
    [11, 350],
  ]),
  'Banho e tosa': F(220),
  Vacinas: M(0, [[3, 380]]),
  'Despesas Pessoais::Acessórios': M(0, [
    [3, 250],
    [8, 300],
    [11, 350],
  ]),
  Roupas: [400, 300, 500, 400, 450, 400, 600, 400, 500, 450, 600, 1100],
  Calçados: M(0, [
    [1, 250],
    [3, 300],
    [6, 350],
    [9, 300],
    [11, 400],
  ]),
  'Cuidados pessoais': F(330),
  Restaurantes: [700, 650, 750, 700, 750, 700, 800, 750, 800, 750, 850, 1100],
  Cinema: F(130),
  Viagens: M(0, [
    [6, 8500],
    [11, 5500],
  ]),
  Hobbies: F(160),
  'Planejamento Financeiro::Objetivo 1': F(1500),
  'Planejamento Financeiro::Objetivo 2': F(800),
  'Planejamento Financeiro::Objetivo 3': F(500),
  'Planejamento Financeiro::Objetivo 4': F(1200),
};
// Bloco Conta Corrente: usuário registra a sobra até jun, depois para (testa
// os dois ramos do encadeado: desconto do carry e sobra não registrada).
const CC_2026 = [4000, 3500, 2500, 3000, 2800, 3200, 0, 0, 0, 0, 0, 0];

// ── matching por nome normalizado (chave qualificada Grupo::Item desambígua) ──
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\s/]+/g, '');
const budgetByNorm = new Map<string, number[]>();
for (const [k, v] of Object.entries(BUDGET)) {
  if (k.includes('::')) {
    const [g, i] = k.split('::');
    budgetByNorm.set(norm(g) + '::' + norm(i), v);
  } else budgetByNorm.set(norm(k), v);
}

// ── razão local (o que o app DEVE reportar) ──
const ledger = {
  entradas: Array(12).fill(0),
  despesas: Array(12).fill(0),
  cc: Array(12).fill(0),
  aportes: Array(12).fill(0), // totais (== série cheia; sem sonho vinculado)
};
/** Reimplementação independente da regra (espec do Pedro, modelo encadeado). */
function expectedEvolucao(): number[] {
  const saldoAnterior = Array.from({ length: 12 }, (_, m) =>
    m === 0 ? SALDO_DEZ_ANTERIOR : ledger.cc[m - 1],
  );
  const fluxoLivre = Array.from(
    { length: 12 },
    (_, m) => ledger.entradas[m] - ledger.despesas[m] + saldoAnterior[m] - ledger.aportes[m],
  );
  const serie: number[] = [];
  let prev = BASE_APLICADA;
  for (let m = 0; m < 12; m++) {
    const v =
      m === 0
        ? BASE_APLICADA + ledger.aportes[0] + fluxoLivre[0]
        : prev + ledger.aportes[m] + (fluxoLivre[m] - saldoAnterior[m]);
    serie.push(Math.round(v * 100) / 100);
    prev = v;
  }
  return serie;
}

// ── leitura da árvore ──
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
function sumByType(groups: any[]): Record<string, number[]> {
  const sums: Record<string, number[]> = {
    entrada: Array(12).fill(0),
    despesa: Array(12).fill(0),
    saldo: Array(12).fill(0),
  };
  const walk = (g: any) => {
    if (sums[g.type])
      for (const it of g.items ?? [])
        for (const v of it.values ?? []) sums[g.type][num(v.month)] += num(v.value);
    (g.children ?? []).forEach(walk);
  };
  groups.forEach(walk);
  return sums;
}

// ── verificação pós-passo ──
let PASS = 0;
const FAILS: string[] = [];
async function checkStep(userId: string, label: string) {
  const sums = sumByType(await getTree(YEAR));
  const serieApp = await Promise.all(
    Array.from({ length: 12 }, (_, m) => computeEvolucaoDoMes(userId, YEAR, m)),
  );
  const serieExp = expectedEvolucao();
  const errs: string[] = [];
  if (!approxEq(ledger.entradas, sums.entrada))
    errs.push(`entradas ${diffStr(ledger.entradas, sums.entrada)}`);
  if (!approxEq(ledger.despesas, sums.despesa))
    errs.push(`despesas ${diffStr(ledger.despesas, sums.despesa)}`);
  if (!approxEq(ledger.cc, sums.saldo)) errs.push(`cc ${diffStr(ledger.cc, sums.saldo)}`);
  if (!approxEq(serieExp, serieApp)) errs.push(`evolucao ${diffStr(serieExp, serieApp)}`);
  if (errs.length) {
    FAILS.push(`${label}: ${errs.join(' | ')}`);
    console.log(`  ✗ ${label} → ${errs.join(' | ')}`);
  } else {
    PASS++;
    console.log(`  ✓ ${label} (evo dez=${Math.round(serieApp[11])})`);
  }
}

async function batchSet(groupId: string, itemId: string, values: number[], year: number) {
  const r = await api('/api/cashflow/batch-update', {
    method: 'PUT',
    csrf: true,
    body: {
      groupId,
      updates: [{ itemId, values: values.map((value, month) => ({ month, value })) }],
      year,
    },
  });
  if (!r.ok)
    throw new Error(`batch-update ${itemId} falhou (${r.status}): ${r.text.slice(0, 150)}`);
}

// ── reset (igual ao qa-evolucao-encadeada-prod) ──
async function reset(userId: string) {
  const tables: [string, () => Promise<{ count: number }>][] = [
    ['CashflowValue', () => prisma.cashflowValue.deleteMany({ where: { userId } })],
    ['CashflowItem', () => prisma.cashflowItem.deleteMany({ where: { userId } })],
    ['CashflowGroup', () => prisma.cashflowGroup.deleteMany({ where: { userId } })],
    ['Snapshot', () => prisma.cashflowPatrimonioSnapshot.deleteMany({ where: { userId } })],
    ['PlanejamentoObjetivo', () => prisma.planejamentoObjetivo.deleteMany({ where: { userId } })],
    ['AposentadoriaPlano', () => prisma.aposentadoriaPlano.deleteMany({ where: { userId } })],
    ['StockTransaction', () => prisma.stockTransaction.deleteMany({ where: { userId } })],
    ['PortfolioProvento', () => prisma.portfolioProvento.deleteMany({ where: { userId } })],
    ['FixedIncomeAsset', () => prisma.fixedIncomeAsset.deleteMany({ where: { userId } })],
    ['Portfolio', () => prisma.portfolio.deleteMany({ where: { userId } })],
    ['DailySnapshot', () => prisma.portfolioDailySnapshot.deleteMany({ where: { userId } })],
    ['Performance', () => prisma.portfolioPerformance.deleteMany({ where: { userId } })],
    ['SensCache', () => prisma.portfolioSensibilidadeCache.deleteMany({ where: { userId } })],
    ['RiscoCache', () => prisma.portfolioRiscoRetornoCache.deleteMany({ where: { userId } })],
  ];
  const parts: string[] = [];
  for (const [label, fn] of tables) parts.push(`${label}=${(await fn()).count}`);
  console.log(`── RESET: ${parts.join(' ')}`);
}

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

async function compra(assetSearch: string, tipo: string, data: string, qtd: number, cot: number) {
  const r0 = await api(`/api/assets?tipo=${tipo}&search=${assetSearch}&limit=5`);
  const asset = (r0.json?.assets ?? []).find((a: any) => a.symbol === assetSearch)?.id;
  const xp = (await api('/api/institutions?search=XP&limit=5')).json?.institutions?.[0]?.id;
  const r = await api('/api/carteira/operacao', {
    method: 'POST',
    csrf: true,
    body: {
      tipoAtivo: tipo === 'acao' ? 'acao' : tipo,
      instituicaoId: xp,
      assetId: asset,
      dataCompra: data,
      quantidade: qtd,
      cotacaoUnitaria: cot,
      taxaCorretagem: 0,
      estrategia: 'value',
      instituicao: 'XP',
    },
  });
  if (!r.ok) throw new Error(`compra ${assetSearch} ${data} falhou: ${r.text.slice(0, 150)}`);
}

async function main() {
  console.log(`→ base=${BASE_URL} conta=${EMAIL} ano=${YEAR}\n`);
  const user = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true } });
  if (!user) throw new Error('qa.teste não existe');
  const uid = user.id;

  await reset(uid);
  await login();

  // carteira-base: 100k dez/2025 + aporte mar + resgate jun (como no QA anterior)
  await compra('PETR4', 'acao', '2025-12-10', 2500, 40);
  await compra('PETR4', 'acao', '2026-03-10', 125, 40);
  {
    const acoes = (await api('/api/carteira/acoes')).json;
    let pid: string | null = null;
    const walk = (o: any) => {
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o)) return o.forEach(walk);
      if (o.ticker === 'PETR4' && (o.portfolioId || o.id)) pid = pid ?? (o.portfolioId || o.id);
      Object.values(o).forEach(walk);
    };
    walk(acoes);
    if (!pid) throw new Error('portfolioId PETR4 não encontrado');
    const rv = await api('/api/carteira/resgate', {
      method: 'POST',
      csrf: true,
      body: {
        portfolioId: pid,
        dataResgate: '2026-06-10',
        metodoResgate: 'quantidade',
        quantidade: 50,
        cotacaoUnitaria: 40,
      },
    });
    if (!rv.ok) throw new Error(`resgate falhou: ${rv.text.slice(0, 150)}`);
  }
  ledger.aportes[2] = 5000;
  ledger.aportes[5] = -2000;
  console.log('── carteira-base ok (100k dez/2025, +5k mar, −2k jun)\n');
  console.log('── planilha vazia + carteira ──');
  await checkStep(uid, '00 planilha-vazia');

  // Conta Corrente dez/2025 (carry) — 1º dado da planilha
  const tree0 = await getTree(YEAR);
  const saldoItem = flatten(tree0).find((f) => f.group.type === 'saldo');
  if (!saldoItem) throw new Error('bloco Conta Corrente (saldo) sem item no template');
  await batchSet(saldoItem.group.id, saldoItem.item.id, M(0, [[11, SALDO_DEZ_ANTERIOR]]), YEAR - 1);
  await checkStep(uid, '01 CC dez/2025=10k (carry)');

  // itens do perfil, um a um, na ordem da árvore
  console.log('\n── preenchimento incremental (1 linha por vez) ──');
  let step = 1;
  const applied = new Set<string>();
  for (const f of flatten(await getTree(YEAR))) {
    if (f.group.type === 'saldo' || f.group.type === 'investimento') continue;
    const qual = norm(f.group.name) + '::' + norm(f.item.name);
    const key = budgetByNorm.has(qual) ? qual : norm(f.item.name);
    const vals = budgetByNorm.get(key);
    if (!vals || applied.has(key)) continue;
    applied.add(key);
    step++;
    await batchSet(f.group.id, f.item.id, vals, YEAR);
    if (f.group.type === 'entrada')
      ledger.entradas = ledger.entradas.map((v: number, i: number) => v + vals[i]);
    else ledger.despesas = ledger.despesas.map((v: number, i: number) => v + vals[i]);
    await checkStep(uid, `${String(step).padStart(2, '0')} ${f.group.name}::${f.item.name}`);
  }
  const missing = [...budgetByNorm.keys()].filter((k) => !applied.has(k));
  if (missing.length) console.log(`  ⚠ sem item no template (não testados): ${missing.join(', ')}`);

  // bloco Conta Corrente 2026, mês a mês incremental (jan..jun)
  console.log('\n── Conta Corrente 2026 (registro mensal da sobra) ──');
  const treeCC = await getTree(YEAR);
  const cc = flatten(treeCC).find((f) => f.group.type === 'saldo');
  if (!cc) throw new Error('item do bloco saldo sumiu');
  for (let m = 0; m < 6; m++) {
    ledger.cc[m] = CC_2026[m];
    await batchSet(cc.group.id, cc.item.id, ledger.cc, YEAR);
    step++;
    await checkStep(uid, `${String(step).padStart(2, '0')} CC ${m + 1}/12=${CC_2026[m]}`);
  }

  // aporte extra pós-planilha: a linha automática re-propaga?
  console.log('\n── aporte extra ago/2026 (linha Aporte/Resgate automática) ──');
  await compra('PETR4', 'acao', '2026-08-10', 50, 40);
  ledger.aportes[7] += 2000;
  step++;
  await checkStep(uid, `${String(step).padStart(2, '0')} aporte ago +2.000`);

  // resumo final
  const serie = expectedEvolucao();
  const fmt = (a: number[]) => a.map((v) => String(Math.round(v)).padStart(8)).join('');
  console.log('\n── ESTADO FINAL (esperado == app em todos os passos acima) ──');
  console.log('entradas: ' + fmt(ledger.entradas));
  console.log('despesas: ' + fmt(ledger.despesas));
  console.log('cc:       ' + fmt(ledger.cc));
  console.log('aportes:  ' + fmt(ledger.aportes));
  console.log('evolucao: ' + fmt(serie));

  console.log(`\n============ RELATÓRIO CAMPOS INCREMENTAL ============`);
  console.log(`${PASS} passos PASS, ${FAILS.length} FAIL`);
  FAILS.forEach((f) => console.log(`  ✗ ${f}`));
  console.log(`======================================================`);
  await prisma.$disconnect();
  if (FAILS.length) process.exit(2);
}

main().catch(async (e) => {
  console.error('FATAL', e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
