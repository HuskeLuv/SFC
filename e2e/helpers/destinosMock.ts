import type { Page, Request, Route } from '@playwright/test';

/**
 * Apoio dos e2e de "escolher o destino na importação Open Finance" (fatia D).
 *
 * O CI roda com a integração Pluggy e a chave PLUGGY_DESTINOS_HABILITADO DESLIGADAS: estes testes
 * NÃO dependem do servidor. Tudo o que a tela de Conexões pede ao /api/pluggy/* é respondido aqui
 * por `page.route` (config, conexões, autorizações, caixa de entrada, carteira importada, destinos
 * GET/POST) e o Desfazer (`/api/historico-alteracoes/<id>/undo`). Nada é gravado no banco.
 *
 * Os destinos, motivos e seções das fixtures são os de src/lib/carteiraMover.ts (rótulos das abas,
 * SUBGRUPOS_POR_CATEGORIA, MOTIVO_*). O e2e não importa o módulo (aliases `@/` fora do Next).
 */

export const CONEXAO_ID = '0d0d0d0d-0000-4000-8000-000000000001';
export const ID = {
  knca: '0d0d0d0d-0000-4000-8000-0000000000a1',
  petr: '0d0d0d0d-0000-4000-8000-0000000000a2',
  itsa: '0d0d0d0d-0000-4000-8000-0000000000a3',
  cdb: '0d0d0d0d-0000-4000-8000-0000000000a4',
  prev: '0d0d0d0d-0000-4000-8000-0000000000a5',
  vinc: '0d0d0d0d-0000-4000-8000-0000000000a6',
  coe: '0d0d0d0d-0000-4000-8000-0000000000a7',
} as const;

const AGORA = '2026-10-06T15:04:00.000Z';

const ESTRATEGIAS = [
  { id: 'value', label: 'Value' },
  { id: 'growth', label: 'Growth' },
  { id: 'risk', label: 'Risk' },
];
const TIPOS_FII = [
  { id: 'fofi', label: 'FOF (Fundos de Fundos)' },
  { id: 'tvm', label: 'TVM' },
  { id: 'tijolo', label: 'Tijolo' },
  { id: 'infra', label: 'Infra' },
];
const TIPOS_FUNDO = [
  { id: 'fim', label: 'FIM' },
  { id: 'fia', label: 'FIA' },
  { id: 'rf', label: 'Renda Fixa' },
  { id: 'cambial', label: 'Cambial' },
  { id: 'fip', label: 'FIP' },
  { id: 'fip-infra', label: 'FIP Infraestrutura' },
  { id: 'fidc', label: 'FIDC' },
  { id: 'fiagro', label: 'Fiagro' },
];
const SECOES_RF = [
  { id: 'pos-fixada', label: 'Pós-fixada' },
  { id: 'prefixada', label: 'Pré-fixada' },
  { id: 'hibrida', label: 'Híbrida' },
];

const MOTIVO_EM_REAIS = 'Em reais — esta aba é em dólar';
const MOTIVO_COM_COTACAO =
  'Tem cotação de mercado — Reservas e Renda Fixa usam curva ou valor informado';
const MOTIVO_SEM_COTACAO = 'Sem cotação em bolsa: o valor vem da cota/curva';

type Sub = { id: string; label: string };
const destino = (
  categoria: string,
  abaId: string,
  label: string,
  permitido: boolean,
  subgrupos: Sub[],
  subgrupoSugerido: string,
  extra: Record<string, unknown> = {},
) => ({
  categoria,
  abaId,
  label,
  permitido,
  subgrupos,
  subgrupoSugerido,
  avisos: [],
  ...extra,
});

/** Destinos de um papel de bolsa em reais (ação/FII): RV em BRL, fundos; USD e caixa recusados. */
function destinosRvBrl() {
  return [
    destino('acoes', 'acoes', 'Ações', true, ESTRATEGIAS, 'value'),
    destino('fiis', 'fiis', "FII's", true, TIPOS_FII, 'tijolo'),
    destino(
      'etfs',
      'etf',
      "ETF's",
      true,
      [
        { id: 'brasil', label: 'Brasil' },
        { id: 'estados_unidos', label: 'EUA' },
      ],
      'brasil',
    ),
    destino('fimFia', 'fim-fia', 'Fundos', true, TIPOS_FUNDO, 'fim'),
    destino('stocks', 'stocks', 'Stocks', false, ESTRATEGIAS, 'value', {
      motivo: MOTIVO_EM_REAIS,
    }),
    destino('reits', 'reit', "REIT's", false, ESTRATEGIAS, 'value', { motivo: MOTIVO_EM_REAIS }),
    destino('reservaEmergencia', 'reserva-emergencia', 'Reserva Emergência', false, [], '', {
      motivo: MOTIVO_COM_COTACAO,
      subgrupoEditavel: false,
    }),
    destino('reservaOportunidade', 'reserva-oportunidade', 'Reserva Oportunidade', false, [], '', {
      motivo: MOTIVO_COM_COTACAO,
      subgrupoEditavel: false,
    }),
    destino('rendaFixaFundos', 'renda-fixa', 'Renda Fixa', false, SECOES_RF, 'pos-fixada', {
      motivo: MOTIVO_COM_COTACAO,
      subgrupoEditavel: false,
    }),
  ];
}

