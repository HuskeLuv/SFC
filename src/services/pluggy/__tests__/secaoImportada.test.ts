import { describe, expect, it } from 'vitest';
import { tipoAssetFundoPluggy, tipoFiiDoTipoVigente, tipoFiiPeloNome } from '../secaoImportada';

describe('secaoImportada', () => {
  it('tipo vigente da CVM → seção da aba FIIs', () => {
    expect(tipoFiiDoTipoVigente('tijolo')).toBe('tijolo');
    expect(tipoFiiDoTipoVigente('hibrido')).toBe('tijolo');
    expect(tipoFiiDoTipoVigente('papel')).toBe('tvm');
    expect(tipoFiiDoTipoVigente('fof')).toBe('fofi');
    expect(tipoFiiDoTipoVigente('indefinido')).toBeNull();
    expect(tipoFiiDoTipoVigente(null)).toBeNull();
  });

  it('nome do fundo → seção quando o catálogo não classifica', () => {
    expect(tipoFiiPeloNome('Capitania Infra FIC FI Infra RF CP')).toBe('infra');
    expect(
      tipoFiiPeloNome('Inter Infra Fundo de Investimento em Cotas de Fundos Incentivados'),
    ).toBe('infra');
    expect(
      tipoFiiPeloNome(
        'Patria Credito Imobiliario Indice de Precos Fundo de Investimento Imobiliario',
      ),
    ).toBe('tvm');
    expect(tipoFiiPeloNome('Kinea Fundo de Fundos FII')).toBe('fofi');
    expect(tipoFiiPeloNome('Iridium Fundo de Investimento Imobiliario')).toBeNull();
    expect(tipoFiiPeloNome(null)).toBeNull();
  });

  it('subtipo de fundo do Pluggy → Asset.type da aba Fundos', () => {
    expect(tipoAssetFundoPluggy('FIXED_INCOME_FUND')).toBe('fund-rf');
    expect(tipoAssetFundoPluggy('STOCK_FUND')).toBe('fia');
    expect(tipoAssetFundoPluggy('MULTIMARKET_FUND')).toBe('multimercado');
    expect(tipoAssetFundoPluggy('EXCHANGE_FUND')).toBe('fund-cambial');
    expect(tipoAssetFundoPluggy('INVESTMENT_FUND')).toBe('fund');
    expect(tipoAssetFundoPluggy(null)).toBe('fund');
  });
});
