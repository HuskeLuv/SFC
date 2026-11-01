import { expect, type Page, type Request, type Route } from '@playwright/test';
import type { DividaDTO, DividaPagamentoDTO } from '../../src/app/api/dividas/_lib/serializer';
import type { ParcelaCronograma } from '../../src/services/dividas/amortizacao';

/**
 * Apoio dos e2e de Dívidas (/dividas) — esconder valores, Fase 4.
 *
 * O banco do seed (CI) não tem dívida (a lista cai no estado vazio) e o banco de dev também não.
 * Por isso `mockarDividas(page)` responde por `page.route` tudo o que a tela pede:
 *
 * - GET /api/dividas               → DIVIDAS_FIXTURE.dividas (2 financiamentos + 1 rotativa, com
 *   `resumo`);
 * - GET /api/dividas/:id           → a dívida com `pagamentos`;
 * - GET /api/dividas/:id/cronograma → cronograma SAC/Price montado aqui (PREFIXADO, fator 1);
 *   rotativa → 400, como a rota real;
 * - POST/PATCH/DELETE em qualquer um deles → NÃO chega ao servidor: responde com a fixture e guarda
 *   a chamada em `escritas` (o teste confere que ficou vazio, ou o que foi pedido).
 *
 * Os valores em dinheiro são SENTINELAS (improváveis, todos com centavos): com o olho aberto
 * aparecem; com o olho fechado nenhum pode sobrar no innerText. Use
 * `coletarNumerosDaPosicao(page, escopo, { ignorarPercentuais: true })` (helpers/valoresOcultos)
 * — taxa de juros, CET e % continuam visíveis; prazos, nº de parcelas e datas também.
 *
 * Dados fixos (não dependem do mês corrente): os pagamentos vão até out/2026.
 */

const AGORA = '2026-10-15T12:00:00.000Z';

/** Valores-sentinela em reais (pt-BR na tela: 287.654,32 · 54.321,98 · 7.654,21 · 1.234,87). */
export const SENTINELAS_DIVIDAS = {
  principalImovel: 287654.32,
  principalCarro: 54321.98,
  saldoCartao: 7654.21,
  pagamentoCartao: 1234.87,
} as const;

const S = SENTINELAS_DIVIDAS;

export const ID_DIVIDA = {
  imovel: '0d0d0d0d-0000-4000-8000-0000000000a1',
  carro: '0d0d0d0d-0000-4000-8000-0000000000a2',
  cartao: '0d0d0d0d-0000-4000-8000-0000000000a3',
} as const;

const round2 = (v: number) => Math.round(v * 100) / 100;

const addMonths = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};

/** Mesmo algoritmo de src/services/dividas/amortizacao.ts (gerarCronogramaSAC/Price). */
function cronograma(
  principal: number,
  taxaAm: number,
  prazo: number,
  primeiro: string,
  sistema: 'SAC' | 'PRICE',
): ParcelaCronograma[] {
  const pmt = (principal * taxaAm) / (1 - Math.pow(1 + taxaAm, -prazo));
  const rows: ParcelaCronograma[] = [];
  let saldo = round2(principal);
  for (let k = 1; k <= prazo; k++) {
    const juros = round2(saldo * taxaAm);
    const base = sistema === 'SAC' ? principal / prazo : pmt - juros;
    const amortizacao = k < prazo ? round2(base) : saldo;
    saldo = round2(saldo - amortizacao);
    rows.push({
      numero: k,
      mes: addMonths(primeiro, k - 1),
      parcela: round2(amortizacao + juros),
      juros,
      amortizacao,
      saldoDevedor: saldo,
    });
  }
  return rows;
}

interface Financiamento {
  id: string;
  nome: string;
  instituicao: string;
  tipo: DividaDTO['tipo'];
  principal: number;
  taxaAm: number;
  prazo: number;
  primeiro: string;
  sistema: 'SAC' | 'PRICE';
  pagas: number;
}

const FINANCIAMENTOS: Financiamento[] = [
  {
    id: ID_DIVIDA.imovel,
    nome: 'Financiamento do apartamento',
    instituicao: 'Banco Exemplo',
    tipo: 'financiamento_imobiliario',
    principal: S.principalImovel,
    taxaAm: 0.0087,
    prazo: 120,
    primeiro: '2025-03',
    sistema: 'SAC',
    pagas: 20, // mar/2025 … out/2026
  },
  {
    id: ID_DIVIDA.carro,
    nome: 'Financiamento do carro',
    instituicao: 'Financeira Exemplo',
    tipo: 'financiamento_veiculo',
    principal: S.principalCarro,
    taxaAm: 0.0149,
    prazo: 48,
    primeiro: '2026-01',
    sistema: 'PRICE',
    pagas: 10, // jan … out/2026
  },
];

const categoria = (meses: number): 'c' | 'm' | 'l' => (meses <= 12 ? 'c' : meses <= 60 ? 'm' : 'l');

