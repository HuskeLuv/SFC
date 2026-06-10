/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * QA dos gráficos de ativos que sofreram SPLIT, via HTTP real, como qa.teste.
 *
 * Para cada ativo (um por vez): adiciona uma compra ANTES do split, e verifica
 * que a solução banco-only funciona:
 *   1. QUANTIDADE split-ajustada (qty_comprada × fator dos eventos pós-compra)
 *      → prova que o evento corporativo é aplicado (gráfico de valor não tem
 *      "penhasco fantasma" na data do split, pois qty compensa a queda de preço);
 *   2. PROVENTOS presentes (renda na série / retorno total);
 *   3. GRÁFICO (série do /api/ativos/[id]) tem dados e SEM queda diária > 50%.
 *
 * Idempotente: pula o add se o ativo já estiver na carteira.
 * Uso: SFC_BASE_URL=https://appmyfinance.com.br npx tsx scripts/qa-split-graphs.ts [--symbols=A,B]
 */
const BASE_URL = process.env.SFC_BASE_URL || 'http://localhost:3000';
const EMAIL = process.env.QA_EMAIL || 'qa.teste@appmyfinance.com.br';
const PASSWORD = process.env.QA_PASSWORD || 'QaTeste@2026';

const onlySyms = (process.argv.find((a) => a.startsWith('--symbols=')) || '')
  .split('=')[1]
  ?.split(',')
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);

interface Target {
  sym: string;
  tipo: 'fii' | 'acao' | 'etf';
  buy: string; // antes do split
  qty: number;
  price: number;
}
const TARGETS: Target[] = [
  { sym: 'HFOF11', tipo: 'fii', buy: '2024-06-03', qty: 100, price: 90 },
  { sym: 'ZAVI11', tipo: 'fii', buy: '2025-06-02', qty: 100, price: 95 },
  { sym: 'TEPP11', tipo: 'fii', buy: '2025-06-02', qty: 100, price: 95 },
  { sym: 'RBFM11', tipo: 'fii', buy: '2025-08-01', qty: 100, price: 95 },
  { sym: 'CARE11', tipo: 'fii', buy: '2025-09-01', qty: 100, price: 9 },
  { sym: 'SBSP3', tipo: 'acao', buy: '2025-10-01', qty: 100, price: 95 },
  { sym: 'B3SA3', tipo: 'acao', buy: '2020-06-01', qty: 100, price: 50 },
  { sym: 'MXRF11', tipo: 'fii', buy: '2016-09-01', qty: 100, price: 10 },
  { sym: 'HGLG11', tipo: 'fii', buy: '2017-06-01', qty: 50, price: 120 },
  { sym: 'GOAU4', tipo: 'acao', buy: '2025-06-02', qty: 100, price: 10 },
];

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
    /* não-JSON */
  }
  return { ok: res.ok, status: res.status, json, text };
}

async function login() {
  let res = await api('/api/auth/login', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD },
  });
  if (!res.ok) {
    res = await api('/api/auth/register', {
      method: 'POST',
      body: { name: 'QA Teste', email: EMAIL, password: PASSWORD },
    });
  }
  await api('/api/profile');
  if (!cookies['csrf-token']) await api('/api/carteira/acoes');
  if (!cookies['csrf-token']) throw new Error('csrf ausente após login');
}