function destinosCdb() {
  return [
    destino('rendaFixaFundos', 'renda-fixa', 'Renda Fixa', true, SECOES_RF, 'pos-fixada', {
      subgrupoEditavel: false,
      secaoAutomatica: { id: 'pos-fixada', label: 'Pós-fixada', via: 'indexador' },
    }),
    destino('reservaEmergencia', 'reserva-emergencia', 'Reserva Emergência', true, [], '', {
      subgrupoEditavel: false,
      avisos: ['Liquidez diária: pode servir de reserva.'],
    }),
    destino('reservaOportunidade', 'reserva-oportunidade', 'Reserva Oportunidade', true, [], '', {
      subgrupoEditavel: false,
    }),
    destino('acoes', 'acoes', 'Ações', false, ESTRATEGIAS, 'value', {
      motivo: MOTIVO_SEM_COTACAO,
    }),
    destino('fiis', 'fiis', "FII's", false, TIPOS_FII, 'tijolo', { motivo: MOTIVO_SEM_COTACAO }),
  ];
}

function opcoes(
  id: string,
  ticker: string,
  nome: string,
  atual: {
    categoria: string;
    abaId: string;
    subgrupo: string | null;
    subgrupoLabel: string | null;
  },
  destinos: ReturnType<typeof destino>[],
  modelo: string,
  grupo: string,
) {
  return {
    item: { tipo: 'posicao', id: `p-${id}`, assetId: `a-${id}`, ticker, nome, moeda: 'BRL' },
    atual: { ...atual, override: false },
    movido: null,
    original: null,
    modelo,
    grupo,
    movivel: true,
    destinos,
    avisos: [],
  };
}

const atualResumo = (categoria: string, abaId: string, label: string, sub: string | null) => ({
  categoria,
  abaId,
  label,
  subgrupoLabel: sub,
  rotulo: sub ? `${label} › ${sub}` : label,
});

