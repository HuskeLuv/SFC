/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * QA PROD — completa o fluxo de caixa do qa.teste: TODA linha do template que
 * ainda está vazia recebe valores plausíveis (constantes mensais pequenas),
 * SEM tocar nas linhas já preenchidas pelo perfil família. Após cada linha,
 * verifica os agregados e a série da Evolução do Patrimônio (mesma harness do
 * qa-cashflow-campos-incremental).
 *
 * Estado inicial esperado: o deixado pelo qa-cashflow-campos-incremental
 * (base 100k, carry 10k, aportes mar/jun/ago, 46 linhas + CC jan–jun).
 * O ledger inicial é LIDO do app (árvore + investimentos + endpoints) e
 * validado no passo 0 antes de qualquer escrita.
 *
 * Uso (EC2, DENTRO do release atual):
 *   DATABASE_URL=... SFC_BASE_URL=http://localhost:3000 \
 *     npx --no-install tsx scripts/qa-cashflow-preencher-tudo.ts
 */
import prisma from '../src/lib/prisma';
import { computeEvolucaoDoMes } from '../src/services/cashflow/evolucaoPatrimonioServer';

const BASE_URL = process.env.SFC_BASE_URL || 'http://localhost:3000';
const EMAIL = process.env.QA_EMAIL || 'qa.teste@appmyfinance.com.br';
const PASSWORD = process.env.QA_PASSWORD || 'QaTeste@2026';
const YEAR = 2026;

// valores plausíveis, determinísticos, pequenos (não viram o orçamento):
const DESPESA_FILL = [30, 40, 50, 60, 70, 80, 90];
const ENTRADA_FILL = [100, 150, 200, 250];
const SALDO_FILL = [800, 600, 500];

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
const itemValues = (item: any): number[] => {
  const a = Array(12).fill(0);
  for (const v of item.values ?? []) a[num(v.month)] = num(v.value);
  return a;
};

// ── ledger + expectativa independente ──
let BASE_APLICADA = 0;
let SALDO_DEZ_ANTERIOR = 0;
const ledger = {
  entradas: Array(12).fill(0),
  despesas: Array(12).fill(0),
  cc: Array(12).fill(0),
  aportes: Array(12).fill(0),
};
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
    console.log(`  ✓ ${label}`);
  }
}

async function batchSet(groupId: string, itemId: string, values: number[]) {
  const r = await api('/api/cashflow/batch-update', {
    method: 'PUT',
    csrf: true,
    body: {
      groupId,
      updates: [{ itemId, values: values.map((value, month) => ({ month, value })) }],
      year: YEAR,
    },
  });
  if (!r.ok)
    throw new Error(`batch-update ${itemId} falhou (${r.status}): ${r.text.slice(0, 150)}`);
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

async function main() {
  console.log(`→ base=${BASE_URL} conta=${EMAIL} ano=${YEAR} (SEM reset)\n`);
  const user = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true } });
  if (!user) throw new Error('qa.teste não existe');
  const uid = user.id;
  await login();

  // ledger inicial lido do próprio app + validado antes de escrever
  const tree0 = await getTree(YEAR);
  const sums0 = sumByType(tree0);
  ledger.entradas = sums0.entrada;
  ledger.despesas = sums0.despesa;
  ledger.cc = sums0.saldo;
  ledger.aportes = (
    (await api(`/api/cashflow/investimentos?year=${YEAR}`)).json?.totaisPorMes ?? []
  ).map(num);
  BASE_APLICADA = num(
    (await api(`/api/cashflow/evolucao-patrimonio?year=${YEAR}`)).json?.baseAplicadaAnterior,
  );
  SALDO_DEZ_ANTERIOR = num(
    (await api(`/api/cashflow/conta-corrente-anterior?year=${YEAR}`)).json?.saldoDezembroAnterior,
  );
  console.log(
    `estado inicial: base=${BASE_APLICADA} carry=${SALDO_DEZ_ANTERIOR} aportes=[${ledger.aportes.join(',')}]`,
  );
  await checkStep(uid, '00 estado-inicial consistente');

  // preenche toda linha 100% vazia
  console.log('\n── preenchendo linhas vazias (1 por vez, com verificação) ──');
  const counters = { entrada: 0, despesa: 0, saldo: 0 };
  let step = 0;
  let filled = 0;
  let alreadyFilled = 0;
  for (const f of flatten(tree0)) {
    const type = f.group.type as 'entrada' | 'despesa' | 'saldo' | string;
    if (!(type in counters)) continue; // investimento = automático
    const current = itemValues(f.item);
    if (current.some((v) => v !== 0)) {
      alreadyFilled++;
      continue;
    }
    const pool = type === 'entrada' ? ENTRADA_FILL : type === 'despesa' ? DESPESA_FILL : SALDO_FILL;
    const val = pool[counters[type as keyof typeof counters]++ % pool.length];
    const vals = Array(12).fill(val);
    await batchSet(f.group.id, f.item.id, vals);
    if (type === 'entrada') ledger.entradas = ledger.entradas.map((v, i) => v + vals[i]);
    else if (type === 'despesa') ledger.despesas = ledger.despesas.map((v, i) => v + vals[i]);
    else ledger.cc = ledger.cc.map((v, i) => v + vals[i]);
    filled++;
    step++;
    await checkStep(uid, `${String(step).padStart(2, '0')} ${f.group.name}::${f.item.name}=${val}`);
  }

  // estado final: nenhuma linha vazia?
  const empty = flatten(await getTree(YEAR)).filter(
    (f) =>
      ['entrada', 'despesa', 'saldo'].includes(f.group.type) &&
      itemValues(f.item).every((v) => v === 0),
  );
  console.log(
    `\nlinhas: ${alreadyFilled} já preenchidas + ${filled} preenchidas agora; vazias restantes: ${empty.length}`,
  );
  if (empty.length)
    console.log(
      '  ⚠ ainda vazias: ' + empty.map((f) => `${f.group.name}::${f.item.name}`).join(', '),
    );

  const serie = expectedEvolucao();
  const fmt = (a: number[]) => a.map((v) => String(Math.round(v)).padStart(8)).join('');
  console.log('\n── ESTADO FINAL ──');
  console.log('entradas: ' + fmt(ledger.entradas));
  console.log('despesas: ' + fmt(ledger.despesas));
  console.log('cc:       ' + fmt(ledger.cc));
  console.log('evolucao: ' + fmt(serie));

  console.log(`\n============ RELATÓRIO PREENCHER-TUDO ============`);
  console.log(`${PASS} passos PASS, ${FAILS.length} FAIL`);
  FAILS.forEach((f) => console.log(`  ✗ ${f}`));
  console.log(`==================================================`);
  await prisma.$disconnect();
  if (FAILS.length || empty.length) process.exit(2);
}

main().catch(async (e) => {
  console.error('FATAL', e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
