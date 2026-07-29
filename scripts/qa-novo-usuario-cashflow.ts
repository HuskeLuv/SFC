/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * QA PROD — cria um usuário de teste NOVO (qa.teste2) e verifica que o fluxo
 * de caixa recém-criado nasce correto:
 *   - árvore = template puro (grupos entrada/despesa/saldo presentes, >100
 *     itens, ZERO valores gravados);
 *   - linha Aporte/Resgate: todas as categorias presentes e zeradas;
 *   - Evolução do Patrimônio = 0 em todos os meses (sem base, sem aportes);
 *   - conta-corrente-anterior = 0, sem snapshots.
 *
 * Criação: registro público está desligado em prod (REGISTRATION_DISABLED)
 * → cria via Prisma replicando o register: bcrypt(BCRYPT_ROUNDS) + 2
 * consents LGPD no mesmo create. Login depois é pela API real (valida hash).
 *
 * Uso (EC2, DENTRO do release atual):
 *   DATABASE_URL=... SFC_BASE_URL=http://localhost:3000 \
 *     npx --no-install tsx scripts/qa-novo-usuario-cashflow.ts
 */
import bcrypt from 'bcrypt';
import prisma from '../src/lib/prisma';
import { BCRYPT_ROUNDS } from '../src/utils/passwordHashing';
import { computeEvolucaoDoMes } from '../src/services/cashflow/evolucaoPatrimonioServer';

