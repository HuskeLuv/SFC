/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * QA do FLUXO DE CAIXA via HTTP real, na conta de teste. Valida:
 *  A) auto-população: um aporte na carteira aparece em "Investimentos" do
 *     cashflow no mês/categoria certos (delta exato), com agregações corretas.
 *  B) categorias presentes batendo com os ativos do usuário + consistência dos
 *     totais (totalAnual = Σ values, totalGeral = Σ totaisPorMes).
 *  C) CRUD manual: criar item, editar valor mensal, editar total anual
 *     (distribui /12), excluir item; e editar valor de um item de entrada.
 *
 * Uso (no EC2): SFC_BASE_URL=http://localhost:3000 npx tsx scripts/qa-prod-cashflow.ts
 */

const BASE_URL = process.env.SFC_BASE_URL || 'http://localhost:3000';
const EMAIL = process.env.QA_EMAIL || 'qa.teste@appmyfinance.com.br';
const PASSWORD = process.env.QA_PASSWORD || 'QaTeste@2026';
const YEAR = 2026;
const JUN = 5; // índice do mês de junho (0-based)

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
  return Number.isFinite(n) ? n : NaN;
};
const checks: { level: 'PASS' | 'FAIL'; msg: string }[] = [];
function assert(cond: boolean, pass: string, fail: string) {
  checks.push({ level: cond ? 'PASS' : 'FAIL', msg: cond ? pass : fail });
  console.log(`  ${cond ? '✓' : '✗'} ${cond ? pass : fail}`);
}
const approx = (a: number, b: number, tol = 0.5) => Math.abs(a - b) <= tol;

async function login() {
  let res = await api('/api/auth/login', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD },
  });
  if (!res.ok) {
    res = await api('/api/auth/register', {
      method: 'POST',
      body: { email: EMAIL, password: PASSWORD, name: 'QA Teste', acceptedTerms: true },
    });
    if (!res.ok) throw new Error(`auth falhou: ${res.status}`);
  }
  await api('/api/profile');
  if (!cookies['csrf-token']) await api('/api/carteira/acoes');
  if (!cookies['csrf-token']) throw new Error('csrf ausente');
  console.log('✓ logado, csrf ok');
}

// helpers cashflow
function flattenItems(groups: any[]): { groupId: string; groupType: string; item: any }[] {
  const out: { groupId: string; groupType: string; item: any }[] = [];
  const walk = (g: any) => {
    for (const it of g.items ?? []) out.push({ groupId: g.id, groupType: g.type, item: it });
    for (const c of g.children ?? []) walk(c);
  };
  groups.forEach(walk);
  return out;
}
async function getCashflow() {
  return (await api(`/api/cashflow?year=${YEAR}`)).json?.groups ?? [];
}
function itemMonthValue(item: any, month: number): number {
  const v = (item?.values ?? []).find((x: any) => num(x.month) === month);
  return v ? num(v.value) : 0;
}
async function getInvest() {
  return (await api(`/api/cashflow/investimentos?year=${YEAR}`)).json ?? {};
}
function investValue(inv: any, name: string, month: number): number {
  const it = (inv.investimentos ?? []).find((i: any) => i.name === name);
  if (!it) return 0;
  const v = (it.values ?? []).find((x: any) => num(x.month) === month);
  return v ? num(v.value) : 0;
}

