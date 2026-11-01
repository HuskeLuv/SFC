import { expect, type Page, type Request, type Route } from '@playwright/test';
import type { SaudeFinanceiraResponse } from '../../src/hooks/useSaudeFinanceira';
import type { EvolucaoPonto } from '../../src/services/saudeFinanceira/saudeFinanceiraSnapshot';
import type { SeguroDTO } from '../../src/app/api/saude-financeira/seguros/_lib/serializer';

/**
 * Apoio dos e2e da Saúde Financeira (/saude-financeira) — esconder valores, Fase 4.
 *
 * O banco do seed (CI) tem fluxo e carteira, mas não tem dívida, seguro nem evolução (snapshots), e
 * os números mudam com a data. Por isso `mockarSaude(page)` responde por `page.route`:
 *
 * - GET /api/saude-financeira          → SAUDE_FIXTURE.saude (diagnóstico com passivos, metas,
 *   tendências; status 'EQ');
 * - GET /api/saude-financeira/evolucao → SAUDE_FIXTURE.evolucao (6 meses: abr…set/2026);
 * - GET /api/saude-financeira/seguros  → SAUDE_FIXTURE.seguros (2 seguros, um sem capital);
 * - PUT/POST/PATCH/DELETE (config, seguros) → NÃO chega ao servidor: responde com a fixture e
 *   guarda a chamada em `escritas`.
 *
 * Os valores em dinheiro são SENTINELAS (improváveis, todos com centavos). Ficam visíveis: índices
 * e % (taxa de poupança, % atingido, cobertura em meses, passivo/ativo), status, contagens e os
 * Dados Econômicos (CDI, inflação, rentabilidade = dado de mercado). Confira com
 * `coletarNumerosDaPosicao(page, escopo, { ignorarPercentuais: true })` (helpers/valoresOcultos):
 * "4,2 meses" e taxas a.m. sem "%" podem aparecer como número — compare com a lista de SENTINELAS
 * (ou filtre-as) em vez de exigir lista vazia.
 */

const AGORA = '2026-10-15T12:00:00.000Z';

/** Valores-sentinela em reais (pt-BR na tela: 12.345,67 · 7.654,32 · …). */
export const SENTINELAS_SAUDE = {
  renda: 12345.67,
  gasto: 7654.32,
  poupanca: 4691.35,
  reserva: 15432.19,
  oportunidade: 3210.87,
  rendaFixaAlta: 8765.43,
  fiis: 21987.65,
  acoes: 43219.87,
  imoveis: 412345.78,
  passivoCurto: 6419.34,
  passivoLongo: 239876.54,
  parcelaLonga: 4321.09,
  custoSeguroVida: 2345.61,
  capitalSeguroVida: 765432.19,
  custoSeguroAuto: 3456.72,
  necessarioIdeal: 345678.91,
  necessarioIndependencia: 1876543.21,
} as const;

const S = SENTINELAS_SAUDE;
const round2 = (v: number) => Math.round(v * 100) / 100;

const altaLiquidez = [
  { chave: 'reservaEmergencia', label: 'Reserva Emergência', valor: S.reserva },
  { chave: 'reservaOportunidade', label: 'Reserva Oportunidade', valor: S.oportunidade },
  { chave: 'rendaFixaAltaLiquidez', label: 'Renda Fixa até D+360', valor: S.rendaFixaAlta },
  { chave: 'fundosAltaLiquidez', label: 'Fundos até D+360', valor: 0 },
  { chave: 'caixaParaInvestir', label: 'Caixa para investir', valor: 0 },
];
const baixaLiquidez = [
  { chave: 'rendaFixaBaixaLiquidez', label: 'Renda Fixa acima de D+360', valor: 0 },
  { chave: 'fiis', label: "FII's", valor: S.fiis },
  { chave: 'acoes', label: 'Ações', valor: S.acoes },
  { chave: 'imoveisBens', label: 'Imóveis & Bens', valor: S.imoveis },
];
const soma = (l: { valor: number }[]) => round2(l.reduce((s, x) => s + x.valor, 0));
const ativosAlta = soma(altaLiquidez);
const ativosBaixa = soma(baixaLiquidez);
const ativosTotal = round2(ativosAlta + ativosBaixa);
const passivosTotal = round2(S.passivoCurto + S.passivoLongo);
const patrimonioLiquido = round2(ativosTotal - passivosTotal);
const multReserva = 3;
const multSeguranca = 12;