// Procura recursivamente a linha da carteira cujo ticker/symbol bata.
function findRow(j: any, sym: string): any {
  let found: any = null;
  const walk = (n: any) => {
    if (found || !n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(walk);
    const tk = (n.ticker ?? n.symbol ?? n.codigo) as string | undefined;
    if (typeof tk === 'string' && tk.toUpperCase() === sym) {
      found = n;
      return;
    }
    Object.values(n).forEach(walk);
  };
  walk(j);
  return found;
}

async function assetId(tipo: string, sym: string): Promise<string | undefined> {
  const r = await api(`/api/assets?tipo=${tipo}&search=${sym}&limit=8`);
  const l: any[] = r.json?.assets ?? [];
  return (l.find((a) => a.symbol?.toUpperCase() === sym) ?? l[0])?.id;
}

const carteiraPath = (tipo: string) =>
  tipo === 'acao' ? '/api/carteira/acoes' : `/api/carteira/${tipo}`;
const getRow = async (t: Target) => findRow((await api(carteiraPath(t.tipo))).json, t.sym);

async function qaAsset(t: Target, idx: number, n: number) {
  console.log(
    `\n${'═'.repeat(70)}\n[${idx}/${n}] ${t.sym} (${t.tipo}) — compra ${t.qty} em ${t.buy} (antes do split)`,
  );

  // RESET: remove posição pré-existente pra a quantidade ficar exata (compra única).
  const existing = await getRow(t);
  if (existing?.id) {
    const del = await api(`/api/ativos/${existing.id}/portfolio`, { method: 'DELETE', csrf: true });
    console.log(`  • reset posição anterior → ${del.status}`);
  }

  // ADD: compra única antes do split.
  const aid = await assetId(t.tipo === 'acao' ? 'acao' : t.tipo, t.sym);
  if (!aid) {
    console.log('  ✗ não encontrado no catálogo de prod — PULANDO');
    return { sym: t.sym, ok: false, reason: 'não no catálogo' };
  }
  const extra =
    t.tipo === 'fii'
      ? { tipoFii: 'tijolo' }
      : t.tipo === 'etf'
        ? { regiaoEtf: 'brasil' }
        : { estrategia: 'value' };
  const xp = (await api('/api/institutions?search=XP&limit=5')).json?.institutions?.[0]?.id;
  const r = await api('/api/carteira/operacao', {
    method: 'POST',
    csrf: true,
    body: {
      tipoAtivo: t.tipo,
      assetId: aid,
      dataCompra: t.buy,
      quantidade: t.qty,
      cotacaoUnitaria: t.price,
      instituicaoId: xp,
      instituicao: 'XP',
      taxaCorretagem: 0,
      ...extra,
    },
  });
  console.log(
    `  • add operacao → ${r.status} ${r.ok ? '✓' : '✗ ' + (r.json?.error ?? r.text?.slice(0, 80))}`,
  );
  if (!r.ok) return { sym: t.sym, ok: false, reason: `operacao ${r.status}` };

  const row = await getRow(t);
  const pid = row?.id;

  // fator cumulativo dos eventos APÓS a compra
  const ca = await api(`/api/carteira/corporate-actions?symbol=${t.sym}`);
  const evs: any[] = ca.json?.corporateActions ?? (Array.isArray(ca.json) ? ca.json : []);
  const buyMs = new Date(t.buy).getTime();
  const cumFactor = evs
    .filter((e) => new Date(e.date).getTime() > buyMs && Number(e.factor) > 0)
    .reduce((f, e) => f * Number(e.factor), 1);
  const evDesc = evs
    .map((e) => `${e.completeFactor ?? e.factor}@${String(e.date).slice(0, 10)}`)
    .join(', ');

  // detalhe (posição + gráficos + proventos)
  const det = (await api(`/api/ativos/${pid}?range=MAX`)).json ?? {};
  const patr: any[] = det.historicoPatrimonio ?? [];
  const twr: any[] = det.historicoTWR ?? [];
  const provs: any[] = det.proventos ?? [];

  // 1) QUANTIDADE split-ajustada
  const expectedQty = t.qty * cumFactor;
  const actualQty = Number(row?.quantidade ?? det.posicao?.quantidade ?? NaN);
  const qtyOk =
    Number.isFinite(actualQty) && Math.abs(actualQty - expectedQty) / expectedQty < 0.02;
  console.log(
    `  1) SPLIT [${evDesc}] fator pós-compra ×${cumFactor} → esperado ${expectedQty} | real ${actualQty}  ${qtyOk ? '✅' : '❌'}`,
  );

  // 2) PROVENTOS na série (retorno total)
  const provTotal = provs.reduce((s, p) => s + Number(p.valorTotal ?? 0), 0);
  const provOk = provs.length > 0;
  console.log(
    `  2) PROVENTOS: ${provs.length} lançamento(s), total ~R$ ${provTotal.toFixed(2)}  ${provOk ? '✅' : '⚠️ nenhum'}`,
  );

  // 3) GRÁFICO sem penhasco fantasma: maior queda diária do saldoBruto
  let maxDrop = 0;
  let dropDate = '';
  for (let i = 1; i < patr.length; i++) {
    const a = Number(patr[i - 1].saldoBruto);
    const b = Number(patr[i].saldoBruto);
    if (a > 0 && b >= 0) {
      const drop = (a - b) / a;
      if (drop > maxDrop) {
        maxDrop = drop;
        dropDate = new Date(patr[i].data).toISOString().slice(0, 10);
      }
    }
  }
  const cliff = maxDrop > 0.5;
  console.log(
    `  3) GRÁFICO: ${patr.length} pts patrimônio + ${twr.length} TWR; maior queda diária ${(maxDrop * 100).toFixed(1)}%${dropDate ? ' em ' + dropDate : ''}  ${patr.length > 2 ? (cliff ? '❌ PENHASCO FANTASMA' : '✅ sem penhasco') : '⚠️ série curta'}`,
  );

  const ok = qtyOk && provOk && !cliff && patr.length > 2;
  console.log(`  → ${ok ? '✅ OK' : '❌ revisar'}`);
  return {
    sym: t.sym,
    ok,
    qtyOk,
    provOk,
    cliff,
    expectedQty,
    actualQty,
    provCount: provs.length,
    points: patr.length,
  };
}

async function main() {
  console.log(`→ base=${BASE_URL}  user=${EMAIL}`);
  await login();
  console.log('✓ logado');
  const list = onlySyms ? TARGETS.filter((t) => onlySyms.includes(t.sym)) : TARGETS;
  const results: any[] = [];
  for (let i = 0; i < list.length; i++) {
    try {
      results.push(await qaAsset(list[i], i + 1, list.length));
    } catch (e) {
      console.log(`  ✗ erro: ${e instanceof Error ? e.message : e}`);
      results.push({ sym: list[i].sym, ok: false, reason: 'exceção' });
    }
  }
  console.log(`\n${'═'.repeat(70)}\nRESUMO`);
  for (const r of results) {
    console.log(
      `  ${r.ok ? '✅' : '❌'} ${r.sym.padEnd(8)} ${r.ok ? `qty=${r.actualQty} prov=${r.provCount} pts=${r.points}` : (r.reason ?? `qty:${r.qtyOk} prov:${r.provOk} penhasco:${r.cliff}`)}`,
    );
  }
  const okN = results.filter((r) => r.ok).length;
  console.log(`\n${okN}/${results.length} OK\n`);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
