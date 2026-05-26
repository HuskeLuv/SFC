import { describe, it, expect } from 'vitest';
import { inferFundType } from '../cvmFundSync';

describe('inferFundType', () => {
  describe('FIDC (Fundos de Investimento em Direitos Creditórios)', () => {
    it('classifica por Tipo_Fundo=FIDC', () => {
      expect(
        inferFundType({
          tipoFundo: 'FIDC',
          classificacao: '',
          name: 'BTG PACTUAL CREDITO CORPORATIVO FIDC',
        }),
      ).toBe('fidc');
    });

    it('classifica por Classificacao=FIDC mesmo com Tipo_Fundo=FI', () => {
      expect(
        inferFundType({
          tipoFundo: 'FI',
          classificacao: 'FIDC',
          name: 'Itaú Recebíveis',
        }),
      ).toBe('fidc');
    });

    it('classifica FIDC-NP (não-padronizado) como fidc', () => {
      expect(
        inferFundType({
          tipoFundo: 'FIDC',
          classificacao: 'FIDC-NP',
          name: 'XP Recebíveis NP',
        }),
      ).toBe('fidc');
    });
  });

  describe('FIP (Fundos de Investimento em Participações)', () => {
    it('classifica por Tipo_Fundo=FIP', () => {
      expect(inferFundType({ tipoFundo: 'FIP', name: 'BTG Pactual FIP' })).toBe('fip');
    });

    it('classifica FIP IE (Infraestrutura Lei 12.431) com type diferenciado', () => {
      expect(
        inferFundType({
          tipoFundo: 'FIP',
          classificacao: 'FIP IE',
          name: 'BTG Pactual Infraestrutura Dividendos',
        }),
      ).toBe('fip-infra');
    });

    it('classifica como fip-infra quando o nome menciona infraestrutura', () => {
      expect(
        inferFundType({
          tipoFundo: 'FIP',
          name: 'BTG Pactual FIP em Infraestrutura',
        }),
      ).toBe('fip-infra');
    });

    it('classifica FMIEE (Empresas Emergentes) como fip', () => {
      expect(inferFundType({ tipoFundo: 'FMIEE', name: 'BB FMIEE' })).toBe('fip');
    });
  });

  describe('FII (Fundos Imobiliários)', () => {
    it('classifica por Tipo_Fundo=FII', () => {
      expect(inferFundType({ tipoFundo: 'FII', name: 'KINEA RENDIMENTOS IMOBILIARIOS' })).toBe(
        'fii',
      );
    });

    it('classifica por nome contendo "imobili" quando Tipo_Fundo vem vazio (legacy)', () => {
      expect(
        inferFundType({
          tipoFundo: '',
          classificacao: '',
          name: 'XP Selection Fundo de Investimento Imobiliario',
        }),
      ).toBe('fii');
    });
  });

  describe('Fiagro (Fundos do Agronegócio)', () => {
    it('classifica por Tipo_Fundo=FIAGRO', () => {
      expect(inferFundType({ tipoFundo: 'FIAGRO', name: 'BTG Pactual Fiagro' })).toBe('fiagro');
    });

    it('classifica como fiagro mesmo quando estruturado como FII', () => {
      expect(
        inferFundType({
          tipoFundo: 'FII',
          classificacao: 'FII-FIAGRO',
          name: 'Riza Akin Fiagro',
        }),
      ).toBe('fiagro');
    });

    it('classifica como fiagro mesmo quando estruturado como FIDC', () => {
      expect(
        inferFundType({
          tipoFundo: 'FIDC',
          classificacao: 'FIDCFIAGRO',
          name: 'BTG Credito Agricola Fiagro',
        }),
      ).toBe('fiagro');
    });

    it('classifica como fiagro quando o nome contém "FIAGRO" sem Tipo_Fundo específico', () => {
      expect(
        inferFundType({
          tipoFundo: 'FI',
          name: 'XP Agro Fiagro Renda Fixa',
        }),
      ).toBe('fiagro');
    });
  });

  describe('FIIM (ETFs CVM)', () => {
    it('classifica Tipo_Fundo=FIIM como etf-cvm', () => {
      expect(inferFundType({ tipoFundo: 'FIIM', name: 'IT NOW Ibovespa' })).toBe('etf-cvm');
    });
  });

  describe('Previdência', () => {
    it('classifica PGBL/VGBL/Previdência pelo nome', () => {
      expect(inferFundType({ tipoFundo: 'FI', name: 'Itaú PGBL Conservador' })).toBe('previdencia');
      expect(inferFundType({ tipoFundo: 'FI', name: 'BB VGBL Multi' })).toBe('previdencia');
      expect(inferFundType({ tipoFundo: 'FI', name: 'XP Previdência Plus' })).toBe('previdencia');
    });
  });

  describe('FI/FIF/FACFIF classificados pela coluna Classificacao', () => {
    it('classifica Classificacao=Multimercado como multimercado', () => {
      expect(
        inferFundType({
          tipoFundo: 'FI',
          classificacao: 'Multimercado',
          name: 'Verde AM Macro',
        }),
      ).toBe('multimercado');
    });

    it('classifica Classificacao=Renda Fixa como fund-rf', () => {
      expect(
        inferFundType({
          tipoFundo: 'FI',
          classificacao: 'Renda Fixa',
          name: 'Itaú DI',
        }),
      ).toBe('fund-rf');
    });

    it('classifica Classificacao=Ações como fia', () => {
      expect(
        inferFundType({
          tipoFundo: 'FI',
          classificacao: 'Ações',
          name: 'Dynamo Cougar',
        }),
      ).toBe('fia');
    });

    it('classifica Tipo_Fundo=FITVM (legacy) como fia', () => {
      expect(inferFundType({ tipoFundo: 'FITVM', name: 'FITVM Genérico' })).toBe('fia');
    });

    it('classifica Classificacao=Cambial como fund-cambial', () => {
      expect(
        inferFundType({
          tipoFundo: 'FI',
          classificacao: 'Cambial',
          name: 'BB Cambial Dólar',
        }),
      ).toBe('fund-cambial');
    });

    it('classifica Referenciado/Curto Prazo como fund-rf', () => {
      expect(inferFundType({ classificacao: 'Referenciado', name: 'XP Cash' })).toBe('fund-rf');
      expect(inferFundType({ classificacao: 'Curto Prazo', name: 'BB CP' })).toBe('fund-rf');
    });
  });

  describe('Fallback', () => {
    it('cai em "fund" quando não há sinal claro', () => {
      expect(inferFundType({ tipoFundo: 'FI', name: 'Fundo Genérico LTDA' })).toBe('fund');
      expect(inferFundType({})).toBe('fund');
    });
  });

  describe('Tolerância a casos do mundo real', () => {
    it('é case-insensitive', () => {
      expect(inferFundType({ tipoFundo: 'fidc', classificacao: 'fidc', name: 'qualquer' })).toBe(
        'fidc',
      );
    });

    it('tolera espaços extras', () => {
      expect(inferFundType({ tipoFundo: '  FIP  ', name: '   FIP Genérico   ' })).toBe('fip');
    });

    it('prioriza estruturas legais sobre Classificacao genérica', () => {
      // Mesmo com Classificacao=Multimercado, se Tipo_Fundo=FIDC, é FIDC.
      expect(
        inferFundType({
          tipoFundo: 'FIDC',
          classificacao: 'Multimercado',
          name: 'BTG FIDC Multi',
        }),
      ).toBe('fidc');
    });
  });
});
