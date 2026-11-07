import { describe, expect, it } from 'vitest';
import {
  ACESSO_BLOCOS,
  LIMITES_PLANO,
  MATRIZ_EXIBICAO,
  OFERTAS_PLANOS,
  PLANOS,
  PLANOS_PAGOS,
  PRECOS_PLANOS,
  aplicarCadeado,
  descontoOfertaPct,
  ehIntervalo,
  ehPlanoPago,
  equivalenteMensalOferta,
  formatarReais,
  maxPlano,
  ofertaVigente,
  temAcesso,
} from '../planos';
import type { RelatorioFinanceiro } from '@/types/relatorioFinanceiro';

describe('planos', () => {
  it('temAcesso segue o rank basic < pro < adv', () => {
    expect(temAcesso('basic', 'basic')).toBe(true);
    expect(temAcesso('basic', 'pro')).toBe(false);
    expect(temAcesso('pro', 'pro')).toBe(true);
    expect(temAcesso('pro', 'adv')).toBe(false);
    expect(temAcesso('adv', 'pro')).toBe(true);
  });

  it('matriz do Pedro', () => {
    expect(ACESSO_BLOCOS).toEqual({
      carteira: 'pro',
      planejamento: 'pro',
      sonhos: 'pro',
      carteiraAvancada: 'adv',
      saude: 'adv',
      ir: 'adv',
    });
  });

  it('a oferta vale até o fim de 05/12 em São Paulo', () => {
    expect(ofertaVigente(new Date('2026-12-05T23:59:00-03:00'))).toBe(true);
    // 06/12 00:30 em SP = 03:30 UTC
    expect(ofertaVigente(new Date('2026-12-06T00:30:00-03:00'))).toBe(false);
    // 06/12 01:00 UTC ainda é 05/12 em SP
    expect(ofertaVigente(new Date('2026-12-06T01:00:00Z'))).toBe(true);
  });

  describe('aplicarCadeado', () => {
    // Relatório com TODOS os blocos preenchidos (o conteúdo não importa para a máscara).
    const cheio = {
      versao: 1,
      plano: 'adv',
      orcamento: { b: 'orcamento' },
      dividas: { b: 'dividas' },
      carteira: { b: 'carteira' },
      carteiraAvancada: { b: 'carteiraAvancada' },
      planejamento: { b: 'planejamento' },
      sonhos: [],
      saude: { b: 'saude' },
      ir: { b: 'ir' },
      irGancho: { b: 'irGancho' },
    } as unknown as RelatorioFinanceiro;

    it('basic: zera tudo que não é orçamento/dívidas', () => {
      const r = aplicarCadeado(cheio, 'basic');
      expect(r.plano).toBe('basic');
      expect(r.carteira).toBeNull();
      expect(r.planejamento).toBeNull();
      expect(r.sonhos).toBeNull();
      expect(r.carteiraAvancada).toBeNull();
      expect(r.saude).toBeNull();
      expect(r.ir).toBeNull();
      expect(r.irGancho).not.toBeNull();
      expect(r.orcamento).toBe(cheio.orcamento);
      expect(r.dividas).toBe(cheio.dividas);
    });

    it('pro: zera os blocos Advanced e mantém o gancho', () => {
      const r = aplicarCadeado(cheio, 'pro');
      expect(r.carteira).not.toBeNull();
      expect(r.planejamento).not.toBeNull();
      expect(r.sonhos).not.toBeNull();
      expect(r.carteiraAvancada).toBeNull();
      expect(r.saude).toBeNull();
      expect(r.ir).toBeNull();
      expect(r.irGancho).not.toBeNull();
    });

    it('adv: tudo liberado e sem gancho', () => {
      const r = aplicarCadeado(cheio, 'adv');
      expect(r.carteiraAvancada).not.toBeNull();
      expect(r.saude).not.toBeNull();
      expect(r.ir).not.toBeNull();
      expect(r.irGancho).toBeNull();
    });
  });
});

describe('PRECOS_PLANOS (aritmética)', () => {
  it.each(PLANOS_PAGOS)('%s: anual cheio = 12 mensalidades e oferta = anual − cupom', (plano) => {
    const p = PRECOS_PLANOS[plano];
    expect(p.anualCentavos).toBe(p.mensalCentavos * 12);
    expect(p.anualOfertaCentavos).toBe(p.anualCentavos - p.cupomOfertaCentavos);
    expect(p.anualOfertaCentavos % 12).toBe(0); // equivalente mensal exato, sem arredondar
  });

  it('valores aprovados em 07/11 (proposta ao Pedro)', () => {
    expect(PRECOS_PLANOS.pro).toEqual({
      mensalCentavos: 4990,
      anualCentavos: 59880,
      cupomOfertaCentavos: 11976,
      anualOfertaCentavos: 47904,
    });
    expect(PRECOS_PLANOS.adv).toEqual({
      mensalCentavos: 14290,
      anualCentavos: 171480,
      cupomOfertaCentavos: 51600,
      anualOfertaCentavos: 119880,
    });
    expect(equivalenteMensalOferta('pro')).toBe(3992);
    expect(equivalenteMensalOferta('adv')).toBe(9990);
    expect(descontoOfertaPct('pro')).toBe(20);
    expect(descontoOfertaPct('adv')).toBe(30.09);
  });
});

