import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ALIASES_SUBCATEGORIA,
  CATEGORIAS_ORCAMENTO,
  NOME_GERAL,
  SUBCATEGORIAS_SUGERIDAS,
  abreviacaoCategoria,
  categoriaDoCatalogo,
  ehCategoriaPoupanca,
  fixaPadrao,
  iconePadraoCategoria,
  nomeCanonicoSubcategoria,
  normalizarNome,
  sugestoesFaltantes,
} from '../catalogo';

/** Fonte dos grupos/itens-template do Fluxo (lida como texto: o módulo importa o Prisma). */
const TEMPLATES = readFileSync(join(process.cwd(), 'src/utils/cashflowTemplates.ts'), 'utf8');
const temItemTemplate = (nome: string) =>
  TEMPLATES.includes(`{ name: '${nome}' }`) || TEMPLATES.includes(`  '${nome}',`);

describe('catálogo do Orçamento v2 (Anexo A)', () => {
  it('tem 13 categorias e 82 subcategorias, cada categoria com uma Geral no fim', () => {
    expect(CATEGORIAS_ORCAMENTO).toHaveLength(13);
    expect(CATEGORIAS_ORCAMENTO.flatMap((c) => c.subcategorias)).toHaveLength(82);
    for (const c of CATEGORIAS_ORCAMENTO) {
      expect(c.subcategorias.filter((s) => s.nome === NOME_GERAL)).toHaveLength(1);
      expect(c.subcategorias.at(-1)?.nome).toBe(NOME_GERAL);
    }
  });

  it('usa os nomes exatos do Anexo A', () => {
    const habitacao = categoriaDoCatalogo('Habitação');
    expect(habitacao?.subcategorias.map((s) => s.nome)).toEqual([
      'Aluguel / Financiamento',
      'Condomínio',
      'Energia',
      'Água',
      'Gás',
      'Internet / TV',
      'Mercado',
      'Diarista',
      'Geral',
    ]);
    expect(categoriaDoCatalogo('Despesas Variáveis')?.subcategorias.map((s) => s.nome)).toContain(
      'Anuidades (OAB, CRM, CRP…)',
    );
    expect(categoriaDoCatalogo('Impostos')?.subcategorias.map((s) => s.nome)).toContain(
      'IR (provisão do ajuste anual)',
    );
  });

  it('marca as 33 fixas do protótipo fora de Planejamento', () => {
    const fixas = CATEGORIAS_ORCAMENTO.filter((c) => !c.poupanca).flatMap((c) =>
      c.subcategorias.filter((s) => s.fixa).map((s) => s.nome),
    );
    expect(fixas).toHaveLength(33);
    expect(fixas).toEqual(expect.arrayContaining(['Seguro', 'Livros / Revistas', 'Mesada']));
    expect(fixas).not.toContain('Mercado');
  });

  it('não repete nome de subcategoria com fixa diferente entre categorias', () => {
    const porNome = new Map<string, boolean>();
    for (const c of CATEGORIAS_ORCAMENTO.filter((x) => !x.poupanca)) {
      for (const s of c.subcategorias) {
        const chave = normalizarNome(s.nome);
        if (porNome.has(chave)) expect(porNome.get(chave)).toBe(s.fixa);
        porNome.set(chave, s.fixa);
      }
    }
  });

  it('não fornece nome de exibição (D11)', () => {
    for (const c of CATEGORIAS_ORCAMENTO) {
      expect(Object.keys(c).sort()).toEqual(
        ['abreviacao', 'icone', 'nomeCanonico', 'poupanca', 'subcategorias'].sort(),
      );
    }
  });

  it('as chaves canônicas são os grupos-template do Fluxo', () => {
    for (const c of CATEGORIAS_ORCAMENTO) {
      expect(TEMPLATES).toContain(`name: '${c.nomeCanonico}'`);
    }
  });
});

