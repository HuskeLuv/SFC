import { describe, expect, it } from 'vitest';
import { ACESSO_BLOCOS, aplicarCadeado, ofertaVigente, temAcesso } from '../planos';
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