describe('OFERTAS_PLANOS × PRECOS_PLANOS', () => {
  it.each(PLANOS_PAGOS)('%s: textos batem com a conta', (plano) => {
    const o = OFERTAS_PLANOS[plano];
    expect(o.anual).toBe(`${formatarReais(PRECOS_PLANOS[plano].anualOfertaCentavos)}/ano`);
    expect(o.equivalente).toBe(`${formatarReais(equivalenteMensalOferta(plano))} por mês`);
    expect(o.desconto).toBe(`${Math.round(descontoOfertaPct(plano))}%`);
  });

  it('sem "12x" (o anual é cobrado de uma vez)', () => {
    expect(JSON.stringify(OFERTAS_PLANOS)).not.toMatch(/12x/i);
  });
});

describe('formatarReais', () => {
  it('formata centavos em BRL', () => {
    expect(formatarReais(4990)).toBe('R$ 49,90');
    expect(formatarReais(119880)).toBe('R$ 1.198,80');
    expect(formatarReais(171480)).toBe('R$ 1.714,80');
    expect(formatarReais(123456789)).toBe('R$ 1.234.567,89');
    expect(formatarReais(5)).toBe('R$ 0,05');
    expect(formatarReais(-51600)).toBe('−R$ 516,00');
  });
});

describe('maxPlano e guards', () => {
  it('max dos planos, ignorando nulos', () => {
    expect(maxPlano()).toBe('basic');
    expect(maxPlano(null, undefined)).toBe('basic');
    expect(maxPlano('pro', 'basic')).toBe('pro');
    expect(maxPlano('basic', 'adv', 'pro')).toBe('adv');
  });

  it('ehPlanoPago e ehIntervalo', () => {
    expect(ehPlanoPago('pro')).toBe(true);
    expect(ehPlanoPago('adv')).toBe(true);
    expect(ehPlanoPago('basic')).toBe(false);
    expect(ehPlanoPago(null)).toBe(false);
    expect(ehIntervalo('mes')).toBe(true);
    expect(ehIntervalo('ano')).toBe(true);
    expect(ehIntervalo('mensal')).toBe(false);
  });
});

describe('LIMITES_PLANO e MATRIZ_EXIBICAO', () => {
  it('limites aprovados: IA 30/100/300, conexões 1/3/6', () => {
    expect(LIMITES_PLANO.ia).toEqual({ basic: 30, pro: 100, adv: 300 });
    expect(LIMITES_PLANO.conexoes).toEqual({ basic: 1, pro: 3, adv: 6 });
  });

  it('a matriz exibe os mesmos limites', () => {
    const linhas = MATRIZ_EXIBICAO.grupos.flatMap((g) => g.linhas);
    const conexoes = linhas.find((l) => l.recurso.startsWith('Conexões bancárias'))!;
    const ia = linhas.find((l) => l.recurso.startsWith('Assistente de IA'))!;
    for (const p of PLANOS) {
      expect(conexoes[p]).toBe(String(LIMITES_PLANO.conexoes[p]));
      expect(ia[p]).toBe(String(LIMITES_PLANO.ia[p]));
    }
  });

  it('todo plano tem cartão com pelo menos 3 itens (cadeado usa os 3 primeiros)', () => {
    for (const p of PLANOS) {
      expect(MATRIZ_EXIBICAO.cartoes[p].itens.length).toBeGreaterThanOrEqual(3);
    }
    expect(MATRIZ_EXIBICAO.cartoes.basic.base).toBeUndefined();
    expect(MATRIZ_EXIBICAO.cartoes.pro.base).toBe('Tudo do Basic, mais:');
  });

  it('nenhuma linha libera no plano menor o que nega no maior', () => {
    const rank = (c: boolean | string) => (c === false ? 0 : 1);
    for (const l of MATRIZ_EXIBICAO.grupos.flatMap((g) => g.linhas)) {
      expect(rank(l.basic)).toBeLessThanOrEqual(rank(l.pro));
      expect(rank(l.pro)).toBeLessThanOrEqual(rank(l.adv));
    }
  });
});
