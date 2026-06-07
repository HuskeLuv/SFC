/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * QA smoke test E2E via HTTP real (sem Prisma). Cria/loga um usuário de teste,
 * popula TODAS as seções com dados desde jan/2026 usando os endpoints reais
 * (register → login → CSRF → operacao/cashflow/sonhos/aposentadoria), depois
 * GETa cada seção e roda invariantes de plausibilidade, imprimindo um relatório.
 *
 * Uso (no EC2, contra o app rodando):
 *   SFC_BASE_URL=http://localhost:3000 npx tsx scripts/qa-prod-smoke.ts
 *
 * Env:
 *   SFC_BASE_URL    (default http://localhost:3000)
 *   QA_EMAIL        (default qa.teste@appmyfinance.com.br)
 *   QA_PASSWORD     (default QaTeste@2026)
 */

const BASE_URL = process.env.SFC_BASE_URL || 'http://localhost:3000';
const EMAIL = process.env.QA_EMAIL || 'qa.teste@appmyfinance.com.br';
const PASSWORD = process.env.QA_PASSWORD || 'QaTeste@2026';

const MONTHS = ['2026-01-15', '2026-02-15', '2026-03-16', '2026-04-15', '2026-05-15'];

// ─── cookie jar + api helper ────────────────────────────────────────────────
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

async function api(
  path: string,
  init: { method?: string; body?: unknown; csrf?: boolean } = {},
): Promise<{ status: number; ok: boolean; json: any; text: string }> {
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
    /* not json */
  }
  return { status: res.status, ok: res.ok, json, text };
}

// ─── relatório ──────────────────────────────────────────────────────────────
const seedResults: { label: string; ok: boolean; detail: string }[] = [];
const checks: { section: string; level: 'PASS' | 'WARN' | 'FAIL'; msg: string }[] = [];
function check(section: string, cond: boolean, passMsg: string, failMsg: string, warn = false) {
  checks.push({
    section,
    level: cond ? 'PASS' : warn ? 'WARN' : 'FAIL',
    msg: cond ? passMsg : failMsg,
  });
}
function note(section: string, msg: string) {
  checks.push({ section, level: 'PASS', msg });
}

// ─── auth ───────────────────────────────────────────────────────────────────
async function ensureUserAndLogin() {
  let res = await api('/api/auth/login', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD },
  });
  if (res.status === 401 || res.status === 400) {
    res = await api('/api/auth/register', {
      method: 'POST',
      body: { email: EMAIL, password: PASSWORD, name: 'QA Teste', acceptedTerms: true },
    });
    if (!res.ok) throw new Error(`register falhou: ${res.status} ${res.text.slice(0, 200)}`);
  } else if (!res.ok) {
    throw new Error(`login falhou: ${res.status} ${res.text.slice(0, 200)}`);
  }
  if (!cookies.token) throw new Error('sem cookie token após auth');
  await api('/api/profile');
  if (!cookies['csrf-token']) await api('/api/carteira/acoes');
  if (!cookies['csrf-token']) throw new Error('csrf-token não setado');
  console.log(`✓ autenticado como ${EMAIL}, csrf ok`);
}

// ─── lookups ────────────────────────────────────────────────────────────────
async function instId(search: string): Promise<string> {
  const res = await api(`/api/institutions?search=${encodeURIComponent(search)}&limit=5`);
  const found = res.json?.institutions?.[0];
  if (!found) throw new Error(`instituição "${search}" não achada`);
  return found.id;
}
async function assetId(tipo: string, search: string): Promise<string | null> {
  const res = await api(
    `/api/assets?tipo=${encodeURIComponent(tipo)}&search=${encodeURIComponent(search)}&limit=5`,
  );
  const list: any[] = res.json?.assets ?? [];
  const exact = list.find((a) => a.symbol?.toUpperCase() === search.toUpperCase());
  return (exact ?? list[0])?.id ?? null;
}

async function op(label: string, body: Record<string, unknown>) {
  const res = await api('/api/carteira/operacao', { method: 'POST', body, csrf: true });
  seedResults.push({
    label,
    ok: res.ok,
    detail: res.ok ? 'ok' : `${res.status} ${res.text.slice(0, 160)}`,
  });
  if (res.ok) console.log(`  ✓ ${label}`);
  else console.log(`  ✗ ${label} → ${res.status} ${res.text.slice(0, 160)}`);
}