/** Itens do GET /api/pluggy/carteira/destinos (DestinoImportadoItem), na ordem dos grupos. */
export function itensDestinos() {
  const base = { connectionId: CONEXAO_ID, banco: 'XP Investimentos', opcoes: null, via: null };
  return [
    {
      ...base,
      bankInvestmentId: ID.petr,
      portfolioId: `p-${ID.petr}`,
      nome: 'Petrobras PN',
      ticker: 'PETR4',
      saldo: 11235,
      grupo: 'acoes',
      situacao: 'para-revisar',
      atual: atualResumo('acoes', 'acoes', 'Ações', 'Value'),
      via: 'padrao',
      confira: false,
      opcoes: opcoes(
        ID.petr,
        'PETR4',
        'Petrobras PN',
        { categoria: 'acoes', abaId: 'acoes', subgrupo: 'value', subgrupoLabel: 'Value' },
        destinosRvBrl(),
        'cotacao',
        'rv',
      ),
    },
    {
      ...base,
      bankInvestmentId: ID.itsa,
      portfolioId: `p-${ID.itsa}`,
      nome: 'Itaúsa PN',
      ticker: 'ITSA4',
      saldo: 7896,
      grupo: 'acoes',
      situacao: 'para-revisar',
      atual: atualResumo('acoes', 'acoes', 'Ações', 'Value'),
      via: 'padrao',
      confira: false,
      opcoes: opcoes(
        ID.itsa,
        'ITSA4',
        'Itaúsa PN',
        { categoria: 'acoes', abaId: 'acoes', subgrupo: 'value', subgrupoLabel: 'Value' },
        destinosRvBrl(),
        'cotacao',
        'rv',
      ),
    },
    {
      ...base,
      bankInvestmentId: ID.knca,
      portfolioId: `p-${ID.knca}`,
      nome: 'Kinea Crédito Agro Fiagro',
      ticker: 'KNCA11',
      saldo: 9580,
      grupo: 'fiis',
      situacao: 'para-revisar',
      atual: atualResumo('fiis', 'fiis', "FII's", 'Tijolo'),
      via: 'padrao',
      confira: true,
      opcoes: opcoes(
        ID.knca,
        'KNCA11',
        'Kinea Crédito Agro Fiagro',
        { categoria: 'fiis', abaId: 'fiis', subgrupo: 'tijolo', subgrupoLabel: 'Tijolo' },
        destinosRvBrl(),
        'cotacao',
        'rv',
      ),
    },
    {
      ...base,
      bankInvestmentId: ID.cdb,
      portfolioId: `p-${ID.cdb}`,
      nome: 'CDB XP 102% CDI',
      ticker: null,
      saldo: 15000,
      grupo: 'rf',
      situacao: 'para-revisar',
      atual: atualResumo('rendaFixaFundos', 'renda-fixa', 'Renda Fixa', 'Pós-fixada'),
      via: 'indexador',
      confira: false,
      opcoes: opcoes(
        ID.cdb,
        'RENDA-FIXA-1',
        'CDB XP 102% CDI',
        {
          categoria: 'rendaFixaFundos',
          abaId: 'renda-fixa',
          subgrupo: 'pos-fixada',
          subgrupoLabel: 'Pós-fixada',
        },
        destinosCdb(),
        'curva',
        'caixaRf',
      ),
    },
    {
      ...base,
      bankInvestmentId: ID.prev,
      portfolioId: `p-${ID.prev}`,
      nome: 'XP Prev PGBL',
      ticker: null,
      saldo: 32000,
      grupo: 'previdencia',
      situacao: 'fixo',
      atual: atualResumo('previdenciaSeguros', 'previdencia', 'Previdência e Seguros', null),
      confira: false,
      texto: 'Fica em Previdência e Seguros',
    },
    {
      ...base,
      bankInvestmentId: ID.vinc,
      portfolioId: 'p-vinc',
      nome: 'Tesouro Selic 2029',
      ticker: null,
      saldo: 5100,
      grupo: 'ja-estava',
      situacao: 'ja-estava',
      atual: atualResumo('reservaEmergencia', 'reserva-emergencia', 'Reserva Emergência', null),
      confira: false,
      texto: 'Já estava na Carteira — continua onde está',
    },
    {
      ...base,
      bankInvestmentId: ID.coe,
      portfolioId: null,
      nome: 'COE Bolsa Global',
      ticker: null,
      saldo: 3000,
      grupo: 'sem-suporte',
      situacao: 'sem-suporte',
      atual: null,
      confira: false,
      texto: 'Cadastre à mão',
    },
  ];
}

const investimentoDTO = (o: Record<string, unknown>) => ({
  banco: 'XP Investimentos',
  type: 'EQUITY',
  subtype: null,
  code: null,
  quantity: null,
  amountOriginal: null,
  rate: null,
  rateType: null,
  dueDate: null,
  issuer: null,
  status: 'ACTIVE',
  ativo: true,
  assetId: 'a',
  importStatus: 'importado',
  importError: null,
  importedAt: AGORA,
  ...o,
});

/** GET /api/pluggy/carteira: `comDestinos` = chave ligada (destino/situacaoDestino/paraRevisar). */
export function carteiraImportada(comDestinos: boolean, paraRevisar = 4) {
  const itens = itensDestinos().filter((i) => i.situacao !== 'sem-suporte');
  const investimentos = itens.map((i) => {
    const dto = investimentoDTO({
      id: i.bankInvestmentId,
      name: i.ticker ? `${i.ticker}` : i.nome,
      code: i.ticker,
      balance: i.saldo,
      portfolioId: i.portfolioId,
      importStatus: i.situacao === 'ja-estava' ? 'vinculado' : 'importado',
    });
    if (!comDestinos) return dto;
    const situacao = i.situacao === 'para-revisar' && paraRevisar === 0 ? 'confirmado' : i.situacao;
    return { ...dto, destino: i.atual, situacaoDestino: situacao };
  });
  investimentos.push(
    investimentoDTO({
      id: ID.coe,
      name: 'COE Bolsa Global',
      type: 'COE',
      balance: 3000,
      portfolioId: null,
      assetId: null,
      importStatus: 'sem-suporte',
      ...(comDestinos ? { destino: null, situacaoDestino: 'sem-suporte' } : {}),
    }),
  );
  return {
    investimentos,
    emprestimos: [],
    ...(comDestinos ? { paraRevisar } : {}),
  };
}

