/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * QA resgate + edição de metadados via HTTP real, na conta de teste. Posição
 * dedicada VALE3 (não toca no showcase). Testa:
 *   1. editar metadados/custódia (PATCH /api/ativos/[id] {instituicaoId})
 *   2. resgate parcial (POST /api/carteira/resgate, metodo quantidade)
 *      → preço médio (custo médio) deve permanecer; quantidade/total reduzem
 *   3. IR de ganho de capital (venda > R$20k/mês de ações B3 → tributável 15%)
 *   4. resgate total → posição zera/some
 *
 * Uso (no EC2): SFC_BASE_URL=http://localhost:3000 npx tsx scripts/qa-prod-resgate-metadata.ts
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
  console.log('✓ logado, csrf ok');
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
async function getPos() {
  return findRow((await api('/api/carteira/acoes')).json);
}
async function inst(search: string): Promise<string> {
  const r = await api(`/api/institutions?search=${encodeURIComponent(search)}&limit=5`);
  const id = r.json?.institutions?.[0]?.id;
  if (!id) throw new Error(`instituição ${search} não achada`);
  return id;
}

async function main() {
  console.log(`→ base=${BASE_URL} symbol=${SYMBOL}\n`);
  await login();

  const valeAsset = await (async () => {
    const r = await api(`/api/assets?tipo=acao&search=${SYMBOL}&limit=5`);
    const list: any[] = r.json?.assets ?? [];
    return (list.find((a) => a.symbol?.toUpperCase() === SYMBOL) ?? list[0])?.id ?? null;
  })();
  const xp = await inst('XP');
  const btg = await inst('BTG');
  if (!valeAsset) throw new Error('VALE3 não achado no catálogo');

  // limpa posição prévia
  const pre = await getPos();
  if (pre?.portfolioId)
    await api(`/api/ativos/${pre.portfolioId}/portfolio`, { method: 'DELETE', csrf: true });

  // 1. cria posição: 1000 @ 60 (lote único, custo médio 60)
  console.log('\n── criar VALE3 1000@60 (custo médio 60) ──');
  await api('/api/carteira/operacao', {
    method: 'POST',
    csrf: true,
    body: {
      tipoAtivo: 'acao',
      instituicaoId: xp,
      assetId: valeAsset,
      dataCompra: '2026-02-01',
      quantidade: 1000,
      cotacaoUnitaria: 60,
      taxaCorretagem: 0,
      estrategia: 'value',
      instituicao: 'XP',
    },
  });
  let pos = await getPos();
  console.log(`  posição: qty=${pos?.qty} avg=${pos?.avg} total=${pos?.total}`);
  assert(
    !!pos && approx(pos.qty, 1000) && approx(pos.avg, 60),
    'inicial: 1000 cotas @ médio 60',
    `inicial inesperado: ${JSON.stringify(pos)}`,
  );
  const pid = pos!.portfolioId;

  // 2. EDITAR METADADOS: troca custódia XP → BTG
  console.log('\n── EDITAR METADADOS: custódia XP → BTG ──');
  const m = await api(`/api/ativos/${pid}`, {
    method: 'PATCH',
    csrf: true,
    body: { instituicaoId: btg },
  });
  console.log(
    `  PATCH → ${m.status} ${m.ok ? JSON.stringify(m.json?.instituicao) : m.text.slice(0, 150)}`,
  );
  const det = await api(`/api/ativos/${pid}?range=MAX`);
  const instNome =
    det.json?.ativo?.instituicao?.nome ?? JSON.stringify(det.json?.ativo?.instituicao);
  console.log(`  custódia agora: ${instNome}`);
  assert(
    m.ok && /BTG/i.test(String(instNome)),
    'custódia atualizada para BTG',
    `custódia não refletiu BTG: ${instNome}`,
  );

  // 3. RESGATE PARCIAL: vende 400 @ 75 (venda 30000 > 20k → tributável; ganho (75-60)*400=6000)
  console.log('\n── RESGATE PARCIAL: vende 400 @ 75 em 2026-05-02 ──');
  const r1 = await api('/api/carteira/resgate', {
    method: 'POST',
    csrf: true,
    body: {
      portfolioId: pid,
      dataResgate: '2026-05-02',
      metodoResgate: 'quantidade',
      quantidade: 400,
      cotacaoUnitaria: 75,
      instituicaoId: btg,
    },
  });
  console.log(`  resgate → ${r1.status} ${r1.ok ? 'ok' : r1.text.slice(0, 150)}`);
  pos = await getPos();
  console.log(`  posição: qty=${pos?.qty} avg=${pos?.avg} total=${pos?.total}`);
  // esperado: qty 600, avg 60 (custo médio NÃO muda na venda), total 36000
  assert(
    !!pos && approx(pos.qty, 600) && approx(pos.avg, 60) && approx(pos.total, 36000),
    'após resgate parcial: 600 cotas, médio 60 (inalterado), total 36000',
    `resgate parcial inesperado: ${JSON.stringify(pos)}`,
  );

  // 4. IR de ganho de capital (venda 30000 > 20k → 15% sobre ganho 6000 = 900)
  console.log('\n── IR de ganho de capital (2026) ──');
  const irAnual = await api('/api/analises/ir-resumo-anual?year=2026');
  const irMensal = await api('/api/analises/ir-mensal?year=2026');
  console.log(
    `  ir-resumo-anual: ${irAnual.status} ${JSON.stringify(irAnual.json?.irPorCategoria ?? irAnual.json).slice(0, 300)}`,
  );
  console.log(`  ir-mensal: ${irMensal.status}`);
  // soft: procura QUALQUER ganho/IR de RV positivo no payload (campo varia)
  const blob = JSON.stringify(irAnual.json) + JSON.stringify(irMensal.json);
  const rvIr = num(irAnual.json?.irPorCategoria?.rendaVariavelBr);
  const temGanho =
    /"(lucro|ganho|rendaVariavelBr|irDevido)"\s*:\s*(?!0[,}\]])[1-9]/.test(blob) ||
    (Number.isFinite(rvIr) && rvIr > 0);
  assert(
    (irAnual.ok || irMensal.ok) && temGanho,
    'IR reflete ganho de capital realizado da venda (>R$20k → tributável)',
    `IR não refletiu ganho — revisar (rvIr=${rvIr})`,
  );

  // 5. RESGATE TOTAL: vende as 600 restantes @ 80 em 2026-06-02 → posição zera
  console.log('\n── RESGATE TOTAL: vende 600 @ 80 em 2026-06-02 ──');
  const r2 = await api('/api/carteira/resgate', {
    method: 'POST',
    csrf: true,
    body: {
      portfolioId: pid,
      dataResgate: '2026-06-02',
      metodoResgate: 'quantidade',
      quantidade: 600,
      cotacaoUnitaria: 80,
      instituicaoId: btg,
    },
  });
  console.log(`  resgate total → ${r2.status} ${r2.ok ? 'ok' : r2.text.slice(0, 150)}`);
  pos = await getPos();
  const zerou = pos === null || approx(pos.qty, 0, 0.001);
  console.log(`  posição depois: ${pos ? `qty=${pos.qty}` : 'REMOVIDA'}`);
  assert(
    zerou,
    'após resgate total: posição zerada/removida',
    `posição não zerou: ${JSON.stringify(pos)}`,
  );

  // limpeza: se sobrou linha zerada, remove
  if (pos?.portfolioId)
    await api(`/api/ativos/${pos.portfolioId}/portfolio`, { method: 'DELETE', csrf: true });

  const fails = checks.filter((c) => c.level === 'FAIL');
  console.log(`\n================ RELATÓRIO RESGATE/METADADOS ================`);
  console.log(`${checks.filter((c) => c.level === 'PASS').length} PASS, ${fails.length} FAIL`);
  if (fails.length) fails.forEach((f) => console.log(`  ✗ ${f.msg}`));
  console.log(`============================================================`);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