// ─── seed ───────────────────────────────────────────────────────────────────
async function seed() {
  const xp = await instId('XP');
  const btg = await instId('BTG');
  const avenue = await instId('Avenue');
  const itau = await instId('Itaú');

  const petr = await assetId('acao', 'PETR4');
  const itub = await assetId('acao', 'ITUB4');
  const hglg = await assetId('fii', 'HGLG11');
  const bova = (await assetId('etf', 'BOVA11')) ?? (await assetId('etf', 'IVVB11'));
  const btc = await assetId('criptoativo', 'BTC');
  const tesIpca =
    (await assetId('tesouro-direto', 'IPCA')) ?? (await assetId('tesouro-direto', 'Tesouro'));

  // DCA mensal em ações/FII/ETF (jan-mai)
  let i = 0;
  for (const d of MONTHS) {
    i++;
    if (petr)
      await op(`acao PETR4 ${d}`, {
        tipoAtivo: 'acao',
        instituicaoId: xp,
        assetId: petr,
        dataCompra: d,
        quantidade: 100,
        cotacaoUnitaria: 36 + i,
        taxaCorretagem: 0,
        estrategia: 'value',
        instituicao: 'XP',
      });
    if (hglg)
      await op(`fii HGLG11 ${d}`, {
        tipoAtivo: 'fii',
        instituicaoId: xp,
        assetId: hglg,
        dataCompra: d,
        quantidade: 20,
        cotacaoUnitaria: 158 + i,
        taxaCorretagem: 0,
        tipoFii: 'tijolo',
        instituicao: 'XP',
      });
    if (bova)
      await op(`etf BOVA11 ${d}`, {
        tipoAtivo: 'etf',
        instituicaoId: xp,
        assetId: bova,
        dataCompra: d,
        quantidade: 30,
        cotacaoUnitaria: 120 + i,
        taxaCorretagem: 0,
        regiaoEtf: 'brasil',
        instituicao: 'XP',
      });
  }
  // alguns aportes pontuais
  if (itub)
    await op('acao ITUB4 jan', {
      tipoAtivo: 'acao',
      instituicaoId: itau,
      assetId: itub,
      dataCompra: MONTHS[0],
      quantidade: 200,
      cotacaoUnitaria: 33,
      taxaCorretagem: 0,
      estrategia: 'value',
      instituicao: 'Itaú',
    });
  if (itub)
    await op('acao ITUB4 abr', {
      tipoAtivo: 'acao',
      instituicaoId: itau,
      assetId: itub,
      dataCompra: MONTHS[3],
      quantidade: 100,
      cotacaoUnitaria: 35,
      taxaCorretagem: 0,
      estrategia: 'value',
      instituicao: 'Itaú',
    });
  if (btc) {
    await op('cripto BTC jan', {
      tipoAtivo: 'criptoativo',
      instituicaoId: btg,
      assetId: btc,
      dataCompra: MONTHS[0],
      quantidade: 0.01,
      cotacaoCompra: 350000,
      taxaCorretagem: 0,
      instituicao: 'BTG',
    });
    await op('cripto BTC abr', {
      tipoAtivo: 'criptoativo',
      instituicaoId: btg,
      assetId: btc,
      dataCompra: MONTHS[3],
      quantidade: 0.005,
      cotacaoCompra: 400000,
      taxaCorretagem: 0,
      instituicao: 'BTG',
    });
  }
  // stock US manual
  await op('stock AAPL jan', {
    tipoAtivo: 'stock',
    instituicaoId: avenue,
    assetId: 'STOCK-MANUAL',
    ativo: 'AAPL',
    nomePersonalizado: 'Apple Inc.',
    dataCompra: MONTHS[0],
    quantidade: 10,
    cotacaoUnitaria: 180,
    moeda: 'USD',
    cotacaoMoeda: 5.2,
    taxaCorretagem: 0,
    estrategia: 'growth',
    instituicao: 'Avenue',
  });

  // renda fixa
  await op('CDB 110%CDI', {
    tipoAtivo: 'renda-fixa-posfixada',
    instituicaoId: btg,
    rendaFixaTipo: 'CDB_PRE',
    dataInicio: MONTHS[0],
    dataVencimento: '2028-01-15',
    valorAplicado: 20000,
    descricao: 'CDB Liquidez Diária 110% CDI',
    taxaJurosAnual: 110,
    rendaFixaIndexer: 'CDI',
    rendaFixaIndexerPercent: 110,
    instituicao: 'BTG',
  });
  await op('LCI 95%CDI isenta', {
    tipoAtivo: 'renda-fixa-posfixada',
    instituicaoId: btg,
    rendaFixaTipo: 'LCI_PRE',
    dataInicio: MONTHS[1],
    dataVencimento: '2027-02-15',
    valorAplicado: 15000,
    descricao: 'LCI 95% CDI',
    taxaJurosAnual: 95,
    rendaFixaIndexer: 'CDI',
    rendaFixaIndexerPercent: 95,
    rendaFixaTaxExempt: true,
    instituicao: 'BTG',
  });
  if (tesIpca)
    await op('tesouro IPCA+', {
      tipoAtivo: 'tesouro-direto',
      instituicaoId: xp,
      assetId: tesIpca,
      dataCompra: MONTHS[0],
      metodo: 'valor',
      valorInvestido: 10000,
      tesouroDestino: 'renda-fixa-hibrida',
      dataInicio: MONTHS[0],
      dataVencimento: '2045-05-15',
      rendaFixaIndexer: 'IPCA',
      rendaFixaIndexerPercent: 100,
      taxaJurosAnual: 6,
      descricao: 'Tesouro IPCA+ 2045',
      instituicao: 'XP',
    });

  // fundo, previdencia, reserva
  await op('fundo FIM manual', {
    tipoAtivo: 'fundo',
    instituicaoId: xp,
    assetId: 'FUNDO-MANUAL',
    ativo: 'Fundo Multimercado QA',
    nomePersonalizado: 'Fundo Multimercado QA',
    fundoDestino: 'fim',
    dataCompra: MONTHS[0],
    valorInvestido: 12000,
    metodo: 'valor',
    instituicao: 'XP',
  });
  await op('previdencia manual', {
    tipoAtivo: 'previdencia',
    instituicaoId: itau,
    assetId: 'PREVIDENCIA-MANUAL',
    ativo: 'Brasilprev PGBL QA',
    nomePersonalizado: 'Brasilprev PGBL QA',
    dataCompra: MONTHS[0],
    valorInvestido: 8000,
    metodo: 'valor',
    instituicao: 'Itaú',
  });
  await op('reserva emergencia', {
    tipoAtivo: 'emergency',
    instituicaoId: itau,
    dataCompra: MONTHS[0],
    valorInvestido: 25000,
    ativo: 'Reserva de Emergência (6 meses)',
    instituicao: 'Itaú',
  });
}