describe('normalização e casamento com o Fluxo', () => {
  it('normaliza acento, caixa, espaços e barra', () => {
    expect(normalizarNome('  Empregados/ Diaristas ')).toBe('empregados / diaristas');
    expect(normalizarNome('Água')).toBe('agua');
    expect(normalizarNome('Uber  /99')).toBe('uber / 99');
  });

  it('casa o nome do Anexo A com o do template, e o nome antigo "Dívidas"', () => {
    expect(categoriaDoCatalogo('Animais de estimação')?.nomeCanonico).toBe('Animais de Estimação');
    expect(categoriaDoCatalogo('despesas com dependentes')?.nomeCanonico).toBe(
      'Despesas com Dependentes',
    );
    expect(categoriaDoCatalogo('Dívidas')?.nomeCanonico).toBe('Despesas Financeiras');
    expect(categoriaDoCatalogo('Minha categoria')).toBeNull();
    expect(categoriaDoCatalogo('Investimentos')).toBeNull();
  });

  it('dá abreviação, ícone e poupança, com fallback para categoria do usuário', () => {
    expect(abreviacaoCategoria('Animais de Estimação')).toBe('Pets');
    expect(abreviacaoCategoria('Despesas Variáveis')).toBe('Variáveis');
    expect(abreviacaoCategoria('Habitação')).toBe('Habitação');
    expect(abreviacaoCategoria('Viagens')).toBe('Viagens');
    expect(iconePadraoCategoria('Transporte')).toBe('carro');
    expect(iconePadraoCategoria('Viagens')).toBe('tag');
    expect(ehCategoriaPoupanca('Planejamento Financeiro')).toBe(true);
    expect(ehCategoriaPoupanca('Habitação')).toBe(false);
    expect(CATEGORIAS_ORCAMENTO.filter((c) => c.poupanca)).toHaveLength(1);
  });

  it('todo alias parte de um item-template real e chega numa subcategoria do Anexo A', () => {
    const anexo = new Set(
      CATEGORIAS_ORCAMENTO.flatMap((c) => c.subcategorias.map((s) => normalizarNome(s.nome))),
    );
    for (const [de, para] of Object.entries(ALIASES_SUBCATEGORIA)) {
      expect(temItemTemplate(de), de).toBe(true);
      expect(anexo.has(normalizarNome(para)), para).toBe(true);
    }
  });

  it('aplica o alias no nome canônico da subcategoria', () => {
    expect(nomeCanonicoSubcategoria('Supermercado')).toBe('mercado');
    expect(nomeCanonicoSubcategoria('Escola / Faculdade')).toBe('escola');
    expect(nomeCanonicoSubcategoria('Plano de Saúde')).toBe('plano de saude');
    expect(nomeCanonicoSubcategoria('Pneu')).toBe('pneu');
  });
});

describe('fixaPadrao', () => {
  it('segue o Anexo A pelo nome cru, com aliases', () => {
    expect(fixaPadrao('Condomínio')).toBe(true);
    expect(fixaPadrao('condominio')).toBe(true);
    expect(fixaPadrao('Aluguel / Prestação')).toBe(true);
    expect(fixaPadrao('Plano de Saúde')).toBe(true);
    expect(fixaPadrao('Mercado')).toBe(false);
    expect(fixaPadrao('Supermercado')).toBe(false);
    expect(fixaPadrao('Pneu')).toBe(false);
    expect(fixaPadrao('Geral', 'Habitação')).toBe(false);
  });

  it('Planejamento Financeiro é sempre fixa, inclusive a Geral e itens dos Sonhos', () => {
    expect(fixaPadrao('Viagem para Lisboa', 'Planejamento Financeiro')).toBe(true);
    expect(fixaPadrao('Geral', 'Planejamento Financeiro')).toBe(true);
    expect(fixaPadrao('Viagem para Lisboa', 'Lazer')).toBe(false);
  });
});

describe('sugestões (P4)', () => {
  it('Planejamento Financeiro só recebe a Reserva de emergência e nenhuma categoria sugere a Geral', () => {
    expect(SUBCATEGORIAS_SUGERIDAS['Planejamento Financeiro'].map((s) => s.nome)).toEqual([
      'Reserva de emergência',
    ]);
    expect(sugestoesFaltantes('Planejamento Financeiro', ['Reserva de Emergencia'])).toEqual([]);
    for (const lista of Object.values(SUBCATEGORIAS_SUGERIDAS)) {
      expect(lista.map((s) => s.nome)).not.toContain(NOME_GERAL);
    }
    // 82 − 13 Gerais − 3 objetivos ilustrativos de Planejamento
    expect(Object.values(SUBCATEGORIAS_SUGERIDAS).flat()).toHaveLength(66);
  });

  it('não sugere o que a categoria já tem (pelo nome normalizado ou alias)', () => {
    const faltantes = sugestoesFaltantes('Habitação', [
      'Aluguel / Prestação',
      'condominio',
      'Conta de energia',
      'Supermercado',
      'Empregados/ Diaristas',
      'Geral',
    ]).map((s) => s.nome);
    expect(faltantes).toEqual(['Água', 'Gás', 'Internet / TV']);
  });

  it('não sugere o que outra categoria já tem por alias que cruza categoria', () => {
    const nomes = (cat: string, outras: string[]) =>
      sugestoesFaltantes(cat, [], outras).map((s) => s.nome);
    expect(nomes('Impostos', ['IPTU + Taxas Municipais'])).not.toContain('IPTU');
    expect(nomes('Despesas Pessoais', ['Telefones celulares'])).not.toContain('Celular');
    expect(nomes('Despesas Financeiras', ['Seguro Vida'])).not.toContain('Seguro de vida');
    expect(nomes('Despesas com Dependentes', ['Escola/Faculdade'])).not.toContain('Escola');
    // sem os nomes de fora, a sugestão aparece (o chamador precisa passá-los)
    expect(nomes('Impostos', [])).toContain('IPTU');
    expect(nomes('Despesas Pessoais', [])).toContain('Celular');
    expect(nomes('Despesas Financeiras', [])).toContain('Seguro de vida');
    expect(nomes('Despesas com Dependentes', [])).toContain('Escola');
  });

  it('casa a categoria pelo nome do Anexo A e ignora categoria do usuário', () => {
    expect(sugestoesFaltantes('Animais de estimação', ['Ração']).map((s) => s.nome)).toEqual([
      'Veterinário',
      'Banho e tosa',
      'Plano pet',
    ]);
    expect(sugestoesFaltantes('Minha categoria', [])).toEqual([]);
  });
});
