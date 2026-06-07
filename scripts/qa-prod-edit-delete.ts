/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * QA edit/delete E2E via HTTP real, na mesma conta de teste. Cria uma posição
 * dedicada (VALE3) pra não tocar no showcase, e testa:
 *   1. editar transação (PATCH /api/historico/transacao/[id])
 *   2. excluir transação (DELETE /api/historico/transacao/[id])
 *   3. excluir posição inteira (DELETE /api/ativos/[portfolioId]/portfolio)
 * Conferindo quantidade/preço médio/total a cada passo.
 *
 * Uso (no EC2): SFC_BASE_URL=http://localhost:3000 npx tsx scripts/qa-prod-edit-delete.ts
 */

const BASE_URL = process.env.SFC_BASE_URL || 'http://localhost:3000';
const EMAIL = process.env.QA_EMAIL || 'qa.teste@appmyfinance.com.br';
const PASSWORD = process.env.QA_PASSWORD || 'QaTeste@2026';
const SYMBOL = 'VALE3';

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
const approx = (a: number, b: number, tol = 0.02) => Math.abs(a - b) <= tol;

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
    if (!res.ok) throw new Error(`auth falhou: ${res.status} ${res.text.slice(0, 150)}`);
  }
  await api('/api/profile');
  if (!cookies['csrf-token']) await api('/api/carteira/acoes');
  if (!cookies['csrf-token']) throw new Error('csrf ausente');
  console.log(`✓ logado, csrf ok`);
}

// posição atual do SYMBOL via /api/carteira/acoes
async function getPos(): Promise<{
  portfolioId: string;
  qty: number;
  total: number;
  avg: number;
} | null> {
  const r = await api('/api/carteira/acoes');
  return findRow(r.json);
}
function findRow(j: any): any {
  const all: any[] = [];
  const walk = (o: any) => {
    if (o && typeof o === 'object') {
      if (o.ticker === SYMBOL && (o.id || o.portfolioId)) all.push(o);
      for (const k of Object.keys(o)) walk(o[k]);
    }
  };
  walk(j);
  const row = all[0];
  if (!row) return null;
  return {
    portfolioId: row.portfolioId ?? row.id,
    qty: num(row.quantidade),
    total: num(row.valorTotal),
    avg: num(row.precoAquisicao),
  };
}

async function getTransacoes(portfolioId: string): Promise<any[]> {
  const r = await api(`/api/ativos/${portfolioId}?range=MAX`);
  const txs: any[] = r.json?.transacoes ?? [];
  // só transações reais (exclui linhas de ajuste corporativo price=0)
  return txs.filter((t) => num(t.price) > 0 || num(t.cotacaoUnitaria) > 0);
}

