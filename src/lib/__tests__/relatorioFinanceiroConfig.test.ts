import { afterEach, describe, expect, it, vi } from 'vitest';
import { relatorioFinanceiroHabilitado } from '../relatorioFinanceiroConfig';

describe('relatorioFinanceiroHabilitado', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('desligada por padrão', () => {
    vi.stubEnv('RELATORIO_FINANCEIRO_HABILITADO', '');
    expect(relatorioFinanceiroHabilitado()).toBe(false);
  });

  it('só "true" liga', () => {
    vi.stubEnv('RELATORIO_FINANCEIRO_HABILITADO', 'true');
    expect(relatorioFinanceiroHabilitado()).toBe(true);
    for (const v of ['1', 'TRUE', 'sim', 'false']) {
      vi.stubEnv('RELATORIO_FINANCEIRO_HABILITADO', v);
      expect(relatorioFinanceiroHabilitado()).toBe(false);
    }
  });
});
