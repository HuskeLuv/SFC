/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * QA da aba ANÁLISES via HTTP real. Setup: garante histórico longo (backdata
 * aportes p/ 2024 — idempotente, só adiciona se ainda não houver) para
 * sensibilidade/risco-retorno terem série suficiente. Verify: hita todos os
 * endpoints de análise com asserts de cálculo.
 *
 * Uso (no EC2): SFC_BASE_URL=http://localhost:3000 npx tsx scripts/qa-prod-analise.ts
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

const num = (x: any) => {
  const n = typeof x === 'string' ? parseFloat(x) : Number(x);
  return Number.isFinite(n) ? n : NaN;
};
const checks: { level: 'PASS' | 'WARN' | 'FAIL'; msg: string }[] = [];
function check(cond: boolean, pass: string, fail: string, warn = false) {
  checks.push({ level: cond ? 'PASS' : warn ? 'WARN' : 'FAIL', msg: cond ? pass : fail });
  console.log(`  ${cond ? '✓' : warn ? '⚠' : '✗'} ${cond ? pass : fail}`);
}
function note(msg: string) {
  checks.push({ level: 'PASS', msg });
  console.log(`    · ${msg}`);
}
const approx = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

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

// ── setup: garante histórico desde 2024 (idempotente) ──
async function ensureLongHistory() {
  const acoes = await api('/api/carteira/acoes');
  const petrRow = findRow(acoes.json, 'PETR4');
  if (!petrRow) throw new Error('PETR4 não está na carteira');
  const pid = petrRow.portfolioId ?? petrRow.id;
  const det = await api(`/api/ativos/${pid}?range=MAX`);
  const txs: any[] = det.json?.transacoes ?? [];
  const dates = txs
    .map((t) => new Date(t.date ?? t.data).getTime())
    .filter((d) => Number.isFinite(d));
  const minDate = dates.length ? Math.min(...dates) : Date.now();
  const has2024 = minDate < new Date('2025-01-01').getTime();
  if (has2024) {
    console.log(
      '  histórico longo já existe (1ª transação em ' +
        new Date(minDate).toISOString().slice(0, 10) +
        ') — pulando backdate',
    );
    return;
  }
  console.log('  backdatando aportes para 2024 (histórico p/ análise)…');
  const xp = (await api('/api/institutions?search=XP&limit=5')).json?.institutions?.[0]?.id;
  const petr = await assetId('acao', 'PETR4');
  const hglg = await assetId('fii', 'HGLG11');
  const bova = await assetId('etf', 'BOVA11');
  const ops = [
    {
      tipoAtivo: 'acao',
      assetId: petr,
      dataCompra: '2024-07-15',
      quantidade: 100,
      cotacaoUnitaria: 34,
      estrategia: 'value',
    },
    {
      tipoAtivo: 'acao',
      assetId: petr,
      dataCompra: '2025-01-15',
      quantidade: 100,
      cotacaoUnitaria: 36,
      estrategia: 'value',
    },
    {
      tipoAtivo: 'fii',
      assetId: hglg,
      dataCompra: '2024-07-15',
      quantidade: 20,
      cotacaoUnitaria: 150,
      tipoFii: 'tijolo',
    },
    {
      tipoAtivo: 'etf',
      assetId: bova,
      dataCompra: '2024-07-15',
      quantidade: 30,
      cotacaoUnitaria: 112,
      regiaoEtf: 'brasil',
    },
  ];
  for (const o of ops) {
    const r = await api('/api/carteira/operacao', {
      method: 'POST',
      csrf: true,
      body: { ...o, instituicaoId: xp, taxaCorretagem: 0, instituicao: 'XP' },
    });
    console.log(
      `    ${r.ok ? '✓' : '✗'} ${o.tipoAtivo} ${o.dataCompra} ${o.quantidade}@${o.cotacaoUnitaria} → ${r.status}`,
    );
  }
}

