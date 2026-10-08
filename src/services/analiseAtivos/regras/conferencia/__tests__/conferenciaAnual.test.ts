import { describe, it, expect } from 'vitest';
import {
  CAMPO_COLUNA_FUNDAMENTOS,
  CAMPO_HISTORICO,
  aplicarConferenciaValores,
  flagsConfDoAno,
} from '@/services/analiseAtivos/leitura/ativo/conferenciasAtivo';
import {
  MOTIVO_PER_SHARE,
  anosAcoesAbaixoDaMediana,
  anosPerShareEmConferencia,
  aplicarPerShareNosCodigos,
  conferenciaTelaPerShare,
  conferirPerShareDoAno,
  conferirValoresDoAno,
  ehEstadoPerShareEmConferencia,
  ocultarPerShare,
  type ConferenciaEntrada,
} from '../conferenciaAnual';
import { TEXTOS_RAIO_X } from '@/services/analiseAtivos/textosRaioX';
import type { Estado } from '@/types/analiseAtivosApi';
import fixtures from '@/test/fixtures/analiseAtivos/raio-x-dev.json';

/**
 * Referência: a `conferirLinha` do Essencial ANTES da extração (fundamentosEssencial.ts, Bloco C),
 * copiada literalmente. A função compartilhada tem de dar o mesmo resultado em todos os casos.
 */
function conferirLinhaAntiga(
  valoresIn: Record<string, Estado<number>>,
  ano: number | null,
  classe: 'acao' | 'fii',
  conf: ConferenciaEntrada | undefined,
) {
  if (!conf || conf.flags.length === 0) return { valores: valoresIn, selo: false, algum: false };
  let valores = valoresIn;
  let selo = false;
  let algum = false;
  const aplicar = (mapa: Readonly<Record<string, string>>, flags: readonly string[]) => {
    if (flags.length === 0) return;
    const r = aplicarConferenciaValores(
      valores,
      mapa as Parameters<typeof aplicarConferenciaValores>[1],
      flags,
      conf.motivos,
      classe,
    );
    valores = r.valores;
    selo ||= r.selo;
    algum ||= r.algum;
  };
  if (ano !== null) {
    aplicar(CAMPO_HISTORICO, flagsConfDoAno(conf.flags, ano, ['historico']));
    aplicar(
      CAMPO_COLUNA_FUNDAMENTOS[classe],
      flagsConfDoAno(conf.flags, ano, ['fundamentos_escala']),
    );
  } else {
    aplicar(CAMPO_COLUNA_FUNDAMENTOS[classe], conf.flags);
  }
  return { valores, selo, algum };
}

const ok = (valor: number): Estado<number> => ({ estado: 'ok', valor });
const VALORES_ACAO: Record<string, Estado<number>> = {
  receita: ok(37_500),
  lucro: ok(6_500),
  margem: ok(16.6),
  roe: ok(36.6),
  lpa: ok(1.52),
  dpa: ok(2.45),
  payout: ok(161),
  pl: ok(31.9),
  pvp: ok(11.7),
  dy: ok(5.05),
};
const VALORES_FII: Record<string, Estado<number>> = {
  receita: ok(400),
  resultado: ok(440),
  rendCota: ok(13.2),
  dy: ok(8.4),
  vpCota: ok(166.6),
  pvp: ok(0.9),
  vacancia: ok(2.9),
  nImoveis: ok(28),
  area: ok(1_595_383),
};

const FLAGS_CASOS: string[][] = [
  [],
  ['conf:historico:escala_ano@2022'],
  ['conf:historico:escala_ano@2022', 'conf:historico:escala_ano@2023'],
  ['conf:fundamentos_escala:salto_escala@2023'],
  ['conf:fundamentos_escala:salto_escala@2023-12-31'],
  ['conf:acoes_escala:pvp_minimo@2026-06-30'],
  ['conf:acoes_escala:pvp_minimo@2022'],
  ['conf:preco_base:base_sem_evento@2025-11-03'],
  ['conf:preco_esporadico:faixa_pvp@2026-09-01'],
  ['conf:proventos:dy_acima_teto@2026-06-30', 'provento_suspeito'],
  ['proventos_em_conferencia_salto_recente', 'provento_suspeito'],
  ['conf:fii_vp:vp_salto@2026-05'],
  ['conf:fii_obrigacoes:obrigacoes_acima@2026-06'],
  ['rev:variacao_nivel@2025', 'info:cotacao_esporadica'],
];
const ANOS: Array<number | null> = [2022, 2023, 2025, 2026, null];