// ─── seed cashflow / sonhos / aposentadoria ─────────────────────────────────
async function seedCashflow() {
  const res = await api('/api/cashflow?year=2026');
  const groups: any[] = res.json?.groups ?? [];
  const flat: { groupId: string; itemId: string; name: string; groupType: string }[] = [];
  const walk = (g: any) => {
    for (const it of g.items ?? [])
      flat.push({ groupId: g.id, itemId: it.id, name: it.name, groupType: g.type });
    for (const c of g.children ?? []) walk(c);
  };
  groups.forEach(walk);
  const income =
    flat.find((f) => /sal[áa]rio/i.test(f.name)) ?? flat.find((f) => f.groupType === 'entrada');
  const expense =
    flat.find((f) => /aluguel|supermercado/i.test(f.name)) ??
    flat.find((f) => f.groupType === 'despesa');
  let ok = 0;
  for (const target of [
    income ? { ...income, base: 9000 } : null,
    expense ? { ...expense, base: 2500 } : null,
  ]) {
    if (!target) continue;
    const values = [0, 1, 2, 3, 4].map((m) => ({ month: m, value: target.base + m * 50 }));
    const r = await api('/api/cashflow/batch-update', {
      method: 'PUT',
      body: { groupId: target.groupId, updates: [{ itemId: target.itemId, values }] },
      csrf: true,
    });
    if (r.ok) ok++;
    seedResults.push({
      label: `cashflow ${target.name}`,
      ok: r.ok,
      detail: r.ok ? 'ok' : `${r.status} ${r.text.slice(0, 120)}`,
    });
  }
  console.log(`  cashflow: ${ok} itens populados`);
}

