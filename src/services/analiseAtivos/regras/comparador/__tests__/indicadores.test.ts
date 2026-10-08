import { describe, expect, it } from 'vitest';
import { encontrarPalavrasProibidasBlocoD } from '@/services/analiseAtivos/regras/comum/varreduraTextos';
import { GRUPOS_ACAO, GRUPOS_FII, direcaoPvpFii, ehMisto } from '../indicadores';

const todas = [...GRUPOS_ACAO, ...GRUPOS_FII].flatMap((g) => g.linhas);

describe('catálogo do Comparador', () => {
  it('todo código tem rótulo, direção e extrator', () => {
    for (const l of todas) {
      expect(l.rotulo.length).toBeGreaterThan(0);
      expect(['maior', 'menor', 'menor_positivo', 'perto_de_1', 'neutro']).toContain(l.direcao);
      expect(typeof l.extrator).toBe('function');
    }
  });

  it('nenhum texto com palavra proibida', () => {
    for (const g of [...GRUPOS_ACAO, ...GRUPOS_FII]) {
      expect(encontrarPalavrasProibidasBlocoD(g.rotulo)).toEqual([]);
      for (const l of g.linhas) {
        expect(encontrarPalavrasProibidasBlocoD(`${l.rotulo} ${l.sub ?? ''}`)).toEqual([]);
      }
    }
  });

  it('decisões: payout neutro; imóveis da CVM sem ★ com fonte CVM; CRIs provisórios', () => {
    const porCodigo = (c: string) => todas.filter((l) => l.codigo === c);
    expect(porCodigo('payout')[0].direcao).toBe('neutro');
    for (const c of ['nImoveis', 'areaInformada', 'vacanciaFisica']) {
      const l = porCodigo(c)[0];
      expect(l.semValidacaoCvm).toBe(true);
      expect(l.fonteCvmAviso).toBe(true);
    }
    for (const c of ['nCri', 'maiorCri']) {
      const l = porCodigo(c)[0];
      expect(l.criterioProvisorio).toBe(true);
      expect(l.fonteCvmAviso).toBe(true);
    }
    expect(porCodigo('nCri')[0].direcao).toBe('maior');
    expect(porCodigo('maiorCri')[0].direcao).toBe('menor');
    expect(porCodigo('pl')[0].direcao).toBe('menor_positivo');
  });

  it('nenhum dado sem fonte (inadimplência, prazo, ABL, LTV) no catálogo', () => {
    const codigos = todas.map((l) => l.codigo as string);
    for (const c of ['inadimplencia', 'prazoMedio', 'abl', 'ltv', 'duration', 'taxaAdm']) {
      expect(codigos).not.toContain(c);
    }
  });

  it('P/VP do FII por tipo', () => {
    expect(direcaoPvpFii(['tijolo', 'tijolo'])).toEqual({
      direcao: 'menor',
      tiposDiferentes: false,
    });
    expect(direcaoPvpFii(['papel', 'papel'])).toEqual({
      direcao: 'perto_de_1',
      tiposDiferentes: false,
    });
    expect(direcaoPvpFii(['tijolo', 'papel']).tiposDiferentes).toBe(true);
  });

  it('misto = tijolo (ou híbrido) com papel', () => {
    expect(ehMisto(['tijolo', 'papel'])).toBe(true);
    expect(ehMisto(['hibrido', 'papel'])).toBe(true);
    expect(ehMisto(['tijolo', 'fof'])).toBe(false);
  });
});
