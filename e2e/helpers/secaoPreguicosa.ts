import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Card do Valuation na página do ativo, montado. Ele fica numa SecaoPreguicosa (monta quando o
 * marcador chega a 400px do viewport), e as seções preguiçosas de cima crescem ao montar e
 * empurram o marcador para fora da margem: rolar uma vez só e esperar o card deixava o teste
 * instável. Aqui rola até o marcador de novo até o card existir.
 */
export async function montarCardValuation(page: Page, ticker: string): Promise<Locator> {
  const card = page.locator(`section[aria-labelledby="valuation-${ticker}"]`);
  const marcador = page.locator('[aria-busy="true"][aria-label^="Valuation"]').first();
  await expect(async () => {
    if ((await card.count()) === 0 && (await marcador.count()) > 0) {
      await marcador.scrollIntoViewIfNeeded({ timeout: 5_000 });
    }
    await expect(card).toBeAttached({ timeout: 3_000 });
  }).toPass({ timeout: 90_000 });
  await card.scrollIntoViewIfNeeded();
  return card;
}
