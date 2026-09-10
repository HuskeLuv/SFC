/**
 * Monta o "retrato" compacto da conta de teste que o harness injeta no prompt:
 * carteira (resumo + posições), fluxo de caixa do ano (totais mensais por
 * linha), orçamento, dívidas, saúde financeira e objetivos.
 *
 * Uso (dev server no ar):
 *   npx tsx --env-file=.env scripts/assistente/build-contexto.ts
 * Variáveis opcionais: HARNESS_BASE_URL (http://localhost:3000),
 *   HARNESS_EMAIL / HARNESS_PASSWORD (usuário demo), HARNESS_YEAR (ano atual).
 * Saída: docs/assistente/contexto.json (gitignored — contém dados de uma conta).
 */
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.HARNESS_BASE_URL ?? 'http://localhost:3000';
const EMAIL = process.env.HARNESS_EMAIL ?? 'usuario.demo@finapp.local';
const PASSWORD = process.env.HARNESS_PASSWORD ?? '123456';
const YEAR = Number(process.env.HARNESS_YEAR ?? new Date().getFullYear());
const OUT = path.join(process.cwd(), 'docs', 'assistente', 'contexto.json');

type Json = Record<string, unknown>;
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const DROP_KEY =
  /(^id$|Id$|^userId$|createdAt|updatedAt|^isTemplate$|^templateId$|^hidden$|^orderIndex$)/;

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Mantém só campos primitivos úteis; arredonda números; remove ids/datas técnicas. */
function slim(obj: unknown, keep?: string[]): Json {
  if (!obj || typeof obj !== 'object') return {};
  const out: Json = {};
  for (const [k, v] of Object.entries(obj as Json)) {
    if (keep ? !keep.includes(k) : DROP_KEY.test(k)) continue;
    if (v === null || v === undefined || v === '') continue;
    if (typeof v === 'number') out[k] = round(v);
    else if (typeof v === 'string' || typeof v === 'boolean') out[k] = v;
  }
  return out;
}

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

interface CashGroup {
  name: string;
  type?: string;
  items?: Array<{ name: string; values?: Array<{ month: number; value: number | null }> }>;
  children?: CashGroup[];
}

function compactCashflow(groups: CashGroup[]): Json[] {
  const out: Json[] = [];
  const walk = (g: CashGroup, trail: string[]) => {
    const nome = [...trail, g.name].join(' > ');
    const linhas = (g.items ?? [])
      .map((it) => {
        const porMes = Array<number>(12).fill(0);
        for (const v of it.values ?? []) {
          if (typeof v.month === 'number' && v.month >= 0 && v.month < 12) {
            porMes[v.month] = round(Number(v.value ?? 0));
          }
        }
        const total = round(porMes.reduce((a, b) => a + b, 0));
        if (total === 0) return null;
        const meses: Json = {};
        porMes.forEach((val, i) => {
          if (val !== 0) meses[MESES[i]] = val;
        });
        return { linha: it.name, totalAno: total, meses };
      })
      .filter(Boolean);
    if (linhas.length > 0) out.push({ grupo: nome, tipo: g.type, linhas });
    for (const c of g.children ?? []) walk(c, [...trail, g.name]);
  };
  for (const g of groups) walk(g, []);
  return out;
}

interface Secao {
  nome?: string;
  tipo?: string;
  ativos?: Json[];
  totalValorAtualizado?: number;
}
interface CarteiraClasse {
  resumo?: Json;
  secoes?: Secao[];
  totalGeral?: Json;
}

const ATIVO_KEEP = [
  'ticker',
  'nome',
  'setor',
  'tipo',
  'quantidade',
  'precoAquisicao',
  'cotacaoAtual',
  'valorTotal',
  'valorAtualizado',
  'valorInicialAplicado',
  'rentabilidade',
  'percentualCarteira',
  'proventos',
  'benchmark',
  'vencimento',
  'cotizacaoResgate',
  'liquidacaoResgate',
  'estrategia',
  'objetivo',
  'instituicao',
];

function compactClasse(d: CarteiraClasse | null): Json | null {
  if (!d) return null;
  const secoes = (d.secoes ?? [])
    .map((s) => ({
      secao: s.nome ?? s.tipo,
      total: s.totalValorAtualizado !== undefined ? round(s.totalValorAtualizado) : undefined,
      ativos: (s.ativos ?? []).map((a) => slim(a, ATIVO_KEEP)),
    }))
    .filter((s) => s.ativos.length > 0);
  if (secoes.length === 0) return null;
  return { resumo: slim(d.resumo), secoes, totalGeral: slim(d.totalGeral) };
}

async function main() {
  console.log(`Base: ${BASE} · usuário: ${EMAIL} · ano: ${YEAR}`);
  const cookie = await login();

  const [resumo, cashflow, orcamento, dividas, saude, sonhos] = await Promise.all([
    get(cookie, '/api/carteira/resumo'),
    get<{ groups: CashGroup[] }>(cookie, `/api/cashflow?year=${YEAR}`),
    get(cookie, `/api/cashflow/orcamento?year=${YEAR}`),
    get<{ dividas: Json[] }>(cookie, '/api/dividas'),
    get(cookie, '/api/saude-financeira'),
    get<{ objetivos: Json[] }>(cookie, '/api/planejamento-sonhos'),
  ]);

  const classes = [
    'acoes',
    'fii',
    'etf',
    'stocks',
    'reit',
    'renda-fixa',
    'fim-fia',
    'moedas-criptos',
    'previdencia-seguros',
    'imoveis-bens',
    'reserva-emergencia',
    'reserva-oportunidade',
  ];
  const posicoes: Json = {};
  for (const c of classes) {
    const d = compactClasse(await get<CarteiraClasse>(cookie, `/api/carteira/${c}`));
    if (d) posicoes[c] = d;
  }

  const r = (resumo ?? {}) as Json;
  const contexto = {
    geradoEm: new Date().toISOString().slice(0, 10),
    usuario: EMAIL,
    ano: YEAR,
    carteira: {
      saldoBruto: r.saldoBruto,
      valorAplicado: r.valorAplicado,
      rentabilidadePercentual: r.rentabilidade,
      caixaParaInvestir: r.caixaParaInvestir,
      metaPatrimonio: r.metaPatrimonio,
      totais: slim(r.totais),
      distribuicao: Object.fromEntries(
        Object.entries((r.distribuicao ?? {}) as Record<string, Json>)
          .filter(([, v]) => Number(v?.valor ?? 0) !== 0)
          .map(([k, v]) => [k, slim(v)]),
      ),
      posicoes,
    },
    fluxoDeCaixa: cashflow ? compactCashflow(cashflow.groups) : null,
    orcamento: orcamento
      ? {
          categorias: ((orcamento.categorias ?? []) as Json[]).map((c) => ({
            ...slim(c, ['nome', 'parentNome', 'metaMensal']),
            realAnual: slim(c.realAnual),
          })),
          totais: orcamento.totais,
          investimentos: slim(orcamento.investimentos, ['tipoMeta', 'valorMeta']),
        }
      : null,
    dividas: (dividas?.dividas ?? []).map((d) => slim(d)),
    saudeFinanceira: saude
      ? {
          indicadores: saude.indicadores,
          config: saude.config,
        }
      : null,
    objetivos: (sonhos?.objetivos ?? []).map((o) => slim(o)),
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(contexto, null, 1));
  const bytes = fs.statSync(OUT).size;
  console.log(
    `✓ ${path.relative(process.cwd(), OUT)} — ${bytes} bytes (~${Math.round(bytes / 3.2)} tokens)`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
