import type { Page, Request, Route } from '@playwright/test';

/**
 * Apoio dos e2e do Assistente de IA (botão flutuante + AssistentePanel) — esconder valores, Fase 6.
 *
 * Em dev/CI não há chave da API (o assistente fica desligado e o botão nem aparece) e NUNCA se
 * chama a API real. `mockarAssistente(page)` responde por `page.route`:
 *
 * - GET  /api/assistente → `{ habilitado: true, uso }` (o botão "Abrir assistente" aparece);
 * - POST /api/assistente → resposta com dinheiro no texto (RESPOSTA_ASSISTENTE) e um cartão de
 *   proposta de lançamento (PROPOSTA_ASSISTENTE). NÃO chega ao servidor; o corpo pedido fica em
 *   `escritas`;
 * - POST /api/assistente/confirmar → 200 `{ ok: true }`, guardado em `escritas`.
 *
 * DECISÃO 14: o texto da IA, as mensagens e os cartões NÃO são mascarados — com o olho fechado só
 * aparece um aviso fixo no painel. Por isso as SENTINELAS aqui servem ao contrário dos outros
 * helpers: com o olho fechado elas CONTINUAM no innerText do painel (e o aviso aparece); com o
 * olho aberto o painel fica idêntico ao de hoje (sem aviso).
 */

/** pt-BR no texto: 4.567,89 · 1.357,91 · 16.294,92. */
export const SENTINELAS_ASSISTENTE = {
  gastoMercado: 4567.89,
  lancamento: 1357.91,
  totalAno: 16294.92,
} as const;

export const RESPOSTA_ASSISTENTE =
  'Em outubro você gastou R$ 4.567,89 com mercado. Posso registrar R$ 1.357,91 de aluguel em novembro?';

export const PROPOSTA_ASSISTENTE = {
  token: 'e2e-token-proposta',
  tipo: 'despesa' as const,
  linha: 'Aluguel',
  grupo: 'Habitação',
  valor: SENTINELAS_ASSISTENTE.lancamento,
  modo: 'definir' as const,
  recorrente: false,
  periodo: 'novembro/2026',
  ano: 2026,
  descricao: null,
  celulas: [
    { mes: 10, mesNome: 'novembro', valorAtual: 0, valorNovo: SENTINELAS_ASSISTENTE.lancamento },
  ],
  valorTotal: SENTINELAS_ASSISTENTE.lancamento,
  expiraEm: Date.now() + 10 * 60_000,
};

const USO = { usadas: 3, limite: 300, restantes: 297, economico: false };

export interface EscritaAssistente {
  metodo: string;
  pathname: string;
  corpo: unknown;
}

export async function mockarAssistente(
  page: Page,
  { comProposta = true }: { comProposta?: boolean } = {},
): Promise<{ escritas: EscritaAssistente[] }> {
  const escritas: EscritaAssistente[] = [];
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

  await page.route(
    (url) => url.pathname === '/api/assistente' || url.pathname.startsWith('/api/assistente/'),
    async (route: Route, req: Request) => {
      const url = new URL(req.url());
      const metodo = req.method();
      if (metodo === 'GET' && url.pathname === '/api/assistente') {
        return json(route, { habilitado: true, modelo: 'e2e-mock', uso: USO });
      }
      let corpo: unknown = null;
      try {
        corpo = req.postDataJSON();
      } catch {
        corpo = req.postData();
      }
      escritas.push({ metodo, pathname: url.pathname, corpo });
      if (url.pathname === '/api/assistente') {
        return json(route, {
          resposta: RESPOSTA_ASSISTENTE,
          propostas: comProposta ? [PROPOSTA_ASSISTENTE] : undefined,
          uso: { ...USO, usadas: USO.usadas + 1, restantes: USO.restantes - 1 },
        });
      }
      return json(route, { ok: true });
    },
  );

  return { escritas };
}

/** Abre o painel pelo botão flutuante e devolve o dialog. */
export async function abrirAssistente(page: Page) {
  await page.getByRole('button', { name: 'Abrir assistente' }).click();
  const painel = page.getByRole('dialog', { name: 'Assistente My Finance' });
  await painel.waitFor({ state: 'visible' });
  return painel;
}
