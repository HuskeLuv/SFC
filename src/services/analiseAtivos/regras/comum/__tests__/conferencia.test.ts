import { describe, expect, it } from 'vitest';
import {
  CAMPOS_TELA,
  DEF_GRUPO,
  FLAG_INFO_COTACAO_ESPORADICA,
  GRUPOS_CONFERENCIA,
  REGRAS_REVISAO,
  campoEmConferencia,
  camposDoGrupo,
  componentesDoGrupo,
  deveContaminarEmpresa,
  flagsConf,
  formatarFlagConf,
  formatarFlagInfo,
  formatarFlagRev,
  gruposConf,
  gruposLegados,
  motivoIndiceConferencia,
  parseFlagConf,
  parseFlagInfo,
  parseFlagRev,
  type CampoTela,
} from '@/services/analiseAtivos/regras/comum/conferencia';

describe('flags conf:/rev:/info:', () => {
  it('round-trip conf: para todos os grupos e regras', () => {
    for (const grupo of GRUPOS_CONFERENCIA) {
      for (const regra of DEF_GRUPO[grupo].regras) {
        const f = { grupo, regra, chave: '2026-04-29' };
        const s = formatarFlagConf(f);
        expect(s).toBe(`conf:${grupo}:${regra}@2026-04-29`);
        expect(parseFlagConf(s)).toEqual(f);
      }
    }
  });

  it('round-trip rev: e info:', () => {
    for (const regra of Object.keys(REGRAS_REVISAO) as Array<keyof typeof REGRAS_REVISAO>) {
      const s = formatarFlagRev({ regra, chave: '2025' });
      expect(parseFlagRev(s)).toEqual({ regra, chave: '2025' });
    }
    expect(formatarFlagInfo('cotacao_esporadica')).toBe(FLAG_INFO_COTACAO_ESPORADICA);
    expect(parseFlagInfo(FLAG_INFO_COTACAO_ESPORADICA)).toBe('cotacao_esporadica');
    expect(parseFlagInfo('info:outra')).toBeNull();
  });

  it('chave inválida (com ":", "@", espaço ou vazia) é rejeitada', () => {
    for (const chave of ['a:b', 'a@b', 'a b', '', 'x'.repeat(41)]) {
      expect(() =>
        formatarFlagConf({ grupo: 'preco_base', regra: 'base_sem_evento', chave }),
      ).toThrow(/chave inválida/);
      expect(() => formatarFlagRev({ regra: 'variacao_lucro', chave })).toThrow(/chave inválida/);
    }
    expect(parseFlagConf('conf:preco_base:base_sem_evento@a@b')).toBeNull();
    expect(parseFlagConf('conf:preco_base:base_sem_evento@a:b')).toBeNull();
    expect(parseFlagConf('conf:preco_base:base_sem_evento@')).toBeNull();
  });

  it('grupo/regra inválidos: formatar lança, parse devolve null (inclusive o grupo manual)', () => {
    expect(() =>
      formatarFlagConf({ grupo: 'manual' as never, regra: 'vacancia', chave: 'abcd1234' }),
    ).toThrow(/grupo/);
    expect(parseFlagConf('conf:manual:vacanciaCvm@abcd1234')).toBeNull();
    expect(() =>
      formatarFlagConf({ grupo: 'fii_vp', regra: 'Com-Maiuscula', chave: '2026-08' }),
    ).toThrow(/regra/);
    expect(() => formatarFlagRev({ regra: 'inventada' as never, chave: '2025' })).toThrow();
    expect(parseFlagRev('rev:inventada@2025')).toBeNull();
    expect(parseFlagConf('rev:variacao_lucro@2025')).toBeNull();
  });
});