async function seedSonhos() {
  for (const body of [
    {
      name: 'Reserva de Emergência',
      target: 60000,
      months: 24,
      startDate: '2026-01',
      available: 25000,
      rate: 0.008,
      priority: 'Alta',
      status: 'Iniciado',
    },
    {
      name: 'Viagem Internacional',
      target: 30000,
      months: 18,
      startDate: '2026-01',
      available: 5000,
      rate: 0.006,
      priority: 'Moderado',
      status: 'Iniciado',
    },
    {
      name: 'Casa Própria',
      target: 500000,
      months: 120,
      startDate: '2026-01',
      available: 50000,
      rate: 0.01,
      priority: 'Alta',
      status: 'Em espera',
    },
  ]) {
    const r = await api('/api/planejamento-sonhos', { method: 'POST', body, csrf: true });
    seedResults.push({
      label: `sonho ${body.name}`,
      ok: r.ok,
      detail: r.ok ? 'ok' : `${r.status} ${r.text.slice(0, 120)}`,
    });
  }
}

async function seedAposentadoria() {
  const r = await api('/api/aposentadoria', {
    method: 'PUT',
    body: {
      idade: 35,
      apos: 60,
      vida: 90,
      rentNom: 8,
      inflacao: 4,
      rentNomRetiro: 6,
      patrimonio: 150000,
      aporteM: 3000,
      renda: 12000,
      trackStartMonth: 1,
      trackStartYear: 2026,
      eventos: [],
    },
    csrf: true,
  });
  seedResults.push({
    label: 'aposentadoria PUT',
    ok: r.ok,
    detail: r.ok ? 'ok' : `${r.status} ${r.text.slice(0, 120)}`,
  });
}

// ─── verify ─────────────────────────────────────────────────────────────────
function num(x: any): number {
  const n = typeof x === 'string' ? parseFloat(x) : Number(x);
  return Number.isFinite(n) ? n : NaN;
}