describe('conferirValoresDoAno — paridade com a conferirLinha do Essencial', () => {
  for (const classe of ['acao', 'fii'] as const) {
    for (const flags of FLAGS_CASOS) {
      for (const ano of ANOS) {
        it(`${classe} · ${ano ?? 'Últ. 12m'} · [${flags.join(', ')}]`, () => {
          const conf = { flags, motivos: ['div:em_conferencia'] };
          const valores = classe === 'acao' ? VALORES_ACAO : VALORES_FII;
          const antigo = conferirLinhaAntiga(valores, ano, classe, conf);
          const novo = conferirValoresDoAno(
            valores,
            CAMPO_COLUNA_FUNDAMENTOS[classe],
            conf,
            ano,
            classe,
          );
          expect(novo.valores).toEqual(antigo.valores);
          expect(novo.selo).toBe(antigo.selo);
          expect(novo.algum).toBe(antigo.algum);
          expect(Object.keys(novo.porCodigo).length > 0).toBe(antigo.algum);
        });
      }
    }
  }

  it('sem conferência: devolve os mesmos valores', () => {
    const r = conferirValoresDoAno(
      VALORES_ACAO,
      CAMPO_COLUNA_FUNDAMENTOS.acao,
      undefined,
      2025,
      'acao',
    );
    expect(r.valores).toEqual(VALORES_ACAO);
    expect(r.algum).toBe(false);
  });

  it('flags da LINHA (acoes_escala, fii_vp, preco_*) nunca entram numa coluna anual', () => {
    for (const flags of [
      ['conf:acoes_escala:pvp_minimo@2025'],
      ['conf:preco_base:base_sem_evento@2025-11-03'],
      ['conf:proventos:dy_acima_teto@2025'],
    ]) {
      const r = conferirValoresDoAno(
        VALORES_ACAO,
        CAMPO_COLUNA_FUNDAMENTOS.acao,
        { flags, motivos: [] },
        2025,
        'acao',
      );
      expect(r.algum).toBe(false);
      // no 'Últ. 12m' elas valem
      const u = conferirValoresDoAno(
        VALORES_ACAO,
        CAMPO_COLUNA_FUNDAMENTOS.acao,
        { flags, motivos: [] },
        null,
        'acao',
      );
      expect(u.algum).toBe(true);
    }
    const fii = conferirValoresDoAno(
      VALORES_FII,
      CAMPO_COLUNA_FUNDAMENTOS.fii,
      { flags: ['conf:fii_vp:vp_salto@2025-12'], motivos: [] },
      2025,
      'fii',
    );
    expect(fii.algum).toBe(false);
  });

  it('porCodigo traz grupo, política e motivo pronto (historico@ano no P/L do ano)', () => {
    const r = conferirValoresDoAno(
      VALORES_ACAO,
      CAMPO_COLUNA_FUNDAMENTOS.acao,
      { flags: ['conf:historico:escala_ano@2022'], motivos: [] },
      2022,
      'acao',
    );
    expect(Object.keys(r.porCodigo).sort()).toEqual(['pl', 'pvp']);
    expect(r.porCodigo.pl.grupo).toBe('historico');
    expect(r.porCodigo.pl.exibicao).toBe('ocultar');
    expect(r.porCodigo.pl.motivo.length).toBeGreaterThan(10);
    expect(r.valores.pl).toMatchObject({
      estado: 'ausente',
      exibicao: 'ocultar',
      valorNaoPublicado: 31.9,
    });
  });
});

