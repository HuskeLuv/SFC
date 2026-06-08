/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * QA das JANELAS DE PERÍODO (alinhamento mês-calendário estilo Kinvo) via HTTP real.
 *
 * Valida que /api/analises/rentabilidade-janelas devolve janelas ancoradas no
 * dia 1º do mês-calendário (in12/24/36Months, inTheMonth, inTheYear) e NÃO mais
 * a janela rolante dia-a-dia (hoje − N). Inclui guarda de regressão: a data de
 * início de uma janela não-clampada nunca pode coincidir com a data dia-exato
 * antiga (quando hoje ≠ dia 1º).
 *
 * Setup idempotente: garante histórico desde ~2023 para que in24/in36 fiquem
 * NÃO-clampadas (start alinhado > primeiro ponto) e o alinhamento seja testável.
 *
 * Uso: SFC_BASE_URL=http://localhost:3000 npx tsx scripts/qa-prod-period-window.ts
 */

const BASE_URL = process.env.SFC_BASE_URL || 'http://localhost:3000';
const EMAIL = process.env.QA_EMAIL || 'qa.teste@appmyfinance.com.br';
const PASSWORD = process.env.QA_PASSWORD || 'QaTeste@2026';

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

const checks: { level: 'PASS' | 'WARN' | 'FAIL'; msg: string }[] = [];
function check(cond: boolean, pass: string, fail: string, warn = false) {
  checks.push({ level: cond ? 'PASS' : warn ? 'WARN' : 'FAIL', msg: cond ? pass : fail });
  console.log(`  ${cond ? '✓' : warn ? '⚠' : '✗'} ${cond ? pass : fail}`);
}
function note(msg: string) {
  console.log(`    · ${msg}`);
}

// ── lógica de janela espelhada do src/utils/periodWindow.ts (mês-calendário) ──
/** Dia 1º do mês corrente recuado (N−1) meses, em UTC (compara y-m-d sem TZ). */
function expectedInicioNMesesUTC(n: number, ref: Date): string {
  const d = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1));
  d.setUTCMonth(d.getUTCMonth() - (n - 1));
  return d.toISOString().slice(0, 10);
}
/** Janela rolante antiga (dia-exato): hoje − N meses, em UTC. Guarda de regressão. */
function oldRollingStartUTC(n: number, ref: Date): string {
  const d = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()));
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 10);
}
const ymd = (iso: string | null | undefined) =>
  iso ? new Date(iso).toISOString().slice(0, 10) : '';
const dayOf = (iso: string) => new Date(iso).toISOString().slice(8, 10);

async function login() {
  let res = await api('/api/auth/login', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD },
  });
  if (!res.ok)
    res = await api('/api/auth/register', {
      method: 'POST',
      body: { email: EMAIL, password: PASSWORD, name: 'QA Teste', acceptedTerms: true },
    });
  await api('/api/profile');
  if (!cookies['csrf-token']) await api('/api/carteira/acoes');
  if (!cookies['csrf-token']) throw new Error('csrf ausente');
  console.log('✓ logado');
}

function findRow(j: any, ticker: string): any {
  let found: any = null;
  const walk = (o: any) => {
    if (o && typeof o === 'object') {
      if (o.ticker === ticker && (o.id || o.portfolioId)) found = found ?? o;
      for (const k of Object.keys(o)) walk(o[k]);
    }
  };
  walk(j);
  return found;
}
async function assetId(tipo: string, sym: string) {
  const r = await api(`/api/assets?tipo=${tipo}&search=${sym}&limit=5`);
  const l: any[] = r.json?.assets ?? [];
  return (l.find((a) => a.symbol?.toUpperCase() === sym) ?? l[0])?.id;
}

// ── setup: garante histórico desde ~2023 (idempotente) para in24/in36 não-clampadas ──
async function ensureDeepHistory() {
  const acoes = await api('/api/carteira/acoes');
  const petrRow = findRow(acoes.json, 'PETR4');
  if (!petrRow) {
    console.log('  PETR4 ausente — backdatando aporte inicial 2023…');
  } else {
    const pid = petrRow.portfolioId ?? petrRow.id;
    const det = await api(`/api/ativos/${pid}?range=MAX`);
    const txs: any[] = det.json?.transacoes ?? [];
    const minDate = Math.min(
      ...txs.map((t) => new Date(t.date ?? t.data).getTime()).filter((d) => Number.isFinite(d)),
    );
    if (Number.isFinite(minDate) && minDate < new Date('2023-06-01').getTime()) {
      console.log(
        '  histórico profundo já existe (1ª transação ' +
          new Date(minDate).toISOString().slice(0, 10) +
          ') — pulando backdate',
      );
      return;
    }
    console.log('  backdatando aporte para 2023-01 (para in24/in36 não-clampadas)…');
  }
  const xp = (await api('/api/institutions?search=XP&limit=5')).json?.institutions?.[0]?.id;
  const petr = await assetId('acao', 'PETR4');
  const r = await api('/api/carteira/operacao', {
    method: 'POST',
    csrf: true,
    body: {
      tipoAtivo: 'acao',
      assetId: petr,
      dataCompra: '2023-01-16',
      quantidade: 100,
      cotacaoUnitaria: 25,
      estrategia: 'value',
      instituicaoId: xp,
      instituicao: 'XP',
      taxaCorretagem: 0,
    },
  });
  console.log(`    ${r.ok ? '✓' : '✗'} aporte PETR4 2023-01-16 100@25 → ${r.status}`);
}

