// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  campoEditado,
  corpoParaSalvar,
  erroDoCampo,
  snapshotInicial,
  snapshotPadrao,
  textoDoNumero,
  useEstadoCenario,
  valorMudouDesdeSalvamento,
} from '@/components/analiseAtivos/ativo/cenarios/useEstadoCenario';
import { LIMITES_CENARIO } from '@/services/analiseAtivos/cenarios/contrato';
import type { CenariosResposta } from '@/types/analiseAtivosBlocoD';

const ok = (valor: number) => ({ estado: 'ok' as const, valor });

function wege(salvo: CenariosResposta['salvo'] = null): CenariosResposta {
  return {
    ticker: 'WEGE3',
    nome: 'WEG',
    classe: 'acao',
    cotacao: { valor: ok(50.29), data: '2026-09-29', conferencia: null },
    base: {
      lpa: ok(1.4905),
      vpa: ok(4.4953),
      dpa: ok(2.0032),
      plAlvoPadrao: ok(36.9),
      conferencias: [{ campo: 'dpa', exibicao: 'selo', motivo: 'Proventos em conferência.' }],
    },
    premissasPadrao: { yieldPct: 6, gPct: 8, kPct: 13, margemPct: 20, plAlvo: 36.9 },
    limites: LIMITES_CENARIO,
    salvo,
    podeSalvar: true,
    motivoSemSalvar: null,
    versao: 'v1',
  } as CenariosResposta;
}

function mxrf(): CenariosResposta {
  return {
    ticker: 'MXRF11',
    nome: 'Maxi Renda',
    classe: 'fii',
    cotacao: { valor: ok(9.1), data: '2026-09-29', conferencia: null },
    base: { rend12m: ok(1.195), vpCota: ok(9.2602), pvpAtual: ok(0.98), conferencias: [] },
    premissasPadrao: { yieldPct: 8, margemPct: 10, rendaMensal: 1000, pvpAlvo: 1 },
    limites: LIMITES_CENARIO,
    salvo: null,
    podeSalvar: true,
    motivoSemSalvar: null,
    versao: 'v1',
  } as CenariosResposta;
}

describe('snapshots', () => {
  it('padrão: valores visíveis do ativo e premissas padrão', () => {
    expect(snapshotPadrao(wege())).toEqual({
      textos: {
        lpa: '1,49',
        vpa: '4,50',
        dpa: '2,00',
        yieldPct: '6,0',
        plAlvo: '36,9',
        gPct: '8,0',
        kPct: '13,0',
      },
      margemPct: 20,
    });
    expect(snapshotPadrao(mxrf()).textos).toMatchObject({ rend12m: '1,195', rendaMensal: '1.000' });
  });

  it('salvo por cima: premissas, P/L vazio e só os dados editados', () => {
    const s = snapshotInicial(
      wege({
        premissas: { yieldPct: 4, gPct: 8, kPct: 13, margemPct: 30, plAlvo: null },
        dadosEditados: { lpa: 1.44 },
        atualizadoEm: '2026-10-08T12:00:00Z',
      }),
    );
    expect(s.textos).toMatchObject({ yieldPct: '4,0', plAlvo: '', lpa: '1,44', vpa: '4,50' });
    expect(s.margemPct).toBe(30);
  });

  it('textoDoNumero: renda com centavos mantém 2 casas', () => {
    expect(textoDoNumero('rendaMensal', 1500.5)).toBe('1.500,50');
    expect(textoDoNumero('lpa', null)).toBe('');
  });
});