describe('decisão 1 — base por ação quebrada', () => {
  it('salto_acoes_sem_evento ou dados_incompletos (per-share OU múltiplos do ano) ⇒ ocultar', () => {
    expect(conferirPerShareDoAno(['salto_acoes_sem_evento', 'dados_incompletos'], [])).toBe(
      'ocultar',
    );
    expect(conferirPerShareDoAno([], ['dados_incompletos'])).toBe('ocultar');
    expect(conferirPerShareDoAno(null, undefined)).toBeNull();
    expect(conferirPerShareDoAno(['auditoria_proventos'], ['dmpl_zero_com_proventos'])).toBeNull();
  });

  it('CBAV3 (DEV): 2021, 2022 e 2024 pelas flags; 2025 pelo critério de 1/10 da mediana', () => {
    const cbav = fixtures.CBAV3;
    const porAno = anosPerShareEmConferencia(cbav.perShare, cbav.multiplos, { mediana: true });
    expect([...porAno.keys()].sort()).toEqual([2021, 2022, 2024, 2025]);
    expect(porAno.get(2022)).toBe(TEXTOS_RAIO_X.conferencia.saltoAcoes);
    expect(porAno.get(2025)).toBe(TEXTOS_RAIO_X.conferencia.acoesAbaixoMediana);
    // 2023 (645 mi de ações) é plausível e continua visível
    expect(porAno.has(2023)).toBe(false);
    // sem o critério da mediana, 2025 escaparia (LPA R$ 185,91)
    const semMediana = anosPerShareEmConferencia(cbav.perShare, cbav.multiplos, {
      mediana: false,
    });
    expect(semMediana.has(2025)).toBe(false);
  });

  it('ativos sem base quebrada no DEV: nenhum ano (WEGE3, ITUB4, TAEE11, HGLG11, KNCR11)', () => {
    for (const t of ['WEGE3', 'ITUB4', 'TAEE11'] as const) {
      const f = fixtures[t];
      expect(anosPerShareEmConferencia(f.perShare, f.multiplos, { mediana: true }).size).toBe(0);
    }
    for (const t of ['HGLG11', 'KNCR11', 'XPLG11'] as const) {
      const f = fixtures[t];
      expect(anosPerShareEmConferencia(f.perShare, f.multiplos, { mediana: false }).size).toBe(0);
    }
  });

  it('mediana: precisa de 3 anos; ano < 1/10 da mediana entra', () => {
    expect(
      anosAcoesAbaixoDaMediana([
        { anoFiscal: 2024, acoesFim: 1 },
        { anoFiscal: 2025, acoesFim: 1000 },
      ]).size,
    ).toBe(0);
    expect([
      ...anosAcoesAbaixoDaMediana([
        { anoFiscal: 2023, acoesFim: 1000 },
        { anoFiscal: 2024, acoesFim: 1100 },
        { anoFiscal: 2025, acoesFim: 99 },
        { anoFiscal: 2022, acoesFim: null },
      ]),
    ]).toEqual([2025]);
  });

  it('ocultarPerShare: só ok vira ausente com o número em valorNaoPublicado', () => {
    const e = ocultarPerShare(ok(185.91), 'motivo');
    expect(e).toEqual({
      estado: 'ausente',
      motivo: MOTIVO_PER_SHARE,
      texto: 'motivo',
      exibicao: 'ocultar',
      valorNaoPublicado: 185.91,
    });
    expect(ehEstadoPerShareEmConferencia(e)).toBe(true);
    const ausente: Estado<number> = { estado: 'ausente', motivo: 'prejuizo', texto: 'x' };
    expect(ocultarPerShare(ausente, 'motivo')).toBe(ausente);
    const v = aplicarPerShareNosCodigos({ lpa: ok(1), roe: ok(2) }, ['lpa', 'pl'], 'm');
    expect(v.roe).toEqual(ok(2));
    expect(ehEstadoPerShareEmConferencia(v.lpa)).toBe(true);
    expect(aplicarPerShareNosCodigos({ lpa: ok(1) }, ['lpa'], undefined).lpa).toEqual(ok(1));
  });

  it('conferência da página para o "Por quê?" (grupo acoes_escala, política ocultar)', () => {
    const c = conferenciaTelaPerShare('motivo', ['lpa']);
    expect(c).toMatchObject({ grupo: 'acoes_escala', exibicao: 'ocultar', motivo: 'motivo' });
    expect(c.campos).toEqual(['lpa']);
  });
});