function montarFinanciamento(f: Financiamento) {
  const linhas = cronograma(f.principal, f.taxaAm, f.prazo, f.primeiro, f.sistema);
  const pagamentos: DividaPagamentoDTO[] = linhas.slice(0, f.pagas).map((p) => ({
    id: `0d0d0d0d-0000-4000-8${f.id.slice(-1)}00-${String(p.numero).padStart(12, '0')}`,
    month: p.mes,
    valor: p.parcela,
    parcelaNumero: p.numero,
    tipo: 'pagamento',
    notes: null,
    createdAt: AGORA,
  }));
  const saldoDevedor = linhas[f.pagas - 1].saldoDevedor;
  const proximaParcela = linhas[f.pagas] ?? null;
  const prazoRestanteMeses = f.prazo - f.pagas;
  const divida: DividaDTO = {
    id: f.id,
    nome: f.nome,
    instituicao: f.instituicao,
    tipo: f.tipo,
    modalidade: 'financiamento',
    principal: f.principal,
    taxaAm: f.taxaAm,
    taxaUnidadeEntrada: 'am',
    prazoMeses: f.prazo,
    sistema: f.sistema,
    indexador: 'PREFIXADO',
    primeiroVencimento: f.primeiro,
    diaVencimento: 10,
    saldoInicial: null,
    dataSaldoInicial: null,
    status: 'ativa',
    notes: null,
    createdAt: AGORA,
    updatedAt: AGORA,
    resumo: {
      saldoDevedor,
      parcelasPagas: f.pagas,
      totalParcelas: f.prazo,
      proximaParcela,
      prazoRestanteMeses,
      categoria: categoria(Math.max(1, prazoRestanteMeses)),
    },
  };
  const resposta = {
    cronograma: linhas.map((p) => ({ ...p, amortizada: false })),
    saldo: { saldoDevedor, parcelasPagas: f.pagas, proximaParcela },
    parcelasCortadas: 0,
    indexador: 'PREFIXADO',
    fatorIndexacao: 1,
    saldoCorrigido: saldoDevedor,
  };
  return { divida, pagamentos, cronograma: resposta };
}

const financiamentos = FINANCIAMENTOS.map(montarFinanciamento);

const pagamentosCartao: DividaPagamentoDTO[] = [
  {
    id: '0d0d0d0d-0000-4000-8000-0000000000f1',
    month: '2026-10',
    valor: S.pagamentoCartao,
    parcelaNumero: null,
    tipo: 'pagamento',
    notes: null,
    createdAt: AGORA,
  },
];

const cartao: DividaDTO = {
  id: ID_DIVIDA.cartao,
  nome: 'Cartão de crédito',
  instituicao: 'Banco Exemplo',
  tipo: 'cartao_credito',
  modalidade: 'rotativa',
  principal: null,
  taxaAm: 0.1199,
  taxaUnidadeEntrada: 'am',
  prazoMeses: null,
  sistema: null,
  indexador: 'PREFIXADO',
  primeiroVencimento: null,
  diaVencimento: 5,
  saldoInicial: S.saldoCartao,
  dataSaldoInicial: '2026-09',
  status: 'ativa',
  notes: null,
  createdAt: AGORA,
  updatedAt: AGORA,
  resumo: {
    saldoDevedor: round2(S.saldoCartao - S.pagamentoCartao),
    parcelasPagas: null,
    totalParcelas: null,
    proximaParcela: null,
    prazoRestanteMeses: null,
    categoria: 'c',
  },
};

const dividas: DividaDTO[] = [...financiamentos.map((f) => f.divida), cartao];

const detalhe = new Map<string, DividaDTO>([
  ...financiamentos.map((f) => [f.divida.id, { ...f.divida, pagamentos: f.pagamentos }] as const),
  [cartao.id, { ...cartao, pagamentos: pagamentosCartao }],
]);

const cronogramas = new Map(financiamentos.map((f) => [f.divida.id, f.cronograma] as const));

export const DIVIDAS_FIXTURE = { dividas, detalhe, cronogramas } as const;

export interface EscritaDividas {
  metodo: string;
  url: string;
}

const caminho = (req: Request) => new URL(req.url()).pathname;

/**
 * Responde por `page.route` as APIs de Dívidas com as fixtures. Chame ANTES do `page.goto`.
 * Devolve `escritas`: POST/PATCH/DELETE interceptados (nunca chegam ao banco).
 */
export async function mockarDividas(page: Page): Promise<{ escritas: EscritaDividas[] }> {
  const escritas: EscritaDividas[] = [];
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

  await page.route(
    (url) => url.pathname === '/api/dividas' || url.pathname.startsWith('/api/dividas/'),
    async (route) => {
      const req = route.request();
      const metodo = req.method();
      const p = caminho(req);
      if (metodo !== 'GET') escritas.push({ metodo, url: p });
      if (p === '/api/dividas') {
        return metodo === 'GET' ? json(route, { dividas }) : json(route, { divida: dividas[0] });
      }
      const [, , , id, sub] = p.split('/');
      const divida = detalhe.get(id) ?? detalhe.get(dividas[0].id)!;
      if (sub === 'cronograma') {
        const c = cronogramas.get(id);
        return c
          ? json(route, c)
          : json(route, { error: 'Dívida rotativa não possui cronograma de amortização' }, 400);
      }
      if (sub === 'pagamentos') return json(route, { divida });
      return json(route, { divida });
    },
  );
  return { escritas };
}

/**
 * Abre /dividas e espera o título "Dívidas" — ou, com `id`, o detalhe pelo deep link `?divida=`
 * e espera o título da dívida (h2 com o nome da fixture).
 */
export async function gotoDividas(page: Page, id?: string) {
  await page.goto(id ? `/dividas?divida=${id}` : '/dividas', { waitUntil: 'domcontentloaded' });
  const titulo = id ? (detalhe.get(id)?.nome ?? '') : 'Dívidas';
  await expect(
    page.getByRole('heading', { level: 2, name: titulo, exact: true }).first(),
  ).toBeVisible({ timeout: 60_000 });
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
}