const saude: SaudeFinanceiraResponse = {
  asOf: AGORA,
  indicadores: {
    economia: {
      cdiAA: 0.1415,
      rentabilidadeAA: 0.1287,
      rentabilidadeFonte: 'carteira',
      inflacaoAA: 0.0468,
      ganhoRealAA: 1.1287 / 1.0468 - 1,
    },
    fluxo: {
      rendaMensal: S.renda,
      gastoMensal: S.gasto,
      poupancaMensal: S.poupanca,
      taxaPoupanca: S.poupanca / S.renda,
    },
    benchmarks: {
      reservaEmergencia: {
        necessario: round2(S.gasto * multReserva),
        atual: S.reserva,
        atingido: S.reserva / (S.gasto * multReserva),
      },
      patrimonioSeguranca: {
        necessario: round2(S.gasto * multSeguranca),
        atual: ativosAlta,
        atingido: ativosAlta / (S.gasto * multSeguranca),
      },
      patrimonioIdeal: {
        necessario: S.necessarioIdeal,
        atual: patrimonioLiquido,
        atingido: patrimonioLiquido / S.necessarioIdeal,
      },
      independencia: {
        necessario: S.necessarioIndependencia,
        atual: patrimonioLiquido,
        atingido: patrimonioLiquido / S.necessarioIndependencia,
      },
    },
    balanco: {
      ativosAltaLiquidez: ativosAlta,
      ativosBaixaLiquidez: ativosBaixa,
      ativosTotal,
      passivosCurtoPrazo: S.passivoCurto,
      passivosLongoPrazo: S.passivoLongo,
      passivosTotal,
      patrimonioLiquido,
    },
    metricas: {
      mesesCobertura: ativosAlta / S.gasto,
      endividamentoCurtoPrazo: S.passivoCurto / S.renda,
      passivoSobreAtivo: passivosTotal / ativosTotal,
      grauIndependencia: patrimonioLiquido / S.necessarioIndependencia,
    },
    status: {
      codigo: 'EQ',
      motivos: ['Reserva de emergência acima do necessário'],
    },
  },
  fontes: {
    cashflow: { year: 2026, activeMonths: 10 },
    inflacao: 'ipca-12m',
    idade: 38,
    idadeAlvo: 60,
  },
  config: { multReserva, multSeguranca, fatorIdeal: 0.1, coberturaMinimaMeses: 6 },
  composicao: {
    altaLiquidez,
    baixaLiquidez,
    passivos: [
      {
        id: '0d0d0d0d-0000-4000-8000-0000000000a3',
        nome: 'Cartão de crédito',
        tipo: 'cartao_credito',
        prazo: 'curto',
        saldo: S.passivoCurto,
        modalidade: 'rotativa',
        sistema: null,
        taxaAm: null,
        indexador: 'PREFIXADO',
        valorParcela: null,
        parcelasPagas: null,
        totalParcelas: null,
        prazoRestanteMeses: null,
      },
      {
        id: '0d0d0d0d-0000-4000-8000-0000000000a1',
        nome: 'Financiamento do apartamento',
        tipo: 'financiamento_imobiliario',
        prazo: 'longo',
        saldo: S.passivoLongo,
        modalidade: 'financiamento',
        sistema: 'SAC',
        taxaAm: 0.0087,
        indexador: 'PREFIXADO',
        valorParcela: S.parcelaLonga,
        parcelasPagas: 20,
        totalParcelas: 120,
        prazoRestanteMeses: 100,
      },
    ],
  },
  tendencias: {
    rendaMensal: 'up',
    gastoMensal: 'down',
    poupancaMensal: 'up',
    taxaPoupanca: 'up',
    ativosAltaLiquidez: 'up',
    passivosTotal: 'down',
    patrimonioLiquido: 'up',
    mesesCobertura: 'up',
    grauIndependencia: 'flat',
  },
};

