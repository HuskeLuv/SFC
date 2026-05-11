/**
 * Cadastra no SFC a carteira de teste descrita em scripts/kinvo-test-portfolio.csv,
 * espelhando o que o usuário cadastra manualmente no Kinvo. Faz login com as
 * credenciais de .env.test, garante que as instituições e o usuário de teste
 * existam, e POSTa cada linha em /api/carteira/operacao.
 *
 * Pré-requisitos:
 *   1. Dev server rodando: `npm run dev` (em outro terminal)
 *   2. .env.test com TEST_USER_EMAIL e TEST_USER_PASSWORD
 *
 * Uso:
 *   npx tsx scripts/kinvo-seed-sfc.ts
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';

const ENV_FILE = join(process.cwd(), '.env.test');
const CSV_FILE = join(process.cwd(), 'scripts', 'kinvo-test-portfolio.csv');

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

if (!EMAIL || !PASSWORD) {
  console.error('Faltando TEST_USER_EMAIL ou TEST_USER_PASSWORD em .env.test');
  process.exit(1);
}

// ─── cookie jar ───────────────────────────────────────────────────────────────
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

async function api(
  path: string,
  init: { method?: string; body?: unknown; csrf?: boolean } = {},
): Promise<Response> {
  const headers: Record<string, string> = { Cookie: cookieHeader() };
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  if (init.csrf && cookies['csrf-token']) headers['x-csrf-token'] = cookies['csrf-token'];
  const res = await fetch(`${BASE_URL}${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  captureCookies(res.headers);
  return res;
}

// ─── auth ─────────────────────────────────────────────────────────────────────
async function ensureUserAndLogin() {
  let res = await api('/api/auth/login', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD },
  });
  if (res.status === 401) {
    console.log(`→ Usuário ${EMAIL} não existe; registrando…`);
    res = await api('/api/auth/register', {
      method: 'POST',
      body: { email: EMAIL, password: PASSWORD, name: 'Kinvo Test' },
    });
    if (!res.ok) throw new Error(`Falha no registro: ${res.status} ${await res.text()}`);
  } else if (!res.ok) {
    throw new Error(`Falha no login: ${res.status} ${await res.text()}`);
  }
  if (!cookies.token) throw new Error('Login OK mas cookie token ausente');
  console.log(`✓ Logado como ${EMAIL}`);

  // hit an authenticated route to trigger the middleware to set csrf-token
  await api('/api/profile');
  if (!cookies['csrf-token']) {
    // try one more authenticated GET; some pages set the cookie only on certain routes
    await api('/api/carteira/acoes');
  }
  if (!cookies['csrf-token']) throw new Error('csrf-token cookie não foi setado');
  console.log('✓ CSRF token obtido');
}

// ─── institutions & catalog assets ────────────────────────────────────────────
const INSTITUTIONS_TO_ENSURE = [
  { codigo: 'XPI', nome: 'XP Investimentos' },
  { codigo: 'AVENUE', nome: 'Avenue Securities' },
  { codigo: 'BRASILPREV', nome: 'Brasilprev' },
  { codigo: 'MERCADO-BITCOIN', nome: 'Mercado Bitcoin' },
  { codigo: 'TESOURO-DIRETO', nome: 'Tesouro Direto' },
];

// ETFs nacionais com sufixo "11" caem no filtro de FII em /api/assets, então
// não aparecem como ETF no catálogo. Inserimos aqui para que o teste consiga
// usar tipoAtivo=etf.
const ETF_ASSETS_TO_ENSURE = [
  { symbol: 'BOVA11', name: 'iShares Ibovespa ETF', currency: 'BRL', source: 'manual' },
];

// Ações e FIIs vivem na tabela Stock (não Asset). Sem cron BRAPI rodando,
// pre-cadastramos os tickers do CSV de teste.
const STOCK_ASSETS_TO_ENSURE = [
  { ticker: 'PETR4', companyName: 'Petróleo Brasileiro S.A. - Petrobras' },
  { ticker: 'ITUB4', companyName: 'Itaú Unibanco Holding S.A.' },
  { ticker: 'HGLG11', companyName: 'CSHG Logística Fundo de Investimento Imobiliário' },
];

// Cripto e Tesouro vivem na tabela Asset com types específicos.
const ASSETS_TO_ENSURE = [
  {
    symbol: 'BTC',
    name: 'Bitcoin',
    type: 'crypto',
    currency: 'BRL',
    source: 'manual',
  },
  {
    symbol: 'TESOURO-IPCA-2029',
    name: 'Tesouro IPCA+ 2029',
    type: 'tesouro-direto',
    currency: 'BRL',
    source: 'tesouro_gov',
  },
];

async function ensurePrerequisites(prisma: PrismaClient) {
  for (const inst of INSTITUTIONS_TO_ENSURE) {
    await prisma.institution.upsert({
      where: { codigo: inst.codigo },
      update: { nome: inst.nome, status: 'ATIVA' },
      create: { codigo: inst.codigo, nome: inst.nome, status: 'ATIVA' },
    });
  }
  for (const etf of ETF_ASSETS_TO_ENSURE) {
    await prisma.asset.upsert({
      where: { symbol: etf.symbol },
      update: { type: 'etf', name: etf.name, currency: etf.currency, source: etf.source },
      create: {
        symbol: etf.symbol,
        name: etf.name,
        type: 'etf',
        currency: etf.currency,
        source: etf.source,
      },
    });
  }
  // Pós-consolidação Stock → Asset: ações/FIIs B3 passaram a ser linhas de Asset
  // com type='stock' ou type='fii'. Heurística simples: ticker termina em 11 → FII.
  for (const stock of STOCK_ASSETS_TO_ENSURE) {
    const isFii = stock.ticker.toUpperCase().endsWith('11');
    await prisma.asset.upsert({
      where: { symbol: stock.ticker },
      update: { name: stock.companyName, type: isFii ? 'fii' : 'stock' },
      create: {
        symbol: stock.ticker,
        name: stock.companyName,
        type: isFii ? 'fii' : 'stock',
        currency: 'BRL',
        source: 'manual',
      },
    });
  }
  for (const asset of ASSETS_TO_ENSURE) {
    await prisma.asset.upsert({
      where: { symbol: asset.symbol },
      update: {
        name: asset.name,
        type: asset.type,
        currency: asset.currency,
        source: asset.source,
      },
      create: asset,
    });
  }
  console.log(
    `✓ ${INSTITUTIONS_TO_ENSURE.length} instituições + ${ETF_ASSETS_TO_ENSURE.length} ETFs + ${STOCK_ASSETS_TO_ENSURE.length} ações/FIIs + ${ASSETS_TO_ENSURE.length} outros ativos garantidos`,
  );
}

const instCache = new Map<string, string>();
async function institutionId(name: string): Promise<string> {
  if (instCache.has(name)) return instCache.get(name)!;
  const res = await api(`/api/institutions?search=${encodeURIComponent(name)}&limit=5`);
  if (!res.ok) throw new Error(`Falha buscando instituição "${name}": ${res.status}`);
  const data = (await res.json()) as { institutions: Array<{ id: string; nome: string }> };
  const exact = data.institutions.find((i) => i.nome.toLowerCase() === name.toLowerCase());
  const found = exact ?? data.institutions[0];
  if (!found) throw new Error(`Instituição "${name}" não encontrada`);
  instCache.set(name, found.id);
  return found.id;
}

// ─── asset lookup ─────────────────────────────────────────────────────────────
async function findAsset(tipo: string, search: string): Promise<string | null> {
  const res = await api(
    `/api/assets?tipo=${encodeURIComponent(tipo)}&search=${encodeURIComponent(search)}&limit=5`,
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { assets?: Array<{ id: string; symbol?: string }> };
  if (!data.assets || data.assets.length === 0) return null;
  // prefer exact symbol match
  const exact = data.assets.find((a) => a.symbol?.toUpperCase() === search.toUpperCase());
  return (exact ?? data.assets[0]).id;
}

// ─── csv ──────────────────────────────────────────────────────────────────────
interface Row {
  id: string;
  categoria: string;
  produto: string;
  nome_completo: string;
  tipo_operacao: string;
  data: string;
  quantidade: string;
  preco_unitario: string;
  taxas: string;
  moeda: string;
  cotacao_dolar: string;
  corretora: string;
  observacoes: string;
}

function parseCsv(content: string): Row[] {
  const lines = content.trim().split(/\r?\n/);
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = line.split(',');
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (cols[i] ?? '').trim();
    });
    return row as unknown as Row;
  });
}

// ─── operation builder per category ───────────────────────────────────────────
type OpBody = Record<string, unknown> & { tipoAtivo: string };

async function buildBody(row: Row): Promise<OpBody> {
  const qty = parseFloat(row.quantidade);
  const price = parseFloat(row.preco_unitario);
  const taxas = parseFloat(row.taxas) || 0;
  const fx = row.cotacao_dolar ? parseFloat(row.cotacao_dolar) : undefined;

  switch (row.categoria) {
    case 'Ação BR': {
      const assetId = await findAsset('acao', row.produto);
      if (!assetId) throw new Error(`Ação ${row.produto} não encontrada`);
      return {
        tipoAtivo: 'acao',
        assetId,
        dataCompra: row.data,
        quantidade: qty,
        cotacaoUnitaria: price,
        taxaCorretagem: taxas,
        estrategia: 'value',
      };
    }
    case 'FII': {
      const assetId = await findAsset('fii', row.produto);
      if (!assetId) throw new Error(`FII ${row.produto} não encontrado`);
      return {
        tipoAtivo: 'fii',
        assetId,
        dataCompra: row.data,
        quantidade: qty,
        cotacaoUnitaria: price,
        taxaCorretagem: taxas,
        tipoFii: 'tijolo',
      };
    }
    case 'ETF BR': {
      const assetId = await findAsset('etf', row.produto);
      if (!assetId) throw new Error(`ETF ${row.produto} não encontrado`);
      return {
        tipoAtivo: 'etf',
        assetId,
        dataCompra: row.data,
        quantidade: qty,
        cotacaoUnitaria: price,
        taxaCorretagem: taxas,
        regiaoEtf: 'brasil',
      };
    }
    case 'Stock US':
      return {
        tipoAtivo: 'stock',
        assetId: 'STOCK-MANUAL',
        ativo: row.produto,
        nomePersonalizado: row.nome_completo,
        dataCompra: row.data,
        quantidade: qty,
        cotacaoUnitaria: price,
        moeda: 'USD',
        cotacaoMoeda: fx,
        taxaCorretagem: taxas,
        estrategia: 'growth',
      };
    case 'Tesouro Direto': {
      // tesouro IPCA+ → híbrido
      const assetId = await findAsset('tesouro-direto', 'IPCA+ 2029');
      if (!assetId) throw new Error('Tesouro IPCA+ 2029 ausente do catálogo (rode o sync)');
      return {
        tipoAtivo: 'tesouro-direto',
        assetId,
        dataCompra: row.data,
        metodo: 'valor',
        valorInvestido: price * qty,
        tesouroDestino: 'renda-fixa-hibrida',
        dataInicio: row.data,
        dataVencimento: '2029-05-15',
        rendaFixaIndexer: 'IPCA',
        rendaFixaIndexerPercent: 100,
        taxaJurosAnual: 6,
        descricao: row.nome_completo,
      };
    }
    case 'CDB':
      // FixedIncomeType só tem _PRE e _HIB; pós-fixados usam CDB_PRE + indexer
      return {
        tipoAtivo: 'renda-fixa-posfixada',
        rendaFixaTipo: 'CDB_PRE',
        dataInicio: row.data,
        dataVencimento: '2028-10-15',
        valorAplicado: price * qty,
        descricao: row.produto,
        rendaFixaIndexer: 'CDI',
        rendaFixaIndexerPercent: 110,
        taxaJurosAnual: 110,
      };
    case 'LCI':
      return {
        tipoAtivo: 'renda-fixa-posfixada',
        rendaFixaTipo: 'LCI_PRE',
        dataInicio: row.data,
        dataVencimento: '2027-09-20',
        valorAplicado: price * qty,
        descricao: row.produto,
        rendaFixaIndexer: 'CDI',
        rendaFixaIndexerPercent: 95,
        taxaJurosAnual: 95,
        rendaFixaTaxExempt: true,
      };
    case 'Cripto': {
      const assetId = await findAsset('criptoativo', row.produto);
      if (!assetId) throw new Error(`Cripto ${row.produto} ausente do catálogo`);
      return {
        tipoAtivo: 'criptoativo',
        assetId,
        dataCompra: row.data,
        quantidade: qty,
        cotacaoCompra: price,
        taxaCorretagem: taxas,
      };
    }
    case 'Fundo CVM': {
      const assetId = (await findAsset('fundo', row.produto)) ?? 'FUNDO-MANUAL';
      return {
        tipoAtivo: 'fundo',
        assetId,
        ativo: row.produto,
        nomePersonalizado: row.nome_completo,
        dataCompra: row.data,
        quantidade: qty,
        cotacaoUnitaria: price,
        metodo: 'cotas',
        fundoDestino: 'renda-fixa',
        fundoRendaFixaTipo: 'pos-fixada',
      };
    }
    case 'Previdência':
      return {
        tipoAtivo: 'previdencia',
        assetId: 'PREVIDENCIA-MANUAL',
        ativo: row.produto,
        nomePersonalizado: row.nome_completo,
        dataCompra: row.data,
        quantidade: qty,
        cotacaoUnitaria: price,
        metodo: 'cotas',
      };
    default:
      throw new Error(`Categoria desconhecida: ${row.categoria}`);
  }
}

// ─── main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`→ Base URL: ${BASE_URL}`);

  // 1. Ensure institutions and catalog assets exist (no public API for these)
  const prisma = new PrismaClient();
  try {
    await ensurePrerequisites(prisma);
  } finally {
    await prisma.$disconnect();
  }

  // 2. Login (or auto-register)
  await ensureUserAndLogin();

  // 3. Read CSV (optional CLI args filter rows by id, e.g. `npx tsx ... 6 9 10`)
  const onlyIds = new Set(process.argv.slice(2));
  const allRows = parseCsv(readFileSync(CSV_FILE, 'utf-8'));
  const rows = onlyIds.size ? allRows.filter((r) => onlyIds.has(r.id)) : allRows;
  console.log(
    `→ ${rows.length} operações a cadastrar${onlyIds.size ? ` (filtro: ${[...onlyIds].join(',')})` : ''}\n`,
  );

  // 4. Loop
  let ok = 0;
  const failures: string[] = [];
  for (const row of rows) {
    const label = `[${row.id.padStart(2)}] ${row.categoria.padEnd(15)} ${row.produto.padEnd(30)} ${row.data}`;
    try {
      const body = await buildBody(row);
      const instId = await institutionId(row.corretora);
      const fullBody = { ...body, instituicao: row.corretora, instituicaoId: instId };
      const res = await api('/api/carteira/operacao', {
        method: 'POST',
        body: fullBody,
        csrf: true,
      });
      const text = await res.text();
      if (!res.ok) {
        console.log(`  ✗ ${label} → ${res.status} ${text.slice(0, 180)}`);
        failures.push(`${label}: HTTP ${res.status} ${text.slice(0, 180)}`);
      } else {
        ok++;
        console.log(`  ✓ ${label}`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  ✗ ${label} → ${msg}`);
      failures.push(`${label}: ${msg}`);
    }
  }

  console.log(`\n${ok}/${rows.length} cadastradas`);
  if (failures.length) {
    console.log(`\nFalhas:`);
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