async function main() {
  console.log(`→ base=${BASE_URL} symbol=${SYMBOL}\n`);
  await login();

  const valeAsset = await (async () => {
    const r = await api(`/api/assets?tipo=acao&search=${SYMBOL}&limit=5`);
    const list: any[] = r.json?.assets ?? [];
    return (list.find((a) => a.symbol?.toUpperCase() === SYMBOL) ?? list[0])?.id ?? null;
  })();
  const xp = (await api('/api/institutions?search=XP&limit=5')).json?.institutions?.[0]?.id;
  if (!valeAsset || !xp) throw new Error(`lookup falhou: asset=${valeAsset} inst=${xp}`);

  // 0. limpa posição prévia se já existir (idempotência entre rodadas)
  const pre = await getPos();
  if (pre?.portfolioId) {
    console.log('— posição VALE3 pré-existente, removendo p/ rodada limpa —');
    await api(`/api/ativos/${pre.portfolioId}/portfolio`, { method: 'DELETE', csrf: true });
  }

  // 1. cria 3 compras
  console.log('\n── criar posição VALE3 (3 compras) ──');
  const buys = [
    { d: '2026-02-01', q: 100, p: 60 },
    { d: '2026-03-01', q: 100, p: 62 },
    { d: '2026-04-01', q: 100, p: 64 },
  ];
  for (const b of buys) {
    const r = await api('/api/carteira/operacao', {
      method: 'POST',
      csrf: true,
      body: {
        tipoAtivo: 'acao',
        instituicaoId: xp,
        assetId: valeAsset,
        dataCompra: b.d,
        quantidade: b.q,
        cotacaoUnitaria: b.p,
        taxaCorretagem: 0,
        estrategia: 'value',
        instituicao: 'XP',
      },
    });
    console.log(
      `  ${r.ok ? '✓' : '✗'} compra ${b.q}@${b.p} ${b.d} ${r.ok ? '' : r.text.slice(0, 120)}`,
    );
  }
  let pos = await getPos();
  console.log(`  posição: qty=${pos?.qty} avg=${pos?.avg} total=${pos?.total}`);
  assert(
    !!pos && approx(pos.qty, 300) && approx(pos.total, 18600) && approx(pos.avg, 62),
    'inicial: 300 cotas, total 18600, médio 62',
    `inicial inesperado: ${JSON.stringify(pos)}`,
  );

  const portfolioId = pos!.portfolioId;
  const txs = await getTransacoes(portfolioId);
  const txA = txs.find((t) => approx(num(t.price), 60));
  const txB = txs.find((t) => approx(num(t.price), 62));
  if (!txA || !txB)
    throw new Error(
      `não achei transações esperadas. txs=${JSON.stringify(txs.map((t) => ({ id: t.id, q: t.quantity, p: t.price })))}`,
    );

  // 2. EDITAR txA: quantity 100 -> 200 (total deve virar 200*60=12000)
  console.log('\n── EDITAR transação A (100@60 → 200@60) ──');
  const e = await api(`/api/historico/transacao/${txA.id}`, {
    method: 'PATCH',
    csrf: true,
    body: { quantity: 200 },
  });
  console.log(`  PATCH → ${e.status} ${e.ok ? 'ok' : e.text.slice(0, 150)}`);
  pos = await getPos();
  console.log(`  posição: qty=${pos?.qty} avg=${pos?.avg} total=${pos?.total}`);
  // esperado: 400 cotas, total 12000+6200+6400=24600, avg 61.5
  assert(
    !!pos && approx(pos.qty, 400) && approx(pos.total, 24600) && approx(pos.avg, 61.5),
    'após editar: 400 cotas, total 24600, médio 61,50',
    `editar inesperado: ${JSON.stringify(pos)}`,
  );

  // 3. EXCLUIR txB (100@62)
  console.log('\n── EXCLUIR transação B (100@62) ──');
  const d = await api(`/api/historico/transacao/${txB.id}`, { method: 'DELETE', csrf: true });
  console.log(`  DELETE → ${d.status} ${d.ok ? 'ok' : d.text.slice(0, 150)}`);
  pos = await getPos();
  console.log(`  posição: qty=${pos?.qty} avg=${pos?.avg} total=${pos?.total}`);
  // esperado: 300 cotas (200+100), total 12000+6400=18400, avg 61.333
  assert(
    !!pos && approx(pos.qty, 300) && approx(pos.total, 18400) && approx(pos.avg, 61.333, 0.05),
    'após excluir tx: 300 cotas, total 18400, médio 61,33',
    `excluir tx inesperado: ${JSON.stringify(pos)}`,
  );

  // 4. EXCLUIR posição inteira
  console.log('\n── EXCLUIR posição inteira (DELETE portfolio) ──');
  const resumoAntes = await api('/api/carteira/resumo');
  const sbAntes = num(resumoAntes.json?.saldoBruto);
  const dp = await api(`/api/ativos/${portfolioId}/portfolio`, { method: 'DELETE', csrf: true });
  console.log(`  DELETE portfolio → ${dp.status} ${dp.ok ? 'ok' : dp.text.slice(0, 150)}`);
  const posDepois = await getPos();
  assert(
    posDepois === null,
    'VALE3 sumiu da carteira de ações',
    `VALE3 ainda presente: ${JSON.stringify(posDepois)}`,
  );
  // transações também devem sumir → /api/ativos/[id] deve 404
  const detail = await api(`/api/ativos/${portfolioId}?range=MAX`);
  assert(
    detail.status === 404 || detail.status === 400,
    `detalhe do ativo retorna ${detail.status} (posição removida)`,
    `detalhe ainda 200 após exclusão`,
  );
  const resumoDepois = await api('/api/carteira/resumo');
  const sbDepois = num(resumoDepois.json?.saldoBruto);
  console.log(`  saldoBruto: ${sbAntes.toFixed(2)} → ${sbDepois.toFixed(2)}`);
  assert(
    sbDepois < sbAntes,
    `resumo recomputou (saldoBruto caiu ${(sbAntes - sbDepois).toFixed(2)})`,
    `saldoBruto não caiu após exclusão`,
  );

  const fails = checks.filter((c) => c.level === 'FAIL');
  console.log(`\n================ RELATÓRIO EDIT/DELETE ================`);
  console.log(`${checks.filter((c) => c.level === 'PASS').length} PASS, ${fails.length} FAIL`);
  if (fails.length) fails.forEach((f) => console.log(`  ✗ ${f.msg}`));
  console.log(`======================================================`);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
