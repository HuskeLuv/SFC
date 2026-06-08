import { test, expect } from '@playwright/test';

// Usa o storageState salvo em auth.setup.ts (usuário demo logado).
//
// Smoke de render: cada rota autenticada deve montar SEM cair no ErrorBoundary
// e SEM lançar erro de runtime não capturado. Type-check/lint/build NÃO pegam
// crashes de runtime de React (ex.: hook de contexto usado fora do Provider) —
// só renderizar a página no browser pega. Foi assim que a antiga /analises foi
// pra prod quebrada. Este teste fecha esse buraco antes do merge.

const ROUTES = [
  '/carteira',
  '/fluxodecaixa',
  '/calendario',
  '/planejamento-financeiro',
  '/profile',
  '/relatorios',
];

const ERROR_BOUNDARY = /Algo deu errado|Ocorreu um erro inesperado/i;
// Erros de runtime típicos de regressão estrutural (provider ausente, etc.)
const RUNTIME_ERR = /deve ser usado dentro de|is not defined|Cannot read|undefined is not/i;

test.describe('Smoke: rotas autenticadas renderizam sem crash', () => {
  for (const route of ROUTES) {
    test(`${route} monta sem ErrorBoundary nem erro de runtime`, async ({ page }) => {
      const pageErrors: string[] = [];
      page.on('pageerror', (e) => pageErrors.push(e.message));

      await page.goto(route, { waitUntil: 'domcontentloaded' });
      // dá tempo de hidratar e os componentes client montarem/fetcharem
      await page.waitForTimeout(4000);

      const body = await page.evaluate(() => document.body.innerText);
      expect(body, `ErrorBoundary disparou em ${route}`).not.toMatch(ERROR_BOUNDARY);

      const fatal = pageErrors.filter((m) => RUNTIME_ERR.test(m));
      expect(fatal, `Erro de runtime em ${route}: ${fatal.join(' | ')}`).toHaveLength(0);
    });
  }
});