const BASE_URL = process.env.SFC_BASE_URL || 'http://localhost:3000';
const EMAIL = 'qa.teste2@myfinance.com';
const PASSWORD = 'P@ssw0rd';
const YEAR = new Date().getFullYear();

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
async function api(path: string, init: { method?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = { Cookie: cookieHeader() };
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
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
const checks: { level: 'PASS' | 'FAIL'; msg: string }[] = [];
function assert(cond: boolean, pass: string, fail: string) {
  checks.push({ level: cond ? 'PASS' : 'FAIL', msg: cond ? pass : fail });
  console.log(`  ${cond ? '✓' : '✗'} ${cond ? pass : fail}`);
}

async function main() {
  console.log(`→ base=${BASE_URL} novo usuário=${EMAIL} ano=${YEAR}\n`);

  // ── criação (idempotente) ──
  let user = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true } });
  if (user) {
    console.log('── usuário já existe (mantendo; verificação segue) ──');
  } else {
    const hashed = await bcrypt.hash(PASSWORD, BCRYPT_ROUNDS);
    user = await prisma.user.create({
      data: {
        email: EMAIL,
        password: hashed,
        name: 'QA Teste 2',
        role: 'user',
        consents: {
          create: [
            { documentType: 'terms-of-use', documentVersion: '1.0', userAgent: 'qa-script' },
            { documentType: 'privacy-policy', documentVersion: '1.1', userAgent: 'qa-script' },
          ],
        },
      },
      select: { id: true },
    });
    console.log(`── usuário criado: ${user.id} (bcrypt rounds=${BCRYPT_ROUNDS}, 2 consents) ──`);
  }
  const uid = user.id;

  // ── login pela API real (valida hash + cookies + csrf) ──
  const login = await api('/api/auth/login', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD },
  });
  assert(login.ok, 'login via API funciona com a senha definida', `login falhou: ${login.status}`);
  if (!login.ok) throw new Error('sem login não dá pra verificar o resto');
  await api('/api/profile');

  // ── árvore do fluxo de caixa (template ensure lazy no GET) ──
  console.log('\n── fluxo de caixa recém-criado ──');
  const tree: any[] = (await api(`/api/cashflow?year=${YEAR}`)).json?.groups ?? [];
  let items = 0;
  let nonZero = 0;
  let valueRows = 0;
  const types = new Set<string>();
  const walk = (g: any) => {
    types.add(g.type);
    for (const it of g.items ?? []) {
      items++;
      for (const v of it.values ?? []) {
        valueRows++;
        if (num(v.value) !== 0) nonZero++;
      }
    }
    (g.children ?? []).forEach(walk);
  };
  tree.forEach(walk);
  assert(
    tree.length > 0 && items > 100,
    `template presente: ${tree.length} grupos raiz, ${items} itens`,
    `template ausente/incompleto: ${tree.length} grupos, ${items} itens`,
  );
  assert(
    types.has('entrada') && types.has('despesa') && types.has('saldo'),
    'blocos entrada + despesa + Conta Corrente (saldo) presentes',
    `tipos faltando: tem só ${[...types].join(',')}`,
  );
  assert(
    nonZero === 0,
    `nenhum valor pré-gravado (${valueRows} células de valor, todas 0)`,
    `${nonZero} valores ≠ 0 num usuário recém-criado!`,
  );
  const saldoGroup = (function find(gs: any[]): any {
    for (const g of gs) {
      if (g.type === 'saldo') return g;
      const c = find(g.children ?? []);
      if (c) return c;
    }
    return null;
  })(tree);
  assert(
    (saldoGroup?.items ?? []).length >= 1,
    `bloco Conta Corrente com ${saldoGroup?.items?.length} item(ns) editável(is)`,
    'bloco Conta Corrente sem itens',
  );

  // ── linha Aporte/Resgate: todas as categorias, zeradas ──
  const inv = (await api(`/api/cashflow/investimentos?year=${YEAR}`)).json ?? {};
  const cats: any[] = inv.investimentos ?? [];
  const catsNonZero = cats.filter((c) => num(c.totalAnual) !== 0);
  assert(
    cats.length >= 15,
    `Aporte/Resgate com todas as categorias (${cats.length}): ${cats
      .map((c: any) => c.name)
      .slice(0, 5)
      .join(', ')}…`,
    `categorias ausentes: só ${cats.length}`,
  );
  assert(
    catsNonZero.length === 0,
    'todas as categorias zeradas (sem transações)',
    `categorias com valor: ${catsNonZero.map((c) => c.name).join(', ')}`,
  );
  assert(
    num(inv.totalGeral) === 0,
    'totalGeral do Aporte/Resgate = 0',
    `totalGeral = ${inv.totalGeral}`,
  );

  // ── insumos da Evolução ──
  const evo = (await api(`/api/cashflow/evolucao-patrimonio?year=${YEAR}`)).json ?? {};
  assert(
    num(evo.baseAplicadaAnterior) === 0,
    'baseAplicadaAnterior = 0',
    `baseAplicadaAnterior = ${evo.baseAplicadaAnterior}`,
  );
  assert(
    (evo.snapshots ?? []).length === 0,
    'sem snapshots',
    `snapshots: ${JSON.stringify(evo.snapshots)}`,
  );
  const cc = (await api(`/api/cashflow/conta-corrente-anterior?year=${YEAR}`)).json ?? {};
  assert(
    num(cc.saldoDezembroAnterior) === 0,
    'saldo Conta Corrente do ano anterior = 0',
    `saldoDezembroAnterior = ${cc.saldoDezembroAnterior}`,
  );

  // ── série da Evolução (módulo do cron) = 0 nos 12 meses ──
  const serie = await Promise.all(
    Array.from({ length: 12 }, (_, m) => computeEvolucaoDoMes(uid, YEAR, m)),
  );
  assert(
    serie.every((v) => Math.abs(v) < 0.005),
    'Evolução do Patrimônio = 0,00 nos 12 meses',
    `série ≠ 0: [${serie.join(', ')}]`,
  );

  // ── seletor de anos ──
  const anos = (await api('/api/cashflow/anos')).json ?? {};
  assert(
    num(anos.minYear) === YEAR || anos.minYear === undefined,
    `seletor de anos começa em ${anos.minYear ?? YEAR}`,
    `minYear inesperado: ${anos.minYear}`,
  );

  const fails = checks.filter((c) => c.level === 'FAIL');
  console.log(`\n============ RELATÓRIO NOVO USUÁRIO ============`);
  console.log(`${checks.filter((c) => c.level === 'PASS').length} PASS, ${fails.length} FAIL`);
  fails.forEach((f) => console.log(`  ✗ ${f.msg}`));
  console.log(`================================================`);
  await prisma.$disconnect();
  if (fails.length) process.exit(2);
}

main().catch(async (e) => {
  console.error('FATAL', e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