async function main() {
  console.log(`→ base=${BASE_URL}\n`);
  await login();

  console.log('── SETUP: histórico profundo (≥2023) ──');
  await ensureDeepHistory();

  console.log('\n── VERIFY: rentabilidade-janelas alinhadas ao mês-calendário ──');
  const r = await api('/api/analises/rentabilidade-janelas');
  const jan = r.json?.janelas ?? {};
  check(r.ok && Object.keys(jan).length > 0, 'rentabilidade-janelas respondeu', `HTTP ${r.status}`);

  // "now" de referência = asOf do servidor (mesma base que ele usou pra calcular)
  const ref = new Date(r.json?.asOf ?? new Date().toISOString());
  const firstPoint = ymd(jan.fromBegin?.fromDate);
  note(`asOf=${ref.toISOString().slice(0, 10)}  primeiro ponto da série=${firstPoint}`);

  // inTheMonth → dia 1º do mês corrente
  {
    const got = ymd(jan.inTheMonth?.fromDate);
    const exp = expectedInicioNMesesUTC(1, ref);
    check(
      got === exp || got === firstPoint,
      `inTheMonth ancora no dia 1º (${got})`,
      `inTheMonth=${got}, esperado ${exp}`,
    );
  }
  // inTheYear → 1º de janeiro
  {
    const got = ymd(jan.inTheYear?.fromDate);
    const expJan = `${ref.getUTCFullYear()}-01-01`;
    check(
      got === expJan || got === firstPoint,
      `inTheYear ancora em 01/01 (${got})`,
      `inTheYear=${got}, esperado ${expJan}`,
    );
  }

  // in12/24/36Months → dia 1º (clampa ao primeiro ponto se a janela exceder o histórico)
  const cap = ([k, n]: [string, number]) => {
    const w = jan[k];
    const got = ymd(w?.fromDate);
    const aligned = expectedInicioNMesesUTC(n, ref);
    const old = oldRollingStartUTC(n, ref);
    const expected = aligned > firstPoint ? aligned : firstPoint; // clamp ao firstPoint
    const clamped = expected === firstPoint && aligned <= firstPoint;

    check(
      got === expected,
      `${k}: fromDate=${got} confere com ${clamped ? 'firstPoint (clampada)' : `alinhada ${aligned}`}`,
      `${k}: fromDate=${got} ≠ esperado ${expected} (alinhada=${aligned}, firstPoint=${firstPoint})`,
    );

    if (!clamped) {
      // não-clampada: deve cair no dia 1º
      check(dayOf(got) === '01', `${k}: ancorada no dia 1º`, `${k}: dia=${dayOf(got)} (não é 1º)`);
      // guarda de regressão: não pode ser a janela rolante antiga (quando hoje ≠ dia 1º)
      if (ref.getUTCDate() !== 1) {
        check(
          got !== old,
          `${k}: NÃO é a janela rolante antiga (${old})`,
          `${k}: REGRESSÃO — voltou pra janela rolante dia-exato (${old})`,
        );
      }
    } else {
      note(`${k}: clampada ao primeiro ponto (janela alinhada ${aligned} < ${firstPoint})`);
    }
  };
  (
    [
      ['in12Months', 12],
      ['in24Months', 24],
      ['in36Months', 36],
    ] as [string, number][]
  ).forEach(cap);

  const fails = checks.filter((c) => c.level === 'FAIL');
  const warns = checks.filter((c) => c.level === 'WARN');
  console.log(`\n============ RELATÓRIO JANELAS DE PERÍODO ============`);
  console.log(
    `${checks.filter((c) => c.level === 'PASS').length} PASS, ${warns.length} WARN, ${fails.length} FAIL`,
  );
  if (fails.length) fails.forEach((f) => console.log(`  ✗ ${f.msg}`));
  if (warns.length) warns.forEach((f) => console.log(`  ⚠ ${f.msg}`));
  console.log(`======================================================`);
  if (fails.length) process.exit(1);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