async function main() {
  console.log(`→ base=${BASE_URL}\n`);
  await login();

  console.log('── SETUP: histórico longo ──');
  await ensureLongHistory();

  console.log('\n── VERIFY: análises ──');

  // indicadores
  {
    const r = await api('/api/analises/indicadores');
    const ind = r.json?.indicators ?? {};
    check(
      r.ok && num(ind.ibov?.price) > 0 && num(ind.dolar?.price) > 0,
      'indicadores com valores (IBOV/USD/BTC/ETH)',
      `indicadores HTTP ${r.status} / sem valores`,
    );
    note(
      `IBOV=${num(ind.ibov?.price).toFixed(0)} USD=${num(ind.dolar?.price).toFixed(2)} BTC=${num(ind.bitcoin?.price).toFixed(0)} ETH=${num(ind.ethereum?.price).toFixed(0)}`,
    );
  }
  // indices
  {
    const r = await api('/api/analises/indices?range=2y');
    const idx: any[] = r.json?.indices ?? [];
    check(
      idx.length >= 4,
      `indices: ${idx.length} benchmarks`,
      `só ${idx.length} benchmarks`,
      idx.length < 4,
    );
    for (const name of ['CDI', 'IPCA', 'POUPANCA']) {
      const b = idx.find((i) => i.symbol === name || i.name === name);
      if (b) {
        const vals = (b.data ?? []).map((d: any) => num(d.value));
        // acumulado deve crescer no período (IPCA pode ter mês de deflação, mas
        // o acumulado de 2 anos cresce); CDI/Poupança sempre crescem.
        const grew = vals.length > 1 && vals[vals.length - 1] >= vals[0];
        check(
          grew,
          `${name} acumulado cresceu no período (${vals[0]?.toFixed(1)}→${vals[vals.length - 1]?.toFixed(1)}%)`,
          `${name} não cresceu`,
          true,
        );
      }
    }
  }
  // carteira-historico
  {
    const r = await api('/api/analises/carteira-historico');
    const data: any[] = r.json?.data ?? [];
    check(
      r.ok && data.length > 0,
      `carteira-historico: ${data.length} pontos (retorno acumulado + MWR)`,
      `carteira-historico vazio (${r.status})`,
    );
    const allFinite = data.every((p) => Number.isFinite(num(p.value)));
    check(allFinite, 'série com valores finitos', 'valores não-finitos na série', true);
    if (data.length)
      note(`retorno acumulado último=${num(data[data.length - 1]?.value).toFixed(2)}%`);
  }
  // risco-retorno  (Sharpe = (retorno - CDI) / vol)
  {
    const r = await api('/api/analises/risco-retorno');
    const c = r.json?.carteira ?? {};
    check(r.ok, 'risco-retorno HTTP 200', `risco-retorno HTTP ${r.status}`);
    const vol = num(c.volatilidade),
      ret = num(c.retornoAnual),
      cdi = num(c.retornoCDI),
      sharpe = num(c.sharpe);
    check(vol >= 0, `volatilidade=${vol.toFixed(2)}% ≥ 0`, `volatilidade negativa`);
    check(cdi >= 0, `retornoCDI=${cdi.toFixed(2)}% ≥ 0`, `retornoCDI negativo`, true);
    if (vol > 0 && Number.isFinite(sharpe) && Number.isFinite(ret) && Number.isFinite(cdi)) {
      const sharpeCalc = (ret - cdi) / vol;
      check(
        approx(sharpe, sharpeCalc, 0.05),
        `Sharpe confere: ${sharpe.toFixed(3)} ≈ (${ret.toFixed(1)}−${cdi.toFixed(1)})/${vol.toFixed(1)} = ${sharpeCalc.toFixed(3)}`,
        `Sharpe NÃO bate: ${sharpe.toFixed(3)} vs ${sharpeCalc.toFixed(3)}`,
        true,
      );
    }
    const sens: any[] = r.json?.sensibilidade ?? [];
    const betasOk = sens.every(
      (s) => !Number.isFinite(num(s.beta)) || (num(s.beta) > -3 && num(s.beta) < 5),
    );
    check(betasOk, `betas vs IBOV plausíveis (${sens.length} ativos)`, `beta fora de [-3,5]`, true);
    note(`retornoAnual=${ret.toFixed(2)}% vs CDI=${cdi.toFixed(2)}%`);
  }
  // sensibilidade-carteira (agora deve ter dados)
  {
    const r = await api('/api/analises/sensibilidade-carteira');
    const ativos: any[] = r.json?.ativos ?? [];
    const excl: any[] = r.json?.excluidos ?? [];
    const meses = num(r.json?.mesesUtilizados);
    check(r.ok, 'sensibilidade HTTP 200', `sensibilidade HTTP ${r.status}`);
    check(
      ativos.length > 0,
      `sensibilidade COM dados: ${ativos.length} ativos, ${meses} meses`,
      `sensibilidade vazia (${excl.length} excluídos) — histórico ainda insuficiente`,
      true,
    );
    const corrOk = ativos.every(
      (a) =>
        !Number.isFinite(num(a.correlacao)) ||
        (num(a.correlacao) >= -1.001 && num(a.correlacao) <= 1.001),
    );
    check(corrOk, `correlações em [-1,1]`, `correlação fora de [-1,1]`);
    check(
      num(r.json?.carteira?.volatilidadeAnual) >= 0,
      `volatilidadeAnual ≥ 0`,
      `volatilidadeAnual negativa`,
      true,
    );
    for (const a of ativos.slice(0, 6))
      note(
        `${a.ticker}: corr=${num(a.correlacao).toFixed(2)} contribRisco=${num(a.contribuicaoRisco).toFixed(1)} peso=${(num(a.peso) * 100).toFixed(1)}% [${a.bucket}]`,
      );
  }
  // cobertura-fgc
  {
    const r = await api('/api/analises/cobertura-fgc');
    const resumo = r.json?.resumo ?? {},
      insts: any[] = r.json?.instituicoes ?? [];
    check(r.ok, 'cobertura-fgc HTTP 200', `fgc HTTP ${r.status}`, !r.ok);
    check(num(resumo.totalEfetivamenteCoberto) <= 1_000_001, `coberto global ≤ 1M`, `coberto > 1M`);
    check(
      insts.every((i) => num(i.totalCoberto) <= 250_001),
      `cobertura ≤ 250k/inst (${insts.length} inst)`,
      `inst > 250k`,
    );
    const cob = num(resumo.totalEfetivamenteCoberto) + num(resumo.totalNaoCoberto ?? 0);
    note(
      `RF total=${num(resumo.totalValorRendaFixa).toFixed(0)} coberto=${num(resumo.totalEfetivamenteCoberto).toFixed(0)} (cob+naoCob=${cob.toFixed(0)})`,
    );
  }
  // rentabilidade-janelas
  {
    const r = await api('/api/analises/rentabilidade-janelas');
    const jan = r.json?.janelas ?? {}; // objeto: { lastDay, inTheMonth, inTheYear, ... }
    const keys = Object.keys(jan);
    check(
      r.ok && keys.length > 0,
      `rentabilidade-janelas: ${keys.length} janelas (TWR/MWR vs CDI/IBOV/IPCA)`,
      `janelas vazias (${r.status})`,
      !r.ok,
    );
    for (const k of keys.slice(0, 8)) {
      const w = jan[k];
      note(
        `${k}: TWR=${num(w.portfolioReturn).toFixed(2)}% MWR=${num(w.portfolioMwr).toFixed(2)}% CDI=${num(w.cdiReturn).toFixed(2)}% IBOV=${num(w.ibovReturn).toFixed(2)}%`,
      );
    }
  }
  // portfolio-goal
  {
    const r = await api('/api/analises/portfolio-goal');
    check(r.ok, 'portfolio-goal HTTP 200', `portfolio-goal HTTP ${r.status}`, !r.ok);
  }
  // proventos
  {
    const r = await api('/api/analises/proventos');
    const k = r.json?.kpis ?? {};
    check(r.ok, 'proventos HTTP 200', `proventos HTTP ${r.status}`);
    check(num(k.yoc?.ult12m ?? k.yocUlt12m ?? 0) >= 0, `YoC ≥ 0`, `YoC negativo`, true);
    note(
      `renda acumulada=${num(k.rendaAcumulada?.ult12m ?? k.rendaUlt12m).toFixed(2)} aReceber=${num(k.aReceber?.futuro ?? k.aReceberFuturo).toFixed(2)}`,
    );
  }
  // ir
  {
    const r = await api('/api/analises/ir-resumo-anual?year=2026');
    check(r.ok, 'ir-resumo-anual HTTP 200', `ir HTTP ${r.status}`, !r.ok);
    const cat = r.json?.irPorCategoria ?? {};
    check(
      Object.values(cat).every((v: any) => num(v) >= 0),
      `IR por categoria ≥ 0`,
      `IR negativo`,
    );
  }

  const fails = checks.filter((c) => c.level === 'FAIL');
  const warns = checks.filter((c) => c.level === 'WARN');
  console.log(`\n================ RELATÓRIO ANÁLISES ================`);
  console.log(
    `${checks.filter((c) => c.level === 'PASS').length} PASS, ${warns.length} WARN, ${fails.length} FAIL`,
  );
  if (fails.length) fails.forEach((f) => console.log(`  ✗ ${f.msg}`));
  if (warns.length) warns.forEach((f) => console.log(`  ⚠ ${f.msg}`));
  console.log(`===================================================`);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
