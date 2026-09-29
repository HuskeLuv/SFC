// Lighthouse mobile (PWA fase 5, fatia E) — mede Performance / Accessibility /
// Best Practices / PWA (instalabilidade) em BUILD DE PRODUÇÃO, autenticado como
// o usuário demo, emulando celular de 390px.
//
// Pré-requisitos (o script NÃO builda nem sobe o servidor):
//   npm run build && npx next start -p 3205
//   (o service worker só registra em build de produção)
//
// Uso:
//   node scripts/lighthouse-mobile.mjs [--base http://localhost:3205] \
//     [--routes /carteira,/fluxodecaixa] [--out /tmp/lighthouse-myfinance] \
//     [--chrome /caminho/do/chrome]
//
// Saída: um JSON completo do Lighthouse por rota em <out>/ + resumo em
// <out>/resumo.json e tabela no stdout. O resumo alimenta docs/pwa/fase5-auditoria.md.
//
// Notas:
// - Usa lighthouse@11.7.1 via npx: a categoria PWA (instalabilidade) foi removida
//   no Lighthouse 12, e a meta da fase (PWA >= 90) precisa dela.
// - Autenticação pela receita da skill verify: POST /api/auth/login (cookie token
//   httpOnly) + GET de página (cookie csrf-token via middleware). Os cookies vão
//   para o Lighthouse por --extra-headers; /signin roda sem cookies.
// - METAS DA FASE: A11y >= 95 e Best Practices >= 95 em todas; PWA >= 90 (instalável);
//   Performance >= 70 nas rotas sem API pesada e >= 55 na /carteira (gargalo de
//   back-end de 2,5–5,0 s documentado na fase 1 — fora do escopo).

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROTAS_PADRAO = [
  '/signin',
  '/carteira',
  '/fluxodecaixa',
  '/fluxodecaixa?modo=orcamento',
  '/calendario',
  '/planejamento-financeiro',
  '/saude-financeira',
  '/relatorios',
  '/dividas',
  '/profile',
];

const DEMO = { email: 'usuario.demo@finapp.local', password: '123456' };

function arg(nome, padrao) {
  const i = process.argv.indexOf(`--${nome}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : padrao;
}

const base = arg('base', 'http://localhost:3205');
const rotas = arg('routes', '') ? arg('routes', '').split(',') : ROTAS_PADRAO;
const outDir = arg('out', path.join(tmpdir(), 'lighthouse-myfinance'));
const chromePath =
  arg('chrome', process.env.CHROME_PATH || '') ||
  path.join(process.env.HOME || '', '.cache/ms-playwright/chromium-1228/chrome-linux64/chrome');

function cookieDeSetCookie(setCookies, nome) {
  for (const c of setCookies) {
    if (c.startsWith(`${nome}=`)) return c.split(';')[0];
  }
  return null;
}

async function autenticar() {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(DEMO),
  });
  if (!res.ok) throw new Error(`login falhou: HTTP ${res.status}`);
  const token = cookieDeSetCookie(res.headers.getSetCookie(), 'token');
  if (!token) throw new Error('login não devolveu o cookie token');
  // O csrf-token só é setado pelo middleware num GET de PÁGINA (não de API).
  const pag = await fetch(`${base}/fluxodecaixa`, {
    headers: { Cookie: token },
    redirect: 'manual',
  });
  const csrf = cookieDeSetCookie(pag.headers.getSetCookie(), 'csrf-token');
  return csrf ? `${token}; ${csrf}` : token;
}

function rodarLighthouse(rota, cookie) {
  const slug = rota.replace(/^\//, '').replace(/[/?=&]+/g, '-') || 'home';
  const outPath = path.join(outDir, `${slug}.json`);
  const flags = [
    '--yes',
    'lighthouse@11.7.1',
    `${base}${rota}`,
    '--output=json',
    `--output-path=${outPath}`,
    '--only-categories=performance,accessibility,best-practices,pwa',
    '--form-factor=mobile',
    '--screenEmulation.mobile',
    '--screenEmulation.width=390',
    '--screenEmulation.height=844',
    '--screenEmulation.deviceScaleFactor=3',
    '--quiet',
    '--chrome-flags=--headless --no-sandbox --disable-gpu',
  ];
  if (cookie) flags.push(`--extra-headers=${JSON.stringify({ Cookie: cookie })}`);
  // No WSL o LOCALAPPDATA do Windows vaza para o env e o chrome-launcher cria
  // diretórios literais "C:\Users\..." no cwd — removê-lo usa o tmp do Linux.
  const env = { ...process.env, CHROME_PATH: chromePath };
  delete env.LOCALAPPDATA;
  const r = spawnSync('npx', flags, {
    stdio: ['ignore', 'inherit', 'inherit'],
    env,
    timeout: 300_000,
  });
  if (r.status !== 0) return { rota, erro: `lighthouse saiu com status ${r.status}` };
  const lhr = JSON.parse(readFileSync(outPath, 'utf8'));
  const nota = (cat) =>
    lhr.categories[cat] && lhr.categories[cat].score != null
      ? Math.round(lhr.categories[cat].score * 100)
      : null;
  const instalavel =
    lhr.audits['installable-manifest'] && lhr.audits['installable-manifest'].score === 1;
  return {
    rota,
    performance: nota('performance'),
    accessibility: nota('accessibility'),
    bestPractices: nota('best-practices'),
    pwa: nota('pwa'),
    instalavel,
    lcpMs: lhr.audits['largest-contentful-paint']?.numericValue ?? null,
    arquivo: outPath,
  };
}

const saude = await fetch(`${base}/api/health`).catch(() => null);
if (!saude || !saude.ok) {
  console.error(`Servidor não responde em ${base} — rode: npm run build && npx next start`);
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
const cookie = await autenticar();
console.log(`Autenticado como ${DEMO.email}; medindo ${rotas.length} rota(s) em ${base}\n`);

const resultados = [];
for (const rota of rotas) {
  const semCookie = rota.startsWith('/signin');
  console.log(`→ ${rota}${semCookie ? ' (sem sessão)' : ''}`);
  resultados.push(rodarLighthouse(rota, semCookie ? null : cookie));
}

writeFileSync(path.join(outDir, 'resumo.json'), JSON.stringify(resultados, null, 2));
console.log('\nRota | Perf | A11y | BP | PWA | Instalável');
for (const r of resultados) {
  console.log(
    r.erro
      ? `${r.rota} | ERRO: ${r.erro}`
      : `${r.rota} | ${r.performance} | ${r.accessibility} | ${r.bestPractices} | ${r.pwa} | ${r.instalavel ? 'sim' : 'NÃO'}`,
  );
}
console.log(`\nJSONs completos + resumo.json em ${outDir}`);
