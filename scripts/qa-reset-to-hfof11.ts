/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Limpa TODOS os ativos da conta qa.teste e adiciona só HFOF11
 * (100 cotas, 2024-06-07, R$ 73,15). Via HTTP real, como qa.teste.
 * Uso: SFC_BASE_URL=https://appmyfinance.com.br npx tsx scripts/qa-reset-to-hfof11.ts
 */
const BASE_URL = process.env.SFC_BASE_URL || 'http://localhost:3000';
const EMAIL = process.env.QA_EMAIL || 'qa.teste@appmyfinance.com.br';
const PASSWORD = process.env.QA_PASSWORD || 'QaTeste@2026';

const CARTEIRA_ENDPOINTS = [
  'acoes',
  'fii',
  'etf',
  'reit',
  'fim-fia',
  'moedas-criptos',
  'opcoes',
  'previdencia-seguros',
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
  const res = await api('/api/auth/login', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD },
  });
  if (!res.ok) throw new Error(`login falhou: ${res.status} ${res.text?.slice(0, 120)}`);
  await api('/api/profile');
  if (!cookies['csrf-token']) await api('/api/carteira/acoes');
  if (!cookies['csrf-token']) throw new Error('csrf ausente após login');
}

// Coleta {id, ticker} de todas as posições de uma resposta de carteira.
function collectRows(j: any): Array<{ id: string; ticker: string }> {
  const out: Array<{ id: string; ticker: string }> = [];
  const walk = (n: any) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(walk);
    const id = n.id as string | undefined;
    const tk = (n.ticker ?? n.symbol ?? n.codigo) as string | undefined;
    if (typeof id === 'string' && typeof tk === 'string') out.push({ id, ticker: tk });
    Object.values(n).forEach(walk);
  };
  walk(j);
  // dedup por id
  return [...new Map(out.map((r) => [r.id, r])).values()];
}

async function assetId(tipo: string, sym: string): Promise<string | undefined> {
  const r = await api(`/api/assets?tipo=${tipo}&search=${sym}&limit=8`);
  const l: any[] = r.json?.assets ?? [];
  return (l.find((a) => a.symbol?.toUpperCase() === sym) ?? l[0])?.id;
}

async function main() {
  console.log(`→ base=${BASE_URL}  user=${EMAIL}`);
  await login();
  console.log('✓ logado');

  // 1) LIMPAR tudo
  let removed = 0;
  for (const ep of CARTEIRA_ENDPOINTS) {
    const r = await api(`/api/carteira/${ep}`);
    if (!r.ok) continue;
    const rows = collectRows(r.json);
    for (const row of rows) {
      const del = await api(`/api/ativos/${row.id}/portfolio`, { method: 'DELETE', csrf: true });
      console.log(`  • del ${row.ticker.padEnd(8)} (${ep}) → ${del.status}`);
      if (del.ok) removed++;
    }
  }
  console.log(`✓ ${removed} posição(ões) removida(s)`);

  // 2) ADICIONAR HFOF11
  const aid = await assetId('fii', 'HFOF11');
  if (!aid) throw new Error('HFOF11 não encontrado no catálogo');
  const xp = (await api('/api/institutions?search=XP&limit=5')).json?.institutions?.[0]?.id;
  const add = await api('/api/carteira/operacao', {
    method: 'POST',
    csrf: true,
    body: {
      tipoAtivo: 'fii',
      assetId: aid,
      dataCompra: '2024-06-07',
      quantidade: 100,
      cotacaoUnitaria: 73.15,
      instituicaoId: xp,
      instituicao: 'XP',
      taxaCorretagem: 0,
      tipoFii: 'tijolo',
    },
  });
  console.log(
    `✓ add HFOF11 (100 @ R$73,15 em 2024-06-07) → ${add.status} ${add.ok ? '✅' : '✗ ' + (add.json?.error ?? add.text?.slice(0, 120))}`,
  );

  // 3) Conferir
  const chk = collectRows((await api('/api/carteira/fii')).json).filter((r) => r.ticker === 'HFOF11');
  const acoes = collectRows((await api('/api/carteira/acoes')).json);
  console.log(`\nEstado final: HFOF11 presente=${chk.length > 0}; ações restantes=${acoes.length}`);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