const conexao = {
  id: CONEXAO_ID,
  provider: 'pluggy',
  providerItemId: 'item-e2e-destinos',
  connectorId: 1,
  connectorName: 'XP Investimentos',
  connectorImageUrl: null,
  isOpenFinance: true,
  isSandbox: true,
  status: 'UPDATED',
  executionStatus: 'SUCCESS',
  errorMessage: null,
  consentExpiresAt: '2027-10-06T00:00:00.000Z',
  providerUpdatedAt: AGORA,
  lastSyncAt: AGORA,
  lastSyncError: null,
  lastManualUpdateAt: null,
  createdAt: AGORA,
  accounts: [],
};

export interface MockDestinos {
  posts: unknown[];
  undos: string[];
  /** Reconfigura a resposta do próximo POST (409 = "nada mudou"). */
  responderPost: (modo: 'ok' | '409') => void;
}

/**
 * Responde todo o /api/pluggy/* da tela de Conexões. `comDestinos` = chave ligada.
 * O GET de destinos devolve sempre as fixtures; depois de um POST ok, a carteira passa a
 * paraRevisar 0 (o aviso some), como faria a invalidação real.
 */
export async function mockConexoesDestinos(
  page: Page,
  { comDestinos }: { comDestinos: boolean },
): Promise<MockDestinos> {
  const estado = { posts: [] as unknown[], undos: [] as string[], modo: 'ok' as 'ok' | '409' };
  let salvou = false;
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

  await page.route(
    (url) => url.pathname.startsWith('/api/pluggy/'),
    async (route: Route, req: Request) => {
      const { pathname } = new URL(req.url());
      const metodo = req.method();
      if (pathname === '/api/pluggy/config') {
        return json(route, { habilitado: true, incluiSandbox: true });
      }
      if (pathname === '/api/pluggy/connections' && metodo === 'GET') {
        return json(route, { connections: [conexao] });
      }
      if (pathname === '/api/pluggy/consentimentos' && metodo === 'GET') {
        return json(route, { consentimentos: [] });
      }
      if (pathname === '/api/pluggy/caixa-entrada') {
        return json(route, { pendentes: [], total: 0, page: 1, totalPages: 0 });
      }
      if (pathname === '/api/pluggy/carteira' && metodo === 'GET') {
        return json(route, carteiraImportada(comDestinos, salvou ? 0 : 4));
      }
      if (pathname === '/api/pluggy/carteira/destinos' && metodo === 'GET') {
        if (!comDestinos) return json(route, { habilitado: false, itens: [], paraRevisar: 0 });
        const qs = new URL(req.url()).searchParams;
        const itens = itensDestinos().filter(
          (i) => qs.get('paraRevisar') !== '1' || i.situacao === 'para-revisar',
        );
        return json(route, {
          habilitado: true,
          itens,
          paraRevisar: itens.filter((i) => i.situacao === 'para-revisar').length,
        });
      }
      if (pathname === '/api/pluggy/carteira/destinos' && metodo === 'POST') {
        const corpo = req.postDataJSON() as { itens: unknown[]; confirmarIds: string[] };
        estado.posts.push(corpo);
        if (!comDestinos) return json(route, { error: 'Recurso indisponível' }, 404);
        if (estado.modo === '409') {
          return json(
            route,
            {
              error: 'Nenhum investimento mudou de lugar',
              erros: [
                {
                  id: ID.knca,
                  nome: 'KNCA11',
                  motivo: 'Este investimento já foi conferido ou não está mais na Carteira',
                },
              ],
            },
            409,
          );
        }
        salvou = true;
        const n = corpo.itens.length;
        return json(route, {
          aplicados: n,
          semMudanca: 0,
          confirmados: corpo.confirmarIds.length,
          parcial: false,
          erros: [],
          historicoIds: Array.from({ length: n }, (_, k) => `hist-e2e-${k + 1}`),
        });
      }
      return json(route, { error: `sem mock para ${metodo} ${pathname}` }, 404);
    },
  );

  await page.route(
    (url) => /^\/api\/historico-alteracoes\/[^/]+\/undo$/.test(url.pathname),
    async (route: Route, req: Request) => {
      const id = new URL(req.url()).pathname.split('/')[3];
      estado.undos.push(id);
      salvou = false;
      return json(route, { success: true, section: 'carteira' });
    },
  );

  return {
    posts: estado.posts,
    undos: estado.undos,
    responderPost: (modo) => {
      estado.modo = modo;
    },
  };
}
