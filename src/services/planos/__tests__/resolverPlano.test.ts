import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PLANO_PADRAO,
  avisarSeOverrideForaDoLocal,
  planoDoUsuario,
  planoForcado,
} from '../resolverPlano';

describe('resolverPlano', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('todo usuário é Advanced até o Stripe', async () => {
    vi.stubEnv('RELATORIO_PLANO_FORCADO', '');
    vi.stubEnv('RELATORIO_PLANO_FORCADO_PERMITIDO', '');
    expect(PLANO_PADRAO).toBe('adv');
    expect(await planoDoUsuario('user-1')).toBe('adv');
  });

  it('ignora o override sem RELATORIO_PLANO_FORCADO_PERMITIDO=1', async () => {
    vi.stubEnv('RELATORIO_PLANO_FORCADO', 'basic');
    vi.stubEnv('RELATORIO_PLANO_FORCADO_PERMITIDO', '');
    expect(planoForcado()).toBeNull();
    expect(await planoDoUsuario('user-1')).toBe('adv');

    vi.stubEnv('RELATORIO_PLANO_FORCADO_PERMITIDO', 'true');
    expect(await planoDoUsuario('user-1')).toBe('adv');
  });

  it('com PERMITIDO=1 o override vale (basic, pro, adv)', async () => {
    vi.stubEnv('RELATORIO_PLANO_FORCADO_PERMITIDO', '1');
    for (const p of ['basic', 'pro', 'adv'] as const) {
      vi.stubEnv('RELATORIO_PLANO_FORCADO', p);
      expect(await planoDoUsuario('user-1')).toBe(p);
    }
    vi.stubEnv('RELATORIO_PLANO_FORCADO', ' PRO ');
    expect(await planoDoUsuario('user-1')).toBe('pro');
  });

  it('valor inválido no override cai no padrão', async () => {
    vi.stubEnv('RELATORIO_PLANO_FORCADO_PERMITIDO', '1');
    vi.stubEnv('RELATORIO_PLANO_FORCADO', 'premium');
    expect(await planoDoUsuario('user-1')).toBe('adv');
  });

  it('avisa no log quando o override está ativo com banco que não é localhost', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('RELATORIO_PLANO_FORCADO_PERMITIDO', '1');
    vi.stubEnv('RELATORIO_PLANO_FORCADO', 'basic');

    vi.stubEnv('DATABASE_URL', 'postgresql://u:p@localhost:5433/sfc_test');
    expect(avisarSeOverrideForaDoLocal()).toBe(false);
    expect(warn).not.toHaveBeenCalled();

    vi.stubEnv('DATABASE_URL', 'postgresql://u:p@db.exemplo.com:5432/prod');
    expect(avisarSeOverrideForaDoLocal()).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('sem override não avisa, qualquer que seja o banco', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('RELATORIO_PLANO_FORCADO', 'basic');
    vi.stubEnv('RELATORIO_PLANO_FORCADO_PERMITIDO', '');
    vi.stubEnv('DATABASE_URL', 'postgresql://u:p@db.exemplo.com:5432/prod');
    expect(avisarSeOverrideForaDoLocal()).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });
});
