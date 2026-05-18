/**
 * Tira um snapshot completo da carteira do usuário de teste no SFC e grava
 * em scripts/kinvo-captures/sfc/snapshot-<timestamp>.json. Cada execução é
 * independente — rode periodicamente (D+0, D+1, D+7, D+30) para gerar a série
 * temporal usada na comparação contra o Kinvo.
 *
 * Uso:
 *   npx tsx scripts/kinvo-snapshot-sfc.ts
 */
import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const ENV_FILE = join(process.cwd(), '.env.test');
function loadEnv() {
  const content = readFileSync(ENV_FILE, 'utf-8');
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    let value = m[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = value;
  }
}
loadEnv();

const BASE_URL = process.env.SFC_BASE_URL || 'http://localhost:3000';
const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;

const cookies: Record<string, string> = {};
function captureCookies(headers: Headers) {
  const list =
    typeof (headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === 'function'
      ? (headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
      : (headers.get('set-cookie') ?? '').split(/,(?=\s*[A-Za-z0-9_-]+=)/);
  for (const raw of list) {
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

async function api(path: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { Cookie: cookieHeader() };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE_URL}${path}`, {
    method: body !== undefined ? 'POST' : 'GET',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  captureCookies(res.headers);
  return res;
}

async function login() {
  const res = await api('/api/auth/login', { email: EMAIL, password: PASSWORD });
  if (!res.ok) throw new Error(`Login falhou: ${res.status} ${await res.text()}`);
  if (!cookies.token) throw new Error('Cookie token não foi setado');
  await api('/api/profile'); // trigger CSRF cookie
  console.log(`✓ Logado como ${EMAIL}`);
}

// Endpoints capturados em cada snapshot. Ordem: carteira (por aba) → analises.
const ENDPOINTS = [
  '/api/carteira/acoes',
  '/api/carteira/fii',
  '/api/carteira/etf',
  '/api/carteira/stocks',
  '/api/carteira/moedas-criptos',
  '/api/carteira/previdencia-seguros',
  '/api/carteira/fim-fia',
  '/api/carteira/renda-fixa',
  '/api/carteira/imoveis-bens',
  '/api/carteira/opcoes',
  '/api/carteira/reserva',
  '/api/carteira/reserva-emergencia',
  '/api/carteira/reserva-oportunidade',
  '/api/analises/indices',
  '/api/analises/carteira-historico',
  '/api/analises/risco-retorno',
  '/api/analises/sensibilidade-carteira',
  '/api/analises/cobertura-fgc',
];

interface SnapshotEntry {
  status: number;
  ms: number;
  body: unknown;
}

async function run() {
  await login();
  console.log(`→ Capturando ${ENDPOINTS.length} endpoints…\n`);

  const results: Record<string, SnapshotEntry> = {};
  for (const ep of ENDPOINTS) {
    const t0 = Date.now();
    let res: Response;
    try {
      res = await api(ep);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  ✗ ${ep.padEnd(44)} ${msg}`);
      results[ep] = { status: 0, ms: Date.now() - t0, body: { error: msg } };
      continue;
    }
    const ms = Date.now() - t0;
    let body: unknown;
    const text = await res.text();
    try {
      body = JSON.parse(text);
    } catch {
      body = text.slice(0, 500);
    }
    results[ep] = { status: res.status, ms, body };
    const marker = res.ok ? '✓' : '✗';
    console.log(`  ${marker} ${ep.padEnd(44)} ${res.status} (${ms}ms)`);
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = join(process.cwd(), 'scripts', 'kinvo-captures', 'sfc');
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, `snapshot-${ts}.json`);
  writeFileSync(
    outFile,
    JSON.stringify(
      { timestamp: new Date().toISOString(), user: EMAIL, baseUrl: BASE_URL, results },
      null,
      2,
    ),
  );
  console.log(`\n✓ Snapshot salvo em ${outFile}`);

  printSummary(results);
}

function printSummary(results: Record<string, SnapshotEntry>) {
  console.log('\n─── Resumo por aba ───');
  let totalApl = 0;
  let totalAtu = 0;
  for (const [ep, data] of Object.entries(results)) {
    if (data.status !== 200 || typeof data.body !== 'object' || !data.body) continue;
    const tg = (data.body as { totalGeral?: Record<string, number> }).totalGeral;
    if (!tg || typeof tg.valorAplicado !== 'number') continue;
    totalApl += tg.valorAplicado;
    totalAtu += tg.valorAtualizado || 0;
    const aba = ep.replace('/api/carteira/', '').replace('/api/analises/', '');
    console.log(
      `  ${aba.padEnd(28)} aplic=${(tg.valorAplicado as number).toFixed(2).padStart(10)} atual=${(tg.valorAtualizado || 0).toFixed(2).padStart(10)} rent=${(tg.rentabilidade || 0).toFixed(2).padStart(7)}%`,
    );
  }
  console.log(
    `  ${'TOTAL'.padEnd(28)} aplic=${totalApl.toFixed(2).padStart(10)} atual=${totalAtu.toFixed(2).padStart(10)}`,
  );
  if (totalApl > 0) {
    console.log(
      `  ${'rentabilidade carteira:'.padEnd(28)} ${((totalAtu / totalApl - 1) * 100).toFixed(2)}%`,
    );
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