async function verify() {
  // 1. resumo
  {
    const r = await api('/api/carteira/resumo');
    const j = r.json ?? {};
    check('resumo', r.ok, `HTTP 200`, `HTTP ${r.status}`);
    const sb = num(j.saldoBruto),
      va = num(j.valorAplicado);
    check('resumo', sb > 0, `saldoBruto=${sb.toFixed(2)}`, `saldoBruto inválido (${j.saldoBruto})`);
    check(
      'resumo',
      va > 0,
      `valorAplicado=${va.toFixed(2)}`,
      `valorAplicado inválido (${j.valorAplicado})`,
    );
    const dist = j.distribuicao ?? {};
    const somaPct = Object.values(dist).reduce((a: number, c: any) => a + num(c?.percentual), 0);
    const somaVal = Object.values(dist).reduce((a: number, c: any) => a + num(c?.valor), 0);
    check(
      'resumo',
      somaPct > 95 && somaPct < 105,
      `Σ alocação% = ${somaPct.toFixed(1)}%`,
      `Σ alocação% = ${somaPct.toFixed(1)}% (esperado ~100)`,
      true,
    );
    check(
      'resumo',
      Math.abs(somaVal - sb) / Math.max(sb, 1) < 0.02,
      `Σ valores = saldoBruto (${somaVal.toFixed(0)})`,
      `Σ valores (${somaVal.toFixed(0)}) ≠ saldoBruto (${sb.toFixed(0)})`,
      true,
    );
    const hp = j.historicoPatrimonio ?? [],
      twr = j.historicoTWR ?? [];
    check(
      'resumo',
      hp.length > 0,
      `historicoPatrimonio: ${hp.length} pts`,
      `historicoPatrimonio vazio`,
    );
    check('resumo', twr.length > 0, `historicoTWR: ${twr.length} pts`, `historicoTWR vazio`, true);
    if (hp.length)
      check(
        'resumo',
        hp.every((p: any) => num(p.saldoBruto) >= 0 && num(p.valorAplicado) >= 0),
        'patrimônio sempre ≥ 0',
        'patrimônio negativo em algum ponto',
      );
    note(
      'resumo',
      `rentabilidade=${num(j.rentabilidade).toFixed(2)}%  caixaParaInvestir=${num(j.caixaParaInvestir).toFixed(2)}`,
    );
  }

  // 2. abas de carteira
  for (const [name, path] of [
    ['acoes', '/api/carteira/acoes'],
    ['fii', '/api/carteira/fii'],
    ['etf', '/api/carteira/etf'],
    ['moedas-criptos', '/api/carteira/moedas-criptos'],
    ['renda-fixa', '/api/carteira/renda-fixa'],
    ['previdencia-seguros', '/api/carteira/previdencia-seguros'],
    ['fim-fia', '/api/carteira/fim-fia'],
    ['reserva-emergencia', '/api/carteira/reserva-emergencia'],
  ] as const) {
    const r = await api(path);
    check(`carteira/${name}`, r.ok, `HTTP 200`, `HTTP ${r.status} ${r.text.slice(0, 80)}`);
  }

  // 3. análises
  {
    const r = await api('/api/analises/indices?range=2y');
    const idx: any[] = r.json?.indices ?? [];
    check('indices', r.ok, `HTTP 200`, `HTTP ${r.status}`);
    check(
      'indices',
      idx.length >= 4,
      `${idx.length} benchmarks (CDI/IPCA/IBOV/Poupança)`,
      `só ${idx.length} benchmarks`,
      idx.length < 4,
    );
    for (const b of idx) {
      const vals = (b.data ?? []).map((d: any) => num(d.value));
      const last = vals[vals.length - 1];
      note(
        'indices',
        `${b.symbol}: ${vals.length} pts, último=${Number.isFinite(last) ? last.toFixed(1) : '?'}%`,
      );
    }
  }
  {
    const r = await api('/api/analises/proventos');
    check('proventos', r.ok, `HTTP 200`, `HTTP ${r.status}`);
    const kpis = r.json?.kpis ?? {};
    note(
      'proventos',
      `rendaUlt12m=${num(kpis.rendaUlt12m).toFixed(2)} aReceberFuturo=${num(kpis.aReceberFuturo).toFixed(2)}`,
    );
  }
  {
    const r = await api('/api/analises/risco-retorno');
    const c = r.json?.carteira ?? {};
    check('risco-retorno', r.ok, `HTTP 200`, `HTTP ${r.status}`);
    check(
      'risco-retorno',
      num(c.volatilidade) >= 0,
      `volatilidade=${num(c.volatilidade).toFixed(2)}%`,
      `volatilidade negativa`,
      true,
    );
    const sens: any[] = r.json?.sensibilidade ?? [];
    const betasOk = sens.every(
      (s) => !Number.isFinite(num(s.beta)) || (num(s.beta) > -3 && num(s.beta) < 5),
    );
    check(
      'risco-retorno',
      betasOk,
      `betas plausíveis (${sens.length} ativos)`,
      `beta fora de [-3,5]`,
      true,
    );
    note(
      'risco-retorno',
      `retornoAnual=${num(c.retornoAnual).toFixed(2)}% sharpe=${num(c.sharpe).toFixed(2)}`,
    );
  }
  {
    const r = await api('/api/analises/sensibilidade-carteira');
    check('sensibilidade', r.ok, `HTTP 200`, `HTTP ${r.status}`, !r.ok);
    const ativos: any[] = r.json?.ativos ?? [];
    const corrOk = ativos.every(
      (a) =>
        !Number.isFinite(num(a.correlacao)) ||
        (num(a.correlacao) >= -1.001 && num(a.correlacao) <= 1.001),
    );
    check(
      'sensibilidade',
      corrOk,
      `correlações em [-1,1] (${ativos.length} ativos)`,
      `correlação fora de [-1,1]`,
    );
  }
  {
    const r = await api('/api/analises/cobertura-fgc');
    check('fgc', r.ok, `HTTP 200`, `HTTP ${r.status}`, !r.ok);
    const resumo = r.json?.resumo ?? {},
      insts: any[] = r.json?.instituicoes ?? [];
    check(
      'fgc',
      num(resumo.totalEfetivamenteCoberto) <= 1_000_001,
      `coberto global ≤ 1M (${num(resumo.totalEfetivamenteCoberto).toFixed(0)})`,
      `coberto global > 1M`,
    );
    const instOk = insts.every((it) => num(it.totalCoberto) <= 250_001);
    check(
      'fgc',
      instOk,
      `cobertura ≤ 250k/inst (${insts.length} inst)`,
      `instituição com cobertura > 250k`,
    );
  }
  {
    const r = await api('/api/analises/ir-resumo-anual?year=2026');
    check('ir', r.ok, `HTTP 200`, `HTTP ${r.status}`, !r.ok);
    if (r.ok && r.json) {
      const cat = r.json.irPorCategoria ?? {};
      const allNonNeg = Object.values(cat).every((v: any) => num(v) >= 0);
      check('ir', allNonNeg, `IR por categoria ≥ 0`, `IR negativo em alguma categoria`);
    }
  }
  // 4. cashflow / sonhos / aposentadoria / ativo
  {
    const r = await api('/api/cashflow?year=2026');
    const groups: any[] = r.json?.groups ?? [];
    let valCount = 0;
    const walk = (g: any) => {
      for (const it of g.items ?? []) valCount += (it.values ?? []).length;
      (g.children ?? []).forEach(walk);
    };
    groups.forEach(walk);
    check(
      'cashflow',
      r.ok && groups.length > 0,
      `${groups.length} grupos, ${valCount} valores`,
      `cashflow vazio/erro`,
    );
  }
  {
    const r = await api('/api/planejamento-sonhos');
    const arr: any[] = r.json?.objetivos ?? r.json ?? [];
    check(
      'sonhos',
      Array.isArray(arr) && arr.length >= 1,
      `${arr.length} objetivos`,
      `nenhum objetivo`,
      true,
    );
  }
  {
    const r = await api('/api/aposentadoria');
    check(
      'aposentadoria',
      r.ok && (r.json?.plano || r.json?.idade),
      `plano presente`,
      `sem plano (${r.status})`,
      true,
    );
  }
  {
    // detalhe de um ativo: acha o portfolioId de PETR4 via /api/carteira/acoes
    const acoes = await api('/api/carteira/acoes');
    const list: any[] = acoes.json?.ativosList ?? acoes.json?.acoes ?? acoes.json?.ativos ?? [];
    const first = list[0];
    const id = first?.portfolioId ?? first?.id;
    if (id) {
      const r = await api(`/api/ativos/${id}?range=MAX`);
      const pos = r.json?.posicao ?? {};
      check(
        'ativo/detalhe',
        r.ok,
        `HTTP 200 (${first?.ticker ?? first?.symbol ?? id})`,
        `HTTP ${r.status}`,
      );
      check(
        'ativo/detalhe',
        num(pos.quantidade) > 0,
        `posição qty=${num(pos.quantidade)}`,
        `qty inválida`,
        true,
      );
      note(
        'ativo/detalhe',
        `precoMedio=${num(pos.precoMedio).toFixed(2)} saldoBruto=${num(pos.saldoBruto).toFixed(2)} rent=${num(pos.rentabilidade).toFixed(2)}%`,
      );
    } else {
      check('ativo/detalhe', false, '', 'não achei portfolioId de ação para detalhar', true);
    }
  }
}