async function main() {
  console.log(`→ base=${BASE_URL} year=${YEAR}\n`);
  await login();

  // ───────── PART A: auto-população (delta exato) ─────────
  console.log('── A) auto-população: aporte na carteira → "Ações" no cashflow ──');
  const petr = await (async () => {
    const r = await api('/api/assets?tipo=acao&search=PETR4&limit=5');
    const l: any[] = r.json?.assets ?? [];
    return (l.find((a) => a.symbol === 'PETR4') ?? l[0])?.id;
  })();
  const xp = (await api('/api/institutions?search=XP&limit=5')).json?.institutions?.[0]?.id;

  const invBefore = await getInvest();
  const acoesJunBefore = investValue(invBefore, 'Ações', JUN);
  const r = await api('/api/carteira/operacao', {
    method: 'POST',
    csrf: true,
    body: {
      tipoAtivo: 'acao',
      instituicaoId: xp,
      assetId: petr,
      dataCompra: '2026-06-03',
      quantidade: 100,
      cotacaoUnitaria: 40,
      taxaCorretagem: 0,
      estrategia: 'value',
      instituicao: 'XP',
    },
  });
  console.log(`  aporte PETR4 100@40 jun → ${r.status}`);
  const invAfter = await getInvest();
  const acoesJunAfter = investValue(invAfter, 'Ações', JUN);
  console.log(
    `  "Ações" jun: ${acoesJunBefore} → ${acoesJunAfter} (Δ=${(acoesJunAfter - acoesJunBefore).toFixed(2)}, esperado 4000)`,
  );
  assert(
    approx(acoesJunAfter - acoesJunBefore, 4000),
    'aporte aparece em "Ações"/jun com valor exato (qtd×cotação = 4000)',
    `delta inesperado: ${(acoesJunAfter - acoesJunBefore).toFixed(2)}`,
  );

  // ───────── PART B: categorias + agregações ─────────
  console.log('\n── B) categorias presentes + consistência de totais ──');
  const inv = await getInvest();
  const cats = (inv.investimentos ?? []).map(
    (i: any) => `${i.name}=${num(i.totalAnual).toFixed(0)}`,
  );
  console.log(`  categorias: ${cats.join(' | ')}`);
  const byName = (n: string) => (inv.investimentos ?? []).find((i: any) => i.name === n);
  assert(
    num(byName('Ações')?.totalAnual) > 0,
    'categoria Ações presente e > 0',
    'Ações ausente/zero',
  );
  assert(num(byName('FIIs')?.totalAnual) > 0, 'categoria FIIs presente e > 0', 'FIIs ausente/zero');
  assert(num(byName('ETFs')?.totalAnual) > 0, 'categoria ETFs presente e > 0', 'ETFs ausente/zero');
  // consistência: totalAnual de cada tipo == Σ values
  let consistente = true;
  for (const it of inv.investimentos ?? []) {
    const soma = (it.values ?? []).reduce((a: number, v: any) => a + num(v.value), 0);
    if (!approx(soma, num(it.totalAnual))) {
      consistente = false;
      console.log(
        `    ✗ ${it.name}: Σvalues=${soma.toFixed(2)} ≠ totalAnual=${num(it.totalAnual).toFixed(2)}`,
      );
    }
  }
  assert(
    consistente,
    'totalAnual = Σ(valores mensais) em todas as categorias',
    'inconsistência totalAnual vs Σvalores',
  );
  const somaTotaisMes = (inv.totaisPorMes ?? []).reduce((a: number, v: any) => a + num(v), 0);
  assert(
    approx(somaTotaisMes, num(inv.totalGeral)),
    `totalGeral = Σ(totaisPorMes) (${num(inv.totalGeral).toFixed(0)})`,
    `totalGeral ≠ ΣtotaisPorMes (${somaTotaisMes.toFixed(0)} vs ${num(inv.totalGeral).toFixed(0)})`,
  );

  // ───────── PART C: CRUD manual ─────────
  console.log('\n── C) CRUD manual de item ──');
  const groups = await getCashflow();
  const despesaGroup =
    [...flattenItems(groups)].find((f) => f.groupType === 'despesa')?.groupId ??
    (function () {
      let id: string | null = null;
      const walk = (g: any) => {
        if (g.type === 'despesa' && !id) id = g.id;
        (g.children ?? []).forEach(walk);
      };
      groups.forEach(walk);
      return id;
    })();
  if (!despesaGroup) throw new Error('nenhum grupo de despesa encontrado');

  // CREATE
  const created = await api('/api/cashflow/items', {
    method: 'POST',
    csrf: true,
    body: { groupId: despesaGroup, name: 'QA Teste Despesa', descricao: 'QA Teste Despesa' },
  });
  const newItemId = created.json?.item?.id ?? created.json?.id;
  console.log(`  criar item → ${created.status} id=${newItemId}`);
  let cf = await getCashflow();
  let found = flattenItems(cf).find((f) => f.item.id === newItemId);
  assert(
    !!newItemId && !!found,
    'item criado aparece no GET /api/cashflow',
    'item criado não apareceu',
  );

  // EDIT monthlyValue (jun = 250)
  const pm = await api('/api/cashflow/values', {
    method: 'PATCH',
    csrf: true,
    body: { itemId: newItemId, field: 'monthlyValue', value: 250, monthIndex: JUN },
  });
  console.log(`  editar valor jun=250 → ${pm.status}`);
  cf = await getCashflow();
  found = flattenItems(cf).find((f) => f.item.id === newItemId);
  assert(
    approx(itemMonthValue(found?.item, JUN), 250),
    'valor mensal editado (jun=250) reflete no GET',
    `valor jun inesperado: ${itemMonthValue(found?.item, JUN)}`,
  );

  // EDIT annualTotal (1200 → 100/mês)
  const at = await api('/api/cashflow/values', {
    method: 'PATCH',
    csrf: true,
    body: { itemId: newItemId, field: 'annualTotal', value: 1200 },
  });
  console.log(`  editar total anual=1200 → ${at.status}`);
  cf = await getCashflow();
  found = flattenItems(cf).find((f) => f.item.id === newItemId);
  const m0 = itemMonthValue(found?.item, 0);
  const m11 = itemMonthValue(found?.item, 11);
  const soma12 = Array.from({ length: 12 }, (_, m) => itemMonthValue(found?.item, m)).reduce(
    (a, b) => a + b,
    0,
  );
  console.log(`  meses: jan=${m0} dez=${m11} Σ=${soma12}`);
  assert(
    approx(m0, 100) && approx(m11, 100) && approx(soma12, 1200),
    'total anual 1200 distribuído em 100/mês (Σ=1200)',
    `distribuição inesperada: jan=${m0} dez=${m11} Σ=${soma12}`,
  );

  // DELETE item
  const del = await api('/api/cashflow/update', {
    method: 'PATCH',
    csrf: true,
    body: { operation: 'delete', type: 'item', id: newItemId },
  });
  console.log(`  excluir item → ${del.status}`);
  cf = await getCashflow();
  found = flattenItems(cf).find((f) => f.item.id === newItemId);
  assert(!found, 'item excluído sumiu do GET /api/cashflow', 'item ainda presente após exclusão');

  // ───────── PART D: editar item de entrada (personalização de template) ─────────
  console.log('\n── D) editar valor de entrada (Salário) ──');
  cf = await getCashflow();
  const salario = flattenItems(cf).find((f) => /sal[áa]rio/i.test(f.item.name));
  if (salario) {
    const ps = await api('/api/cashflow/values', {
      method: 'PATCH',
      csrf: true,
      body: { itemId: salario.item.id, field: 'monthlyValue', value: 8500, monthIndex: JUN },
    });
    console.log(`  editar Salário jun=8500 → ${ps.status}`);
    cf = await getCashflow();
    const sal2 = flattenItems(cf).find((f) => /sal[áa]rio/i.test(f.item.name));
    assert(
      approx(itemMonthValue(sal2?.item, JUN), 8500),
      'Salário jun=8500 reflete (override de template criado)',
      `Salário jun inesperado: ${itemMonthValue(sal2?.item, JUN)}`,
    );
  } else {
    assert(false, '', 'item Salário não encontrado p/ testar edição de entrada');
  }

  const fails = checks.filter((c) => c.level === 'FAIL');
  console.log(`\n================ RELATÓRIO CASHFLOW ================`);
  console.log(`${checks.filter((c) => c.level === 'PASS').length} PASS, ${fails.length} FAIL`);
  if (fails.length) fails.forEach((f) => console.log(`  ✗ ${f.msg}`));
  console.log(`===================================================`);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
