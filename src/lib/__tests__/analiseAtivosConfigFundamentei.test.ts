/**
 * Chaves do fundamentei-regras (F0): desligadas por padrão; só o valor exato 'true' liga.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  analiseAtivosDfcProventosAmplo,
  analiseAtivosEssencialV2Habilitado,
  analiseAtivosEuaRotulosEnHabilitado,
  analiseAtivosReitFcoAjustadoHabilitado,
  analiseAtivosSecSbc,
  analiseAtivosVisualV2Habilitado,
} from '@/lib/analiseAtivosConfig';

const CHAVES: Array<[string, () => boolean]> = [
  ['ANALISE_ATIVOS_ESSENCIAL_V2_HABILITADO', analiseAtivosEssencialV2Habilitado],
  ['ANALISE_ATIVOS_REIT_FCO_AJUSTADO_HABILITADO', analiseAtivosReitFcoAjustadoHabilitado],
  ['ANALISE_ATIVOS_EUA_ROTULOS_EN_HABILITADO', analiseAtivosEuaRotulosEnHabilitado],
  ['ANALISE_ATIVOS_VISUAL_V2_HABILITADO', analiseAtivosVisualV2Habilitado],
  ['ANALISE_ATIVOS_DFC_PROVENTOS_AMPLO', analiseAtivosDfcProventosAmplo],
  ['ANALISE_ATIVOS_SEC_SBC', analiseAtivosSecSbc],
];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('chaves do fundamentei-regras', () => {
  it.each(CHAVES)(
    '%s: desligada sem a variável, com vazio e com valor diferente de "true"',
    (nome, fn) => {
      vi.stubEnv(nome, undefined as unknown as string);
      expect(fn()).toBe(false);
      vi.stubEnv(nome, '');
      expect(fn()).toBe(false);
      vi.stubEnv(nome, 'TRUE');
      expect(fn()).toBe(false);
      vi.stubEnv(nome, '1');
      expect(fn()).toBe(false);
    },
  );

  it.each(CHAVES)('%s: liga só com "true" e não liga as outras', (nome, fn) => {
    for (const [outra] of CHAVES) vi.stubEnv(outra, '');
    vi.stubEnv(nome, 'true');
    expect(fn()).toBe(true);
    for (const [outra, outraFn] of CHAVES) if (outra !== nome) expect(outraFn()).toBe(false);
  });
});