/** Evolução abr…set/2026 (month 0 = janeiro). Valores-sentinela crescentes. */
const evolucao: EvolucaoPonto[] = Array.from({ length: 6 }, (_, i) => {
  const f = 1 + i * 0.0123;
  return {
    year: 2026,
    month: 3 + i,
    data: {
      rendaMensal: round2(S.renda * f),
      gastoMensal: round2(S.gasto * (2 - f)),
      poupancaMensal: round2(S.renda * f - S.gasto * (2 - f)),
      taxaPoupanca: (S.renda * f - S.gasto * (2 - f)) / (S.renda * f),
      ativosAltaLiquidez: round2(ativosAlta * f),
      ativosBaixaLiquidez: round2(ativosBaixa * f),
      passivosCurtoPrazo: round2(S.passivoCurto * (2 - f)),
      passivosLongoPrazo: round2(S.passivoLongo * (2 - f)),
      patrimonioLiquido: round2(patrimonioLiquido * f),
      reservaEmergencia: round2(S.reserva * f),
      mesesCobertura: (ativosAlta * f) / (S.gasto * (2 - f)),
      grauIndependencia: (patrimonioLiquido * f) / S.necessarioIndependencia,
      rentabilidadeAA: 0.1187 + i * 0.002,
      status: i < 2 ? 'FR' : 'EQ',
    },
  };
});

const seguros: SeguroDTO[] = [
  {
    id: '0e5e0e5e-0000-4000-8000-0000000000d1',
    nome: 'Seguro de vida',
    tipo: 'vida',
    cobertura: 'total',
    risco: 'alto',
    custoAnual: S.custoSeguroVida,
    capitalSegurado: S.capitalSeguroVida,
    notes: null,
    createdAt: AGORA,
    updatedAt: AGORA,
  },
  {
    id: '0e5e0e5e-0000-4000-8000-0000000000d2',
    nome: 'Seguro do carro',
    tipo: 'auto',
    cobertura: 'parcial',
    risco: 'medio',
    custoAnual: S.custoSeguroAuto,
    capitalSegurado: null,
    notes: null,
    createdAt: AGORA,
    updatedAt: AGORA,
  },
];

export const SAUDE_FIXTURE = { saude, evolucao, seguros } as const;

export interface EscritaSaude {
  metodo: string;
  url: string;
}

const caminho = (req: Request) => new URL(req.url()).pathname;

/**
 * Responde por `page.route` as APIs da Saúde Financeira com as fixtures. Chame ANTES do
 * `page.goto`. Devolve `escritas`: PUT/POST/PATCH/DELETE interceptados (nunca chegam ao banco).
 * O PDF (Exportar) não é interceptado — não clique nele.
 */
export async function mockarSaude(page: Page): Promise<{ escritas: EscritaSaude[] }> {
  const escritas: EscritaSaude[] = [];
  const json = (route: Route, body: unknown) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

  await page.route(
    (url) =>
      url.pathname === '/api/saude-financeira' ||
      url.pathname === '/api/saude-financeira/evolucao' ||
      url.pathname === '/api/saude-financeira/config' ||
      url.pathname.startsWith('/api/saude-financeira/seguros'),
    async (route) => {
      const req = route.request();
      const metodo = req.method();
      const p = caminho(req);
      if (metodo !== 'GET') escritas.push({ metodo, url: p });
      if (p === '/api/saude-financeira/evolucao') return json(route, { snapshots: evolucao });
      if (p.startsWith('/api/saude-financeira/seguros')) {
        return metodo === 'GET' && p === '/api/saude-financeira/seguros'
          ? json(route, { seguros })
          : json(route, { seguro: seguros[0], success: true });
      }
      if (p === '/api/saude-financeira/config') return json(route, { config: saude.config });
      return json(route, saude);
    },
  );
  return { escritas };
}

/** Abre /saude-financeira e espera o título e o diagnóstico mockado. */
export async function gotoSaude(page: Page) {
  await page.goto('/saude-financeira', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('h2:has-text("Saúde Financeira")').first()).toBeVisible({
    timeout: 60_000,
  });
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
}
