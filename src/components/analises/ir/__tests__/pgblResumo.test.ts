import { describe, expect, it } from 'vitest';
import { REGRAS_IRPF_2026, simularIrpfAnual } from '@/services/ir/irpfAnual';
import type { IRPlanoPrevidencia } from '@/hooks/useIR';
import {
  balancoDaa,
  dataLembreteAporte,
  entradaDosCampos,
  htmlResumoDaa,
  lembreteAporte,
  textoLancamentos,
} from '../pgblResumo';

const plano = (over: Partial<IRPlanoPrevidencia> = {}): IRPlanoPrevidencia => ({
  assetId: 'p1',
  nome: 'Brasilprev PGBL',
  cnpj: '12.345.678/0001-90',
  tipoSugerido: 'pgbl',
  aportesQuantidade: 10,
  aportesTotal: 12000,
  resgatesTotal: 0,
  saldoAtual: 30000,
  ...over,
});

const campos = {
  rendaTributavel: '186.400,00',
  inss: '10.934,20',
  irRetido: '31.280,00',
  dependentes: '1',
  saude: '6.800,00',
  aportesOutros: '2.200,00',
};

describe('entradaDosCampos', () => {
  it('soma os aportes da carteira aos de fora e lê o formato pt-BR', () => {
    const e = entradaDosCampos(campos, 12000);
    expect(e.rendaTributavel).toBe(186400);
    expect(e.aportesPgbl).toBe(14200);
    expect(e.dependentes).toBe(1);
    expect(e.irRetido).toBe(31280);
    expect(e.educacao).toBe(0);
  });
});

describe('balancoDaa', () => {
  const entrada = entradaDosCampos(campos, 12000);
  const r = simularIrpfAnual(entrada, REGRAS_IRPF_2026);

  it('restituição = retido − IR devido no melhor modelo', () => {
    const b = balancoDaa(r, entrada.irRetido, 0);
    expect(b.saldo).toBeCloseTo(r.saldoAjuste, 2);
    expect(b.irRetido).toBe(31280);
    expect(b.modelo).toBe(r.melhorModelo);
  });

  it('o IR do exterior (Lei 14.754) diminui a restituição', () => {
    const b = balancoDaa(r, entrada.irRetido, 1000);
    expect(b.saldo).toBeCloseTo(r.saldoAjuste - 1000, 2);
    expect(b.irInvestimentos).toBe(1000);
  });

  it('IR do exterior negativo não vira crédito', () => {
    expect(balancoDaa(r, entrada.irRetido, -50).irInvestimentos).toBe(0);
  });
});

describe('textoLancamentos e htmlResumoDaa', () => {
  const entrada = entradaDosCampos(campos, 12000);
  const r = simularIrpfAnual(entrada, REGRAS_IRPF_2026);
  const dados = { ano: 2026, entrada, r, planosPgbl: [plano()], aportesOutros: 2200 };

  it('lista o código 36 por plano, os de fora e as outras fichas', () => {
    const t = textoLancamentos(dados);
    expect(t).toContain('Declaração de 2027 (ano-calendário 2026)');
    expect(t).toMatch(/Código 36.*Brasilprev PGBL.*R\$\s12\.000,00/);
    expect(t).toMatch(/planos fora da carteira.*R\$\s2\.200,00/);
    expect(t).toContain('CNPJ da seguradora');
    expect(t).toMatch(/Saúde: R\$\s6\.800,00/);
    expect(t).toMatch(/INSS\): R\$\s10\.934,20/);
    expect(t).toContain('Dependentes: 1.');
    expect(t).toMatch(/Restituição|Imposto a pagar/);
  });

  it('sem IR retido pede para informar em vez de inventar o saldo', () => {
    const e = { ...entrada, irRetido: 0 };
    const t = textoLancamentos({ ...dados, entrada: e, r: simularIrpfAnual(e, REGRAS_IRPF_2026) });
    expect(t).toContain('Informe o IR retido');
  });

  it('o HTML escapa o nome do plano', () => {
    const html = htmlResumoDaa(
      { ...dados, planosPgbl: [plano({ nome: '<script>x</script> & Cia' })] },
      new Date(2026, 10, 5),
    );
    expect(html).not.toContain('<script>x');
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt; &amp; Cia');
    expect(html).toContain('declaração de 2027');
    expect(html).toContain('05/11/2026');
  });
});

describe('lembrete de aporte', () => {
  it('marca 15/12, ou amanhã depois disso, nunca além de 31/12', () => {
    expect(dataLembreteAporte(2026, new Date(2026, 10, 5))).toBe('2026-12-15');
    expect(dataLembreteAporte(2026, new Date(2026, 11, 20))).toBe('2026-12-21');
    expect(dataLembreteAporte(2026, new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('descreve o espaço que falta e liga o aviso', () => {
    const entrada = entradaDosCampos(campos, 12000);
    const r = simularIrpfAnual(entrada, REGRAS_IRPF_2026);
    const ev = lembreteAporte(2026, r, new Date(2026, 10, 5));
    expect(ev.titulo).toBe('Aporte no PGBL até 31/12/2026');
    expect(ev.categoria).toBe('lembrete');
    expect(ev.lembrete).toBe(true);
    expect(ev.descricao).toMatch(/Faltam R\$\s8\.168,00/);
  });
});