describe('legado de proventos separado de conf:', () => {
  const LEGADO = ['proventos_em_conferencia_dy_acima_teto'];

  it('gruposConf lê só conf:; gruposLegados só o legado', () => {
    expect(gruposConf(LEGADO)).toEqual([]);
    expect(gruposLegados(LEGADO)).toEqual(['proventos']);
    expect(gruposLegados(['provento_suspeito'])).toEqual(['proventos']);
    expect(gruposLegados(['proventos_defasados_parado'])).toEqual(['proventos']);
    expect(gruposLegados([], ['div:em_conferencia'])).toEqual(['proventos']);
    expect(gruposLegados(['cnpj_em_conferencia'])).toEqual(['cnpj']);

    const conf = ['conf:preco_base:base_sem_evento@2026-04-29'];
    expect(gruposConf(conf)).toEqual(['preco_base']);
    expect(gruposLegados(conf)).toEqual([]);
  });

  it('linha só com flags v1 (legado): DY fica selo/legado; nada de ocultar', () => {
    const c = campoEmConferencia(LEGADO, ['div:em_conferencia'], 'dy12m', 'acao');
    expect(c).toEqual({
      grupo: 'proventos',
      regra: 'dy_acima_teto',
      chave: null,
      exibicao: 'selo',
      origem: 'legado',
    });
    expect(campoEmConferencia(LEGADO, [], 'pl', 'acao')).toBeNull();
    expect(campoEmConferencia(['provento_suspeito'], [], 'payout')?.regra).toBe(
      'provento_suspeito',
    );
  });

  it('linha sem flag nenhuma: nada em conferência em nenhum campo', () => {
    for (const campo of CAMPOS_TELA) expect(campoEmConferencia([], [], campo)).toBeNull();
  });
});

