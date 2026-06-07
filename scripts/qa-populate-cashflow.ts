/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Popula o fluxo de caixa de 2026 da conta de teste com um perfil realista:
 * família, salário R$20k, mora de aluguel, casado, 2 filhos, 2 cães e trocou
 * de carro em março. Mapeia para as linhas reais do template e grava via
 * batch-update (overwrite dos 12 meses por item). Idempotente — re-rodar
 * apenas sobrescreve.
 *
 * Uso (no EC2): SFC_BASE_URL=http://localhost:3000 npx tsx scripts/qa-populate-cashflow.ts
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

// normaliza nome pra casar acento/barra/espaço
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\s/]+/g, '');

const F = (v: number) => Array(12).fill(v);
const M = (base: number, ov: [number, number][]) => {
  const a = Array(12).fill(base);
  for (const [m, v] of ov) a[m] = v;
  return a;
};

// ── orçamento 2026 (Jan..Dez), perfil família R$20k ──
const BUDGET: Record<string, number[]> = {
  // Entradas
  Salário: F(20000),
  '13º Salário': M(0, [
    [10, 10000],
    [11, 10000],
  ]),
  Férias: M(0, [[6, 6800]]),
  // Habitação
  'Aluguel / Prestação': F(3500),
  Condomínio: F(800),
  'IPTU + Taxas Municipais': M(0, [
    [0, 480],
    [1, 480],
    [2, 480],
    [3, 480],
    [4, 480],
  ]),
  'Conta de energia': [520, 500, 480, 450, 430, 410, 400, 420, 440, 460, 490, 530],
  Internet: F(130),
  'Conta de água': [165, 160, 158, 152, 150, 150, 150, 155, 158, 162, 168, 172],
  Gás: F(125),
  'Telefones celulares': F(260),
  Supermercado: [2000, 1950, 2000, 1950, 2000, 1950, 2050, 2000, 2050, 2100, 2200, 2600],
  Padaria: F(300),
  'Empregados/ Diaristas': F(650),
  'Seguro Residência': F(80),
  // Transporte (troca de carro em março)
  'Prestação Moto/ Carro': [0, 0, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500],
  'IPVA + Seguro Obrigatório Carro': [460, 460, 460, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'Seguro Carro': [0, 0, 380, 380, 380, 380, 380, 380, 380, 380, 380, 380],
  Combustível: [720, 700, 780, 800, 820, 800, 850, 830, 800, 780, 800, 900],
  Estacionamentos: F(150),
  'Manutenção / Revisões': M(0, [
    [0, 250],
    [3, 400],
    [5, 250],
    [7, 300],
    [9, 250],
    [11, 300],
  ]),
  Lavagens: F(85),
  Pedágio: F(100),
  'Transporte::Acessórios': M(0, [[2, 2200]]), // emplacamento/película/tapetes do carro novo
  // Saúde (família de 4)
  'Plano de Saúde': F(1600),
  'Seguro Vida': F(150),
  'Médicos e terapeutas': M(0, [
    [0, 300],
    [2, 400],
    [4, 350],
    [6, 300],
    [8, 400],
    [10, 300],
  ]),
  Dentista: M(0, [
    [1, 350],
    [4, 300],
    [7, 400],
    [10, 300],
  ]),
  Medicamentos: F(220),
  // Educação (2 filhos)
  'Escola/Faculdade': F(2400),
  'Material escolar': M(0, [
    [0, 1300],
    [1, 650],
    [6, 300],
  ]),
  'Transporte escolar': [0, 450, 450, 450, 450, 450, 0, 450, 450, 450, 450, 450],
  Cursos: F(380),
  // Animais (2 cães)
  Ração: F(420),
  Veterinário: M(0, [
    [1, 200],
    [3, 300],
    [5, 200],
    [7, 250],
    [9, 200],
    [11, 350],
  ]),
  'Banho e tosa': F(220),
  Vacinas: M(0, [[3, 380]]),
  // Despesas Pessoais
  'Despesas Pessoais::Acessórios': M(0, [
    [3, 250],
    [8, 300],
    [11, 350],
  ]), // bolsas/relógio/óculos
  Roupas: [400, 300, 500, 400, 450, 400, 600, 400, 500, 450, 600, 1100],
  Calçados: M(0, [
    [1, 250],
    [3, 300],
    [6, 350],
    [9, 300],
    [11, 400],
  ]),
  'Cuidados pessoais': F(330),
  // Lazer
  Restaurantes: [700, 650, 750, 700, 750, 700, 800, 750, 800, 750, 850, 1100],
  Cinema: F(130),
  Viagens: M(0, [
    [6, 8500],
    [11, 5500],
  ]), // férias de julho + fim de ano
  Hobbies: F(160),
};

const budgetByNorm = new Map<string, number[]>();
for (const [k, v] of Object.entries(BUDGET)) {
  if (k.includes('::')) {
    const [grp, item] = k.split('::');
    budgetByNorm.set(norm(grp) + '::' + norm(item), v); // chave qualificada por grupo
  } else {
    budgetByNorm.set(norm(k), v);
  }
}

async function main() {
  console.log(`→ base=${BASE_URL}\n`);
  // login
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

  // estrutura
  const groups: any[] = (await api('/api/cashflow?year=2026')).json?.groups ?? [];
  // monta, por grupo, os updates dos itens que têm orçamento
  const perGroup = new Map<string, { itemId: string; name: string; values: number[] }[]>();
  const matched = new Set<string>();
  const walk = (g: any) => {
    for (const it of g.items ?? []) {
      const qualKey = norm(g.name) + '::' + norm(it.name);
      const plainKey = norm(it.name);
      const b = budgetByNorm.get(qualKey) ?? budgetByNorm.get(plainKey);
      if (b) {
        const arr = perGroup.get(g.id) ?? [];
        arr.push({ itemId: it.id, name: it.name, values: b });
        perGroup.set(g.id, arr);
        matched.add(budgetByNorm.has(qualKey) ? qualKey : plainKey);
      }
    }
    (g.children ?? []).forEach(walk);
  };
  groups.forEach(walk);

  // aplica por grupo
  let totalItems = 0;
  for (const [groupId, items] of perGroup) {
    const updates = items.map((i) => ({
      itemId: i.itemId,
      values: i.values.map((value, month) => ({ month, value })),
    }));
    const r = await api('/api/cashflow/batch-update', {
      method: 'PUT',
      csrf: true,
      body: { groupId, updates },
    });
    console.log(
      `  ${r.ok ? '✓' : '✗'} grupo ${groupId.slice(0, 8)}: ${items.length} itens (${items
        .map((i) => i.name)
        .join(', ')
        .slice(0, 80)}) → ${r.status}`,
    );
    if (r.ok) totalItems += items.length;
  }

  // relata não-casados (nomes do BUDGET sem item correspondente)
  const unmatched = [...budgetByNorm.keys()].filter((k) => !matched.has(k));
  console.log(`\n${totalItems} itens populados em ${perGroup.size} grupos.`);
  if (unmatched.length) console.log(`⚠ não casaram (revisar nome): ${unmatched.join(', ')}`);

  // resumo: total entradas/despesas por mês
  const cf: any[] = (await api('/api/cashflow?year=2026')).json?.groups ?? [];
  const sums = { entrada: Array(12).fill(0), despesa: Array(12).fill(0) };
  const sum = (g: any) => {
    for (const it of g.items ?? [])
      for (const v of it.values ?? [])
        if (g.type === 'entrada' || g.type === 'despesa')
          sums[g.type as 'entrada' | 'despesa'][v.month] += Number(v.value) || 0;
    (g.children ?? []).forEach(sum);
  };
  cf.forEach(sum);
  console.log(
    '\nmês:        ' +
      ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
        .map((m) => m.padStart(7))
        .join(''),
  );
  console.log('entradas:   ' + sums.entrada.map((v) => String(Math.round(v)).padStart(7)).join(''));
  console.log('despesas:   ' + sums.despesa.map((v) => String(Math.round(v)).padStart(7)).join(''));
  console.log(
    'saldo:      ' +
      sums.entrada.map((v, i) => String(Math.round(v - sums.despesa[i])).padStart(7)).join(''),
  );
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
