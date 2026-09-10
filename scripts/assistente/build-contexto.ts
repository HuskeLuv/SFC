/**
 * Monta o "retrato" compacto da conta de teste que o harness injeta no prompt
 * — a mesma montagem que o app usa em produção (src/services/assistente/contexto.ts),
 * só que via HTTP contra um servidor rodando.
 *
 * Uso (dev server no ar):
 *   npx tsx --env-file=.env scripts/assistente/build-contexto.ts
 * Variáveis opcionais: HARNESS_BASE_URL (http://localhost:3000),
 *   HARNESS_EMAIL / HARNESS_PASSWORD (usuário demo), HARNESS_YEAR (ano atual).
 * Saída: docs/assistente/contexto.json (gitignored — contém dados de uma conta).
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  classesComPosicao,
  montarContexto,
  type CarteiraClasseLike,
  type CashGroupLike,
  type Json,
} from '../../src/services/assistente/contexto';

const BASE = process.env.HARNESS_BASE_URL ?? 'http://localhost:3000';
const EMAIL = process.env.HARNESS_EMAIL ?? 'usuario.demo@finapp.local';
const PASSWORD = process.env.HARNESS_PASSWORD ?? '123456';
const YEAR = Number(process.env.HARNESS_YEAR ?? new Date().getFullYear());
const OUT = path.join(process.cwd(), 'docs', 'assistente', 'contexto.json');

async function login(): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`login ${res.status}: ${await res.text()}`);
  const cookies = res.headers.getSetCookie?.() ?? [];
  const token = cookies.map((c) => c.split(';')[0]).find((c) => c.startsWith('token='));
  if (!token) throw new Error('login sem cookie token');
  return token;
}

async function get<T = Json>(cookie: string, ep: string): Promise<T | null> {
  const res = await fetch(`${BASE}${ep}`, { headers: { Cookie: cookie } });
  if (!res.ok) {
    console.warn(`  ! ${ep} → ${res.status}`);
    return null;
  }
  return (await res.json()) as T;
}

async function main() {
  console.log(`Base: ${BASE} · usuário: ${EMAIL} · ano: ${YEAR}`);
  const cookie = await login();

  const resumo = await get(cookie, '/api/carteira/resumo');
  const classes = classesComPosicao(resumo);
  const [cashflow, orcamento, dividas, saude, sonhos, ...posicoesArr] = await Promise.all([
    get<{ groups: CashGroupLike[] }>(cookie, `/api/cashflow?year=${YEAR}`),
    get(cookie, `/api/cashflow/orcamento?year=${YEAR}`),
    get<{ dividas: Json[] }>(cookie, '/api/dividas'),
    get(cookie, '/api/saude-financeira'),
    get<{ objetivos: Json[] }>(cookie, '/api/planejamento-sonhos'),
    ...classes.map((c) => get<CarteiraClasseLike>(cookie, `/api/carteira/${c}`)),
  ]);
  const posicoes: Record<string, CarteiraClasseLike | null> = {};
  classes.forEach((c, i) => {
    posicoes[c] = posicoesArr[i];
  });

  const contexto = montarContexto({
    ano: YEAR,
    resumo,
    posicoes,
    cashflow,
    orcamento,
    dividas,
    saude,
    sonhos,
  });

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ usuario: EMAIL, ...contexto }, null, 1));
  const bytes = fs.statSync(OUT).size;
  console.log(
    `✓ ${path.relative(process.cwd(), OUT)} — ${bytes} bytes (~${Math.round(bytes / 3.2)} tokens)`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