describe('campoEmConferencia por grupo × classe × exibição', () => {
  it('cada campo de cada grupo: exibição de DEF_GRUPO, origem conf', () => {
    for (const grupo of GRUPOS_CONFERENCIA) {
      const def = DEF_GRUPO[grupo];
      const flag = formatarFlagConf({ grupo, regra: def.regras[0], chave: '2026-04-29' });
      for (const classe of def.classes) {
        for (const campo of camposDoGrupo(grupo)) {
          const c = campoEmConferencia([flag], [], campo, classe);
          expect(c?.origem, `${grupo}/${classe}/${campo}`).toBe('conf');
          // outro grupo pode marcar o mesmo campo com 'ocultar' (que vence); aqui só um grupo
          expect(c?.exibicao).toBe(def.campos[campo]);
          expect(c?.grupo).toBe(grupo);
          expect(c?.chave).toBe('2026-04-29');
        }
      }
    }
  });

  it('classe fora do grupo não marca (acoes_escala num FII; fii_vp numa ação)', () => {
    const escala = formatarFlagConf({
      grupo: 'acoes_escala',
      regra: 'pvp_minimo',
      chave: '2026-06-30',
    });
    expect(campoEmConferencia([escala], [], 'pvp', 'fii')).toBeNull();
    expect(campoEmConferencia([escala], [], 'pvp', 'acao')?.exibicao).toBe('ocultar');
    const vp = formatarFlagConf({ grupo: 'fii_vp', regra: 'vp_salto', chave: '2026-08' });
    expect(campoEmConferencia([vp], [], 'pvp', 'acao')).toBeNull();
  });

  it('CBAV3 (acoes_escala): nº de ações, EV/EBITDA e P/Receita ocultos; DY não', () => {
    const f = [
      formatarFlagConf({ grupo: 'acoes_escala', regra: 'pvp_minimo', chave: '2026-06-30' }),
    ];
    for (const campo of ['nAcoes', 'evEbitda', 'pReceita', 'pl', 'pvp', 'valorMercado'] as const) {
      expect(campoEmConferencia(f, [], campo, 'acao')?.exibicao).toBe('ocultar');
    }
    expect(campoEmConferencia(f, [], 'dy12m', 'acao')).toBeNull();
    expect(componentesDoGrupo('acoes_escala', 'acao')).toEqual(['preco']);
  });

  it('SBSP3 (preco_base): cotação com selo; DY, P/L, P/VP e VM ocultos', () => {
    const f = [
      formatarFlagConf({ grupo: 'preco_base', regra: 'base_sem_evento', chave: '2026-04-29' }),
    ];
    expect(campoEmConferencia(f, [], 'preco', 'acao')?.exibicao).toBe('selo');
    for (const campo of ['dy12m', 'pl', 'pvp', 'valorMercado'] as const) {
      expect(campoEmConferencia(f, [], campo, 'acao')?.exibicao).toBe('ocultar');
    }
    expect(componentesDoGrupo('preco_base', 'acao')).toEqual(['div', 'preco']);
  });

  it('dois grupos no mesmo campo: ocultar vence selo; mesmo com o legado de proventos', () => {
    const f = [
      formatarFlagConf({ grupo: 'preco_esporadico', regra: 'faixa_pvp', chave: '2026-10-01' }),
      formatarFlagConf({ grupo: 'preco_base', regra: 'base_sem_evento', chave: '2026-04-29' }),
      'proventos_em_conferencia_salto_recente',
    ];
    const c = campoEmConferencia(f, ['div:em_conferencia'], 'dy12m', 'acao');
    expect(c).toMatchObject({ grupo: 'preco_base', exibicao: 'ocultar', origem: 'conf' });
  });

  it('PMRL11 (fii_obrigacoes): Obrigações/PL com selo, componente dívida do FII', () => {
    const f = [
      formatarFlagConf({ grupo: 'fii_obrigacoes', regra: 'obrigacoes_acima', chave: '2026-08' }),
    ];
    expect(campoEmConferencia(f, [], 'obrigacoesPl', 'fii')?.exibicao).toBe('selo');
    expect(componentesDoGrupo('fii_obrigacoes', 'fii')).toEqual(['divida']);
    expect(componentesDoGrupo('fii_obrigacoes', 'acao')).toEqual([]);
    expect(motivoIndiceConferencia('divida')).toBe('divida:em_conferencia');
  });

  it('política aprovada: ocultar em escala/histórico/base/VP; selo em proventos, esporádico e obrigações', () => {
    const exibicoes = (g: keyof typeof DEF_GRUPO) => new Set(Object.values(DEF_GRUPO[g].campos));
    expect(exibicoes('proventos')).toEqual(new Set(['selo']));
    expect(exibicoes('preco_esporadico')).toEqual(new Set(['selo']));
    expect(exibicoes('fii_obrigacoes')).toEqual(new Set(['selo']));
    expect(exibicoes('acoes_escala')).toEqual(new Set(['ocultar']));
    expect(exibicoes('historico')).toEqual(new Set(['ocultar']));
    expect(exibicoes('fii_vp')).toEqual(new Set(['ocultar']));
    expect(exibicoes('fundamentos_escala')).toEqual(new Set(['ocultar']));
  });

  it('todo campo e campo principal de DEF_GRUPO/REGRAS_REVISAO existe em CAMPOS_TELA', () => {
    const todos = new Set<string>(CAMPOS_TELA);
    for (const g of GRUPOS_CONFERENCIA) {
      expect(todos.has(DEF_GRUPO[g].campoPrincipal)).toBe(true);
      for (const c of camposDoGrupo(g)) expect(todos.has(c as CampoTela)).toBe(true);
    }
    for (const r of Object.values(REGRAS_REVISAO)) expect(todos.has(r.campo)).toBe(true);
  });

  it('flagsConf ignora rev:, info: e lixo', () => {
    const f = flagsConf([
      'rev:variacao_lucro@2025',
      FLAG_INFO_COTACAO_ESPORADICA,
      'conf:historico:escala_ano@2019',
      'conf:',
      'proventos_em_conferencia_salto_recente',
    ]);
    expect(f).toEqual([{ grupo: 'historico', regra: 'escala_ano', chave: '2019' }]);
  });
});

describe('deveContaminarEmpresa (escopo empresa × ticker)', () => {
  it('ON/PN: preço da PN esporádica não contamina a ON; escala de ações contamina', () => {
    expect(deveContaminarEmpresa('preco_esporadico', 'ABCD4', 'ABCD3')).toBe(false);
    expect(deveContaminarEmpresa('preco_base', 'ABCD4', 'ABCD3')).toBe(false);
    expect(deveContaminarEmpresa('preco_base', 'abcd3', 'ABCD3')).toBe(true);
    expect(deveContaminarEmpresa('acoes_escala', 'ABCD4', 'ABCD3')).toBe(true);
    expect(deveContaminarEmpresa('proventos', 'ABCD4', 'ABCD3')).toBe(true);
    expect(deveContaminarEmpresa('historico', 'ABCD4', 'ABCD3')).toBe(true);
    expect(deveContaminarEmpresa('fundamentos_escala', 'ABCD4', 'ABCD3')).toBe(true);
  });

  it('grupos de FII são de escopo ticker', () => {
    expect(DEF_GRUPO.fii_vp.escopo).toBe('ticker');
    expect(DEF_GRUPO.fii_obrigacoes.escopo).toBe('ticker');
  });
});
