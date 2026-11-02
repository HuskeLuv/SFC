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
import { LINHAS_PADRAO } from '@/lib/cashflow/linhasPadrao';

/** Fonte dos grupos-template do Fluxo (lida como texto: o módulo importa o Prisma). */
const TEMPLATES = readFileSync(join(process.cwd(), 'src/utils/cashflowTemplates.ts'), 'utf8');

describe('catálogo do Orçamento v2 (linhas padrão do Fluxo)', () => {
  it('tem 13 categorias, cada uma com uma Geral no fim', () => {
    expect(CATEGORIAS_ORCAMENTO).toHaveLength(13);
    for (const c of CATEGORIAS_ORCAMENTO) {
      expect(c.subcategorias.filter((s) => s.nome === NOME_GERAL)).toHaveLength(1);
      expect(c.subcategorias.at(-1)?.nome).toBe(NOME_GERAL);
    }
  });

  it('as subcategorias são as linhas padrão do grupo, na ordem da planilha', () => {
    for (const c of CATEGORIAS_ORCAMENTO.filter((x) => !x.poupanca)) {
      expect(c.subcategorias.map((s) => s.nome)).toEqual([
        ...(LINHAS_PADRAO[c.nomeCanonico] ?? []).map((l) => l.name),
        NOME_GERAL,
      ]);
    }
    expect(categoriaDoCatalogo('Despesas Variáveis')?.subcategorias.map((s) => s.nome)).toContain(
      'Conselho Profissional',
    );
  });

  it('marca as fixas: contas e mensalidades sim, consumo não', () => {
    const fixas = CATEGORIAS_ORCAMENTO.filter((c) => !c.poupanca).flatMap((c) =>
      c.subcategorias.filter((s) => s.fixa).map((s) => s.nome),
    );
    expect(fixas).toEqual(
      expect.arrayContaining([
        'Condomínio',
        'Seguro Carro',
        'Livros, jornais e revistas',
        'Pensão',
      ]),
    );
    expect(fixas).not.toContain('Supermercado');
    expect(fixas).not.toContain('Outros');
    expect(fixas).not.toContain(NOME_GERAL);
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

  it('casa o nome da categoria sem acento/caixa, e o nome antigo "Dívidas"', () => {
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

  it('todo alias chega numa subcategoria do catálogo e não parte de uma', () => {
    const catalogo = new Set(
      CATEGORIAS_ORCAMENTO.flatMap((c) => c.subcategorias.map((s) => normalizarNome(s.nome))),
    );
    for (const [de, para] of Object.entries(ALIASES_SUBCATEGORIA)) {
      expect(catalogo.has(normalizarNome(para)), para).toBe(true);
      expect(catalogo.has(normalizarNome(de)), de).toBe(false);
    }
  });

  it('aplica o alias no nome canônico da subcategoria (nomes antigos → linha padrão)', () => {
    expect(nomeCanonicoSubcategoria('Mercado')).toBe('supermercado');
    expect(nomeCanonicoSubcategoria('Uber')).toBe('uber / taxi');
    expect(nomeCanonicoSubcategoria('Roupas')).toBe('vestuario');
    expect(nomeCanonicoSubcategoria('Escola/Faculdade')).toBe('escola / faculdade');
    expect(nomeCanonicoSubcategoria('Metro')).toBe('metro');
    expect(nomeCanonicoSubcategoria('Plano de Saúde')).toBe('plano de saude');
    expect(nomeCanonicoSubcategoria('Pneu')).toBe('pneu');
  });
});

describe('fixaPadrao', () => {
  it('segue o catálogo pelo nome cru, com aliases', () => {
    expect(fixaPadrao('Condomínio')).toBe(true);
    expect(fixaPadrao('condominio')).toBe(true);
    expect(fixaPadrao('Aluguel / Prestação')).toBe(true);
    expect(fixaPadrao('Plano de Saúde')).toBe(true);
    expect(fixaPadrao('Mercado')).toBe(false);
    expect(fixaPadrao('Supermercado')).toBe(false);
    expect(fixaPadrao('Pneu')).toBe(false);
    expect(fixaPadrao('Geral', 'Habitação')).toBe(false);
  });

  it('mantém a fixa de linhas antigas sem equivalente (template e catálogo de antes de 11/2026)', () => {
    expect(fixaPadrao('Energia')).toBe(true);
    expect(fixaPadrao('Telefones celulares')).toBe(true);
    expect(fixaPadrao('Plano pet')).toBe(true);
    expect(fixaPadrao('Mesada')).toBe(true);
    expect(fixaPadrao('IRPF')).toBe(true);
    expect(fixaPadrao('Juros / IOF')).toBe(false);
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
  });

  it('quem tem as linhas padrão não recebe sugestão nenhuma (o Fluxo não ganha linha paralela)', () => {
    for (const c of CATEGORIAS_ORCAMENTO.filter((x) => !x.poupanca)) {
      const linhas = (LINHAS_PADRAO[c.nomeCanonico] ?? []).map((l) => l.name);
      expect(sugestoesFaltantes(c.nomeCanonico, [...linhas, NOME_GERAL]), c.nomeCanonico).toEqual(
        [],
      );
    }
  });

  it('não sugere o que a categoria já tem (pelo nome normalizado ou alias)', () => {
    const faltantes = sugestoesFaltantes('Animais de Estimação', [
      'veterinario',
      'Ração',
      'Geral',
    ]).map((s) => s.nome);
    expect(faltantes).toEqual(['Exames e Medicamentos', 'Hospedagem', 'Outros']);
    expect(
      sugestoesFaltantes('Habitação', ['Energia', 'Mercado', 'Empregados/ Diaristas']).map(
        (s) => s.nome,
      ),
    ).not.toEqual(
      expect.arrayContaining(['Conta de energia', 'Supermercado', 'Empregados / Diaristas']),
    );
  });

  it('linha de outra categoria cobre a sugestão, menos os nomes que existem em várias', () => {
    const nomes = (cat: string, outras: string[]) =>
      sugestoesFaltantes(cat, [], outras).map((s) => s.nome);
    expect(nomes('Despesas Pessoais', ['Telefones celulares'])).not.toContain('Celular');
    expect(nomes('Despesas com Dependentes', ['Escola/Faculdade'])).not.toContain(
      'Escola / Faculdade',
    );
    expect(nomes('Habitação', ['IPTU'])).not.toContain('IPTU + Taxas Municipais');
    // "Outros", "Cursos" e "Vestuário" estão em várias categorias: faltam onde não estão
    expect(nomes('Despesas com Dependentes', ['Outros', 'Cursos', 'Vestuário'])).toEqual(
      expect.arrayContaining(['Outros', 'Cursos', 'Vestuário']),
    );
    // sem os nomes de fora, a sugestão aparece (o chamador precisa passá-los)
    expect(nomes('Despesas Pessoais', [])).toContain('Celular');
  });

  it('casa a categoria sem acento/caixa e ignora categoria do usuário', () => {
    expect(sugestoesFaltantes('animais de estimacao', ['Ração']).map((s) => s.nome)).toEqual([
      'Veterinário',
      'Exames e Medicamentos',
      'Hospedagem',
      'Outros',
    ]);
    expect(sugestoesFaltantes('Minha categoria', [])).toEqual([]);
  });
});
