import { describe, expect, it } from 'vitest';
import { encontrarProibidasV2 } from '@/services/analiseAtivos/regras/comum/linguagemV2';
import { GRUPOS_ACAO, GRUPOS_FII, ehMisto, tipoDoAtivo } from '../indicadores';

const todas = [...GRUPOS_ACAO, ...GRUPOS_FII].flatMap((g) => g.linhas);

describe('catálogo do Comparador (v2.4, isonômico)', () => {
  it('todo código tem rótulo e extrator; nenhuma direção nem marca de valor', () => {
    for (const l of todas) {
      expect(l.rotulo.length).toBeGreaterThan(0);
      expect(typeof l.extrator).toBe('function');
      expect(Object.keys(l).join(' ')).not.toMatch(/direcao|destaque|semValidacao|indice/i);
    }
  });

  it('nenhum rótulo/sub/grupo com palavra proibida (linguagemV2)', () => {
    for (const g of [...GRUPOS_ACAO, ...GRUPOS_FII]) {
      expect(encontrarProibidasV2(g.rotulo)).toEqual([]);
      expect(encontrarProibidasV2(g.rotuloMisto ?? '')).toEqual([]);
      for (const l of g.linhas) {
        expect(encontrarProibidasV2(`${l.rotulo} ${l.sub ?? ''}`)).toEqual([]);
      }
    }
  });

  it('grupos de ações: Qualidade · Endividamento · Preço · Dividendos', () => {
    expect(GRUPOS_ACAO.map((g) => g.rotulo)).toEqual([
      'Qualidade',
      'Endividamento',
      'Preço',
      'Dividendos',
    ]);
  });

  it('grupos de FII: Renda · Preço · Endividamento (comum) · imóveis (tijolo) · ativos (papel) · Tamanho', () => {
    expect(GRUPOS_FII.map((g) => g.codigo)).toEqual([
      'renda',
      'preco',
      'endividamento',
      'imoveis',
      'ativosPapel',
      'tamanhoLiquidez',
    ]);
    const endiv = GRUPOS_FII.find((g) => g.codigo === 'endividamento')!;
    expect(endiv.rotulo).toBe('Endividamento · fonte CVM');
    expect(endiv.aplicavelA).toEqual(['tijolo', 'papel']);
    expect(endiv.linhas.map((l) => l.rotulo)).toEqual(['Obrigações/PL']);
    const imoveis = GRUPOS_FII.find((g) => g.codigo === 'imoveis')!;
    expect(imoveis.linhas.map((l) => l.rotulo)).toEqual([
      'Vacância física (CVM)',
      'Nº de imóveis (CVM)',
      'Área (CVM)',
    ]);
    expect(imoveis.rotuloMisto).toContain('(tijolo)');
    // vacância da CVM com selo de fonte (pode diferir do gestor, D3)
    expect(imoveis.linhas[0].fonteCvmAviso).toBe(true);
    const papel = GRUPOS_FII.find((g) => g.codigo === 'ativosPapel')!;
    expect(papel.linhas.map((l) => l.rotulo)).toEqual(['Nº de CRIs (CVM)']);
    expect(papel.rotuloMisto).toContain('(papel)');
  });

  it('misto: cada linha de tipo só se aplica ao próprio tipo', () => {
    const porCodigo = (c: string) => todas.find((l) => l.codigo === c)!;
    expect(porCodigo('nImoveis').aplicavel('papel')).toBe(false);
    expect(porCodigo('nImoveis').aplicavel('tijolo')).toBe(true);
    expect(porCodigo('nCri').aplicavel('tijolo')).toBe(false);
    expect(porCodigo('nCri').aplicavel('papel')).toBe(true);
    expect(porCodigo('obrigacoesPl').aplicavel('papel')).toBe(true);
    expect(porCodigo('obrigacoesPl').aplicavel('tijolo')).toBe(true);
  });

  it('nenhum dado sem fonte (inadimplência, prazo, ABL, LTV) no catálogo', () => {
    const codigos = todas.map((l) => l.codigo as string);
    for (const c of ['inadimplencia', 'prazoMedio', 'abl', 'ltv', 'duration', 'taxaAdm']) {
      expect(codigos).not.toContain(c);
    }
  });

  it('tipo do ativo: perfil de critérios primeiro, depois a régua, depois o rótulo', () => {
    const fii = (fiiTipo: 'tijolo' | 'papel' | 'hibrido' | 'fof' | 'indefinido') => ({
      classe: 'fii' as const,
      fiiTipo,
    });
    expect(tipoDoAtivo({ classe: 'acao', fiiTipo: null }, null)).toBe('acao');
    // FoF com imóveis ≥ 50% do PL avaliado como tijolo (rec. 3): o perfil manda, não o rótulo
    expect(tipoDoAtivo(fii('fof'), { perfil: 'fii_tijolo' })).toBe('tijolo');
    expect(tipoDoAtivo(fii('tijolo'), { perfil: 'fii_papel' })).toBe('papel');
    expect(tipoDoAtivo(fii('hibrido'), null, 'fii_papel')).toBe('papel');
    expect(tipoDoAtivo(fii('hibrido'), null)).toBe('tijolo');
    expect(tipoDoAtivo(fii('fof'), null)).toBe('papel');
    expect(tipoDoAtivo(fii('indefinido'), null)).toBe('papel');
  });

  it('misto = tijolo com papel (pelo perfil)', () => {
    expect(ehMisto(['tijolo', 'papel'])).toBe(true);
    expect(ehMisto(['tijolo', 'tijolo'])).toBe(false);
    expect(ehMisto(['papel'])).toBe(false);
  });
});