describe('validação, edição e corpo do PUT', () => {
  const r = wege();
  it('erros: número inválido, faixa e vazios permitidos', () => {
    expect(erroDoCampo(r, 'yieldPct', '45')).toBe('Use um valor entre 0,1 e 30.');
    expect(erroDoCampo(r, 'yieldPct', 'abc')).toMatch(/Digite um número/);
    expect(erroDoCampo(r, 'yieldPct', '')).toMatch(/Digite um número/);
    expect(erroDoCampo(r, 'plAlvo', '')).toBeNull();
    expect(erroDoCampo(r, 'lpa', '')).toBeNull();
    expect(erroDoCampo(r, 'lpa', '-1,04')).toBeNull();
    expect(erroDoCampo(r, 'kPct', '0,5')).toBe('Use um valor entre 1 e 30.');
  });

  it('editado compara com o valor visível', () => {
    expect(campoEditado(r, 'lpa', '1,49')).toBe(false);
    expect(campoEditado(r, 'lpa', '1.490')).toBe(false);
    expect(campoEditado(r, 'lpa', '1,44')).toBe(true);
    expect(campoEditado(r, 'lpa', '')).toBe(true);
  });

  it('corpo: só os dados editados; inválido devolve os campos', () => {
    const s = snapshotPadrao(r);
    const c = corpoParaSalvar(r, { ...s, textos: { ...s.textos, yieldPct: '4', dpa: '1,8' } });
    expect(c).toEqual({
      ok: true,
      corpo: {
        classe: 'acao',
        premissas: { yieldPct: 4, gPct: 8, kPct: 13, margemPct: 20, plAlvo: 36.9 },
        dados: { dpa: 1.8 },
      },
    });
    const ruim = corpoParaSalvar(r, { ...s, textos: { ...s.textos, gPct: '25' } });
    expect(ruim).toEqual({ ok: false, campos: ['gPct'] });
  });

  it('FII: renda "1.000" vira 1000', () => {
    const f = mxrf();
    const c = corpoParaSalvar(f, snapshotPadrao(f));
    expect(c.ok && c.corpo.premissas).toEqual({
      yieldPct: 8,
      margemPct: 10,
      rendaMensal: 1000,
      pvpAlvo: 1,
    });
  });
});

describe('valor do ativo mudou desde o salvamento', () => {
  const salvo = {
    premissas: { yieldPct: 6, gPct: 8, kPct: 13, margemPct: 20, plAlvo: 36.9 },
    dadosEditados: { lpa: 1.44 },
    atualizadoEm: '2026-08-02T10:03:00Z',
    valoresDoAtivoNoSalvamento: { lpa: 1.4 },
  };
  it('avisa com o valor atual enquanto o campo continua editado', () => {
    const r = wege(salvo);
    expect(valorMudouDesdeSalvamento(r, 'lpa', '1,44')).toBe(1.4905);
    expect(valorMudouDesdeSalvamento(r, 'lpa', '1,49')).toBeNull();
    expect(valorMudouDesdeSalvamento(r, 'vpa', '4,50')).toBeNull();
  });
  it('sem mudança no ativo, sem aviso', () => {
    const r = wege({ ...salvo, valoresDoAtivoNoSalvamento: { lpa: 1.49 } });
    expect(valorMudouDesdeSalvamento(r, 'lpa', '1,44')).toBeNull();
  });
});

describe('useEstadoCenario', () => {
  it('editar marca "não salvo", calcula e "voltar ao valor do ativo" desfaz', () => {
    const { result } = renderHook(() => useEstadoCenario(wege(), { pm: 38.6, quantidade: 300 }));
    expect(result.current.sujo).toBe(false);
    expect(result.current.saida.linhas[0].resultado).toBe(33.33);
    expect(result.current.saida.suaPosicao?.multiploSobreCusto).toBe(25.9);
    act(() => result.current.setTexto('dpa', '1,5'));
    expect(result.current.sujo).toBe(true);
    expect(result.current.editado('dpa')).toBe(true);
    expect(result.current.saida.linhas[0]).toMatchObject({
      resultado: 25,
      usaDadoEmConferencia: null,
    });
    act(() => result.current.voltarAoAtivo('dpa'));
    expect(result.current.sujo).toBe(false);
    act(() => result.current.setMargem(30));
    expect(result.current.saida.linhas[0].comMargem).toBe(23.33);
    act(() => result.current.marcarSalvo());
    expect(result.current.sujo).toBe(false);
  });
});
