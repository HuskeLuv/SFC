/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Loga como qa.teste e despeja a série historicoTWR (+ historicoMWR) do /api/carteira/resumo.
 * Uso: SFC_BASE_URL=https://appmyfinance.com.br npx tsx scripts/dump-qa-twr.ts
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
    /* não-JSON */
  }
  return { ok: res.ok, status: res.status, json, text };
}

async function main() {
  console.error(`→ base=${BASE_URL} user=${EMAIL}`);
  const lg = await api('/api/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } });
  if (!lg.ok) throw new Error(`login falhou: ${lg.status} ${lg.text?.slice(0, 120)}`);
  await api('/api/profile');
  const r = await api('/api/carteira/resumo');
  if (!r.ok) throw new Error(`resumo falhou: ${r.status} ${r.text?.slice(0, 200)}`);
  const d = r.json;
  const twr = (d.historicoTWR ?? []) as Array<{ data: number; value: number }>;
  const mwr = (d.historicoMWR ?? []) as Array<{ data: number; value: number }>;
  console.error(
    `rentabilidade(card)=${d.rentabilidade}  twr.len=${twr.length}  mwr.len=${mwr.length}` +
      `  saldoBruto=${d.saldoBruto} totalInvestido=${d.totalInvestido ?? d.aplicado}`,
  );
  const toDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const out: Record<string, { twr: number | null; mwr: number | null }> = {};
  for (const p of twr) out[toDay(p.data)] = { twr: p.value, mwr: null };
  for (const p of mwr) (out[toDay(p.data)] ??= { twr: null, mwr: null }).mwr = p.value;
  process.stdout.write(JSON.stringify(out));
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
