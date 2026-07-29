/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * QA PROD — novo modelo Previdência e Seguros (PR #51), conta qa.teste:
 *   0. lista donos de previdências manuais legadas (PREVIDENCIA-%) e apaga as
 *      da qa.teste (decisão 29/07: previdência manual sai do modelo);
 *      outros donos são apenas REPORTADOS.
 *   1. /api/assets?tipo=previdencia busca fundos CVM classificados;
 *   2. seguro manual via operacao (SEGURO-MANUAL, por valor) → seção Seguros;
 *   3. fundo de previdência CVM via operacao (por cotas) → seção Previdência;
 *   4. aba retorna seções na ordem Previdência→Seguros, cada uma com os itens
 *      certos; cashflow classifica ambos em 'Previdência e Seguros'.
 *
 * Uso (EC2, DENTRO do release atual):
 *   DATABASE_URL=... SFC_BASE_URL=http://localhost:3000 \
 *     npx --no-install tsx scripts/qa-previdencia-seguros-prod.ts
 */
import prisma from '../src/lib/prisma';

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
let PASS = 0;
const FAILS: string[] = [];
const ok = (cond: boolean, pass: string, fail: string) => {
  if (cond) {
    PASS++;
    console.log(`  ✓ ${pass}`);
  } else {
    FAILS.push(fail);
    console.log(`  ✗ ${fail}`);
  }
};

async function main() {
  console.log(`→ base=${BASE_URL} conta=${EMAIL}\n`);
  const user = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true } });
  if (!user) throw new Error('qa.teste não existe');

  // ── 0. limpeza das previdências manuais legadas ──
  console.log('── previdências manuais legadas (PREVIDENCIA-%) ──');
  const legadas = await prisma.asset.findMany({
    where: { type: 'previdencia', source: 'manual', symbol: { startsWith: 'PREVIDENCIA-' } },
    select: {
      id: true,
      symbol: true,
      portfolios: { select: { userId: true, user: { select: { email: true } } } },
    },
  });
  for (const a of legadas) {
    const owners = [...new Set(a.portfolios.map((p) => p.user.email))];
    const mine = a.portfolios.every((p) => p.userId === user.id) && a.portfolios.length > 0;
    const orphan = a.portfolios.length === 0;
    if (mine || orphan) {
      await prisma.stockTransaction.deleteMany({ where: { assetId: a.id } });
      await prisma.portfolioProvento.deleteMany({ where: { portfolio: { assetId: a.id } } });
      await prisma.portfolio.deleteMany({ where: { assetId: a.id } });
      await prisma.watchlist.deleteMany({ where: { assetId: a.id } });
      await prisma.asset.delete({ where: { id: a.id } });
      console.log(`  − apagada: ${a.symbol} (${orphan ? 'órfã' : 'qa.teste'})`);
    } else {
      console.log(`  ⚠ MANTIDA (dono não é qa.teste): ${a.symbol} → ${owners.join(', ')}`);
    }
  }
  if (!legadas.length) console.log('  (nenhuma encontrada)');

  // ── login ──
  const login = await api('/api/auth/login', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD },
  });
  if (!login.ok) throw new Error(`login falhou: ${login.status}`);
  await api('/api/profile');
  if (!cookies['csrf-token']) await api('/api/carteira/acoes');

  // ── 1. busca de fundos de previdência no catálogo ──
  console.log('\n── busca /api/assets?tipo=previdencia ──');
  let prevAsset: any = null;
  for (const term of ['prev', 'brasilprev', 'icatu', 'vgbl', 'pgbl']) {
    const r = await api(`/api/assets?tipo=previdencia&search=${term}&limit=5`);
    const list: any[] = r.json?.assets ?? [];
    if (list.length) {
      prevAsset = list[0];
      console.log(
        `  busca "${term}": ${list.length} resultado(s) — ex: ${list[0].name?.slice(0, 60)}`,
      );
      break;
    }
  }
  ok(
    !!prevAsset,
    'catálogo devolve fundos de previdência CVM',
    'NENHUM fundo de previdência no catálogo (verificar classificação CVM)',
  );

  // ── 2. seguro manual (por valor) ──
  console.log('\n── seguro manual ──');
  const itau = (await api('/api/institutions?search=Itaú&limit=5')).json?.institutions?.[0]?.id;
  const rSeg = await api('/api/carteira/operacao', {
    method: 'POST',
    csrf: true,
    body: {
      tipoAtivo: 'previdencia',
      instituicaoId: itau,
      assetId: 'SEGURO-MANUAL',
      ativo: 'Seguro de Vida Resgatável QA',
      nomePersonalizado: 'Seguro de Vida Resgatável QA',
      dataCompra: '2026-07-15',
      valorInvestido: 1500,
      metodo: 'valor',
      instituicao: 'Itaú',
    },
  });
  ok(
    rSeg.ok,
    `seguro criado (${rSeg.status})`,
    `seguro falhou: ${rSeg.status} ${rSeg.text.slice(0, 120)}`,
  );

  // ── 3. fundo de previdência CVM (por cotas) ──
  console.log('\n── fundo de previdência CVM ──');
  if (prevAsset) {
    const cota = Number(prevAsset.currentPrice) > 0 ? Number(prevAsset.currentPrice) : 10;
    const rPrev = await api('/api/carteira/operacao', {
      method: 'POST',
      csrf: true,
      body: {
        tipoAtivo: 'previdencia',
        instituicaoId: itau,
        assetId: prevAsset.id,
        ativo: prevAsset.name,
        dataCompra: '2026-07-15',
        quantidade: 100,
        cotacaoUnitaria: cota,
        metodo: 'cotas',
        instituicao: 'Itaú',
      },
    });
    ok(
      rPrev.ok,
      `fundo de previdência comprado por cotas (100 × ${cota})`,
      `compra do fundo falhou: ${rPrev.status} ${rPrev.text.slice(0, 150)}`,
    );
  }

  // ── 4. aba: seções e classificação ──
  console.log('\n── aba Previdência e Seguros ──');
  const tab = (await api('/api/carteira/previdencia-seguros')).json ?? {};
  const tipos = (tab.secoes ?? []).map((s: any) => s.tipo);
  ok(
    JSON.stringify(tipos) === JSON.stringify(['growth_fundos_prev', 'seguro']),
    'seções na ordem Previdência → Seguros',
    `ordem inesperada: ${JSON.stringify(tipos)}`,
  );
  const secPrev = (tab.secoes ?? []).find((s: any) => s.tipo === 'growth_fundos_prev');
  const secSeg = (tab.secoes ?? []).find((s: any) => s.tipo === 'seguro');
  ok(
    (secSeg?.ativos ?? []).some((a: any) => /Seguro de Vida Resgatável QA/.test(a.nome)),
    `seguro na seção Seguros (${secSeg?.ativos?.length} item/ns)`,
    `seguro não apareceu na seção Seguros: ${JSON.stringify(secSeg?.ativos?.map((a: any) => a.nome))}`,
  );
  if (prevAsset) {
    ok(
      (secPrev?.ativos ?? []).length > 0,
      `fundo na seção Previdência (${secPrev?.ativos?.length} item/ns)`,
      'seção Previdência vazia após compra do fundo',
    );
  }

  // ── 5. cashflow: ambos no bucket Previdência e Seguros ──
  const inv = (await api('/api/cashflow/investimentos?year=2026')).json ?? {};
  const prevSeg = (inv.investimentos ?? []).find((c: any) => c.name === 'Previdência e Seguros');
  const jul = (prevSeg?.values ?? []).find((v: any) => v.month === 6)?.value ?? 0;
  ok(
    jul > 0,
    `cashflow: Previdência e Seguros jul=${jul}`,
    `cashflow não refletiu os aportes (jul=${jul})`,
  );

  console.log(`\n============ RELATÓRIO PREVIDÊNCIA/SEGUROS ============`);
  console.log(`${PASS} PASS, ${FAILS.length} FAIL`);
  FAILS.forEach((f) => console.log(`  ✗ ${f}`));
  console.log(`=======================================================`);
  await prisma.$disconnect();
  if (FAILS.length) process.exit(2);
}

main().catch(async (e) => {
  console.error('FATAL', e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
