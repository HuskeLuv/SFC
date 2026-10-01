import { describe, expect, it } from 'vitest';
import {
  aplicarLucroIndividual,
  lucroDoPeriodo,
} from '@/services/analiseAtivos/regras/acoes/lucroDoPeriodo';
import type { LinhaDemonstrativo } from '@/services/analiseAtivos/regras/acoes/extrairFundamentos';
import { CNPJ, filtrar, lerFixture } from '@/services/analiseAtivos/regras/acoes/__tests__/helpers';

const lpa = lerFixture('dre_lpa_lucro.csv');
const completo = lerFixture('dre_wege_petr_2024.csv');
const fin = lerFixture('dre_financeiras.csv');

describe('lucroDoPeriodo (regra 12)', () => {
  it('KLBN11 2025: 3.11.01 e 3.11.02 publicados 0 com lucro de R$ 1,68 bi ⇒ ausente + flags', () => {
    const r = lucroDoPeriodo(filtrar(lpa, { cnpj: CNPJ.KLBN11, escopo: 'con' }), { escopo: 'con' });
    expect(r.lucroTotal).toEqual({ estado: 'ok', valor: 1_678_211_000 });
    expect(r.lucroAtribuivel.estado).toBe('ausente');
    expect(r.lucroAtribuivel.estado === 'ausente' && r.lucroAtribuivel.motivo).toBe(
      'controladora_zero',
    );
    expect(r.flags).toEqual(['controladora_zero', 'atribuicoes_zeradas']);
    expect(r.codContaLucro).toBe('3.11.01');
  });

  it('WEGE3 2024: lucro atribuível 6.042,6 mi (3.11.01, filha de 3.11)', () => {
    const r = lucroDoPeriodo(filtrar(completo, { cnpj: CNPJ.WEGE3 }), { escopo: 'con' });
    expect(r.lucroAtribuivel).toEqual({ estado: 'ok', valor: 6_042_593_000 });
    expect(r.lucroTotal).toEqual({ estado: 'ok', valor: 6_318_763_000 });
    expect(r.codContaLucro).toBe('3.11.01');
    expect(r.flags).toEqual([]);
  });

  it('PETR4 2024: lucro atribuível 36.606 mi', () => {
    const r = lucroDoPeriodo(filtrar(completo, { cnpj: CNPJ.PETR4 }), { escopo: 'con' });
    expect(r.lucroAtribuivel.estado).toBe('ok');
    expect(
      Math.round((r.lucroAtribuivel.estado === 'ok' ? r.lucroAtribuivel.valor : 0) / 1e6),
    ).toBe(36_606);
  });

  it('ITUB4 2019: linha de lucro é a 3.09 (layout do Itaú) e a controladora é 3.09.01', () => {
    const r = lucroDoPeriodo(filtrar(lpa, { cnpj: CNPJ.ITUB4, escopo: 'con' }), { escopo: 'con' });
    expect(r.codContaLucro).toBe('3.09.01');
    expect(r.lucroAtribuivel).toEqual({ estado: 'ok', valor: 27_113_000_000 });
  });

  it('BBSE3 2025: lucro na 3.13 ("Lucro/Prejuízo Consolidado do Período"), não na 3.11 de operações continuadas', () => {
    const r = lucroDoPeriodo(filtrar(fin, { cnpj: CNPJ.BBSE3 }), { escopo: 'con' });
    expect(r.codContaLucro).toBe('3.13.01');
    expect(r.lucroAtribuivel).toEqual({ estado: 'ok', valor: 9_017_329_000 });
  });

  it('BBAS3 individual sem linha de controladora ⇒ o lucro individual é o da controladora', () => {
    const r = lucroDoPeriodo(filtrar(fin, { cnpj: CNPJ.BBAS3, escopo: 'ind' }), { escopo: 'ind' });
    expect(r.lucroAtribuivel).toEqual({ estado: 'ok', valor: 35_260_189_000 });
    expect(r.codContaLucro).toBe('3.11');
  });

  it('controladora fora da árvore da linha de lucro (3.10.xx de descontinuadas) nunca é usada; 3.99 idem', () => {
    const linhas: LinhaDemonstrativo[] = [
      {
        demonstrativo: 'DRE',
        cdConta: '3.10',
        dsConta: 'Resultado de Operações Descontinuadas',
        valor: 5,
      },
      {
        demonstrativo: 'DRE',
        cdConta: '3.10.01',
        dsConta: 'Atribuído a Sócios da Empresa Controladora',
        valor: 5,
      },
      {
        demonstrativo: 'DRE',
        cdConta: '3.11',
        dsConta: 'Lucro/Prejuízo Consolidado do Período',
        valor: 100,
      },
      {
        demonstrativo: 'DRE',
        cdConta: '3.99.01',
        dsConta: 'Atribuído aos Acionistas Controladores',
        valor: 1,
      },
    ];
    const r = lucroDoPeriodo(linhas, { escopo: 'con' });
    expect(r.lucroTotal).toEqual({ estado: 'ok', valor: 100 });
    expect(r.lucroAtribuivel.estado).toBe('ausente');
    expect(r.codContaLucro).toBe('3.11');
  });

  it('prejuízo com controladora negativa é ok (zero só é "não preenchido" quando o lucro ≠ 0)', () => {
    const base = (ctrl: number, total: number): LinhaDemonstrativo[] => [
      {
        demonstrativo: 'DRE',
        cdConta: '3.11',
        dsConta: 'Lucro/Prejuízo Consolidado do Período',
        valor: total,
      },
      {
        demonstrativo: 'DRE',
        cdConta: '3.11.01',
        dsConta: 'Atribuído a Sócios da Empresa Controladora',
        valor: ctrl,
      },
    ];
    expect(lucroDoPeriodo(base(-50, -60)).lucroAtribuivel).toEqual({ estado: 'ok', valor: -50 });
    expect(lucroDoPeriodo(base(0, 0)).lucroAtribuivel).toEqual({ estado: 'ok', valor: 0 });
  });

  it('sem linha de lucro ⇒ ausente nos dois', () => {
    const r = lucroDoPeriodo([]);
    expect(r.lucroTotal.estado).toBe('ausente');
    expect(r.lucroAtribuivel.estado).toBe('ausente');
  });

  const dre = (cd: string, ds: string, valor: number): LinhaDemonstrativo => ({
    demonstrativo: 'DRE',
    cdConta: cd,
    dsConta: ds,
    valor,
  });

  it('controladora 0 mas não controladores com o lucro ⇒ só controladora_zero (divisão preenchida)', () => {
    const r = lucroDoPeriodo(
      [
        dre('3.11', 'Lucro/Prejuízo Consolidado do Período', 100),
        dre('3.11.01', 'Atribuído a Sócios da Empresa Controladora', 0),
        dre('3.11.02', 'Atribuído a Sócios Não Controladores', 100),
      ],
      { escopo: 'con' },
    );
    expect(r.flags).toEqual(['controladora_zero']);
  });
});