// ─── main ───────────────────────────────────────────────────────────────────
async function main() {
  const phase = process.argv[2] ?? 'all';
  console.log(`→ base=${BASE_URL} email=${EMAIL} phase=${phase}\n`);
  await ensureUserAndLogin();

  if (phase === 'all' || phase === 'seed') {
    console.log('\n── SEED: operações ──');
    await seed();
    console.log('\n── SEED: cashflow ──');
    await seedCashflow();
    console.log('\n── SEED: sonhos ──');
    await seedSonhos();
    console.log('\n── SEED: aposentadoria ──');
    await seedAposentadoria();
  }

  if (phase === 'all' || phase === 'verify') {
    console.log('\n── VERIFY ──');
    await verify();
  }

  // relatório
  const seedOk = seedResults.filter((s) => s.ok).length;
  console.log(`\n================ RELATÓRIO ================`);
  console.log(`SEED: ${seedOk}/${seedResults.length} escritas OK`);
  const seedFail = seedResults.filter((s) => !s.ok);
  if (seedFail.length) {
    console.log(`SEED falhas:`);
    seedFail.forEach((s) => console.log(`  ✗ ${s.label}: ${s.detail}`));
  }
  const fails = checks.filter((c) => c.level === 'FAIL');
  const warns = checks.filter((c) => c.level === 'WARN');
  console.log(
    `\nVERIFY: ${checks.filter((c) => c.level === 'PASS').length} PASS, ${warns.length} WARN, ${fails.length} FAIL`,
  );
  for (const c of checks) {
    const icon = c.level === 'PASS' ? '✓' : c.level === 'WARN' ? '⚠' : '✗';
    console.log(`  ${icon} [${c.section}] ${c.msg}`);
  }
  console.log(`==========================================`);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