describe('aplicarLucroIndividual (regra 12, atribuições zeradas)', () => {
  const periodo = (
    escopo: 'con' | 'ind',
    lucroAtribuivel: number | null,
    flags: string[],
    tipoPeriodo = 'FY',
  ) => ({ escopo, tipoPeriodo, dtIni: '2025-01-01', lucroAtribuivel, flags });

  it('SBSP3 2025: consolidado com as duas atribuições zeradas ⇒ lucro do individual + lucro_individual', () => {
    const [con, ind] = aplicarLucroIndividual([
      periodo('con', null, ['controladora_zero', 'atribuicoes_zeradas']),
      periodo('ind', 8_460_000_000, []),
    ]);
    expect(con.lucroAtribuivel).toBe(8_460_000_000);
    expect(con.flags).toEqual(['atribuicoes_zeradas', 'lucro_individual']);
    expect(ind.lucroAtribuivel).toBe(8_460_000_000);
  });

  it('só controladora_zero (não controladores preenchido) ou sem individual ⇒ continua ausente', () => {
    const [a] = aplicarLucroIndividual([
      periodo('con', null, ['controladora_zero']),
      periodo('ind', 10, []),
    ]);
    expect(a.lucroAtribuivel).toBeNull();
    const [b] = aplicarLucroIndividual([
      periodo('con', null, ['controladora_zero', 'atribuicoes_zeradas']),
      periodo('ind', 10, [], 'YTD'),
    ]);
    expect(b.lucroAtribuivel).toBeNull();
    expect(b.flags).toContain('controladora_zero');
  });
});
