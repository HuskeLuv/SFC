import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }));

import { formatarRelatorio, lerOpcoes as lerAtivar } from '../ativar';
import { formatarPlano, lerOpcoes as lerDesativar } from '../desativar';
import { formatarRelatorioDump, linhaDoPlano } from '../relatorio-dump';
import type { PlanoAtivacao, RelatorioAtivacao } from '@/services/cashflow/orcamentoV2/ativacao';

const plano: PlanoAtivacao = {
  userId: 'u1',
  jaAtivado: false,
  totalCategorias: 4,
  categoriasAPersonalizar: [{ templateGroupId: 't1', nome: 'Nome Pessoal da Categoria' }],
  geraisACriar: [{ groupId: 'g1', nome: 'Nome Pessoal da Categoria', aposPersonalizar: false }],
  geraisAdotadas: [],
  orcadosAInserir: Array.from({ length: 12 }, (_, mes) => ({
    categoriaChave: 't1',
    ano: 2026,
    mes,
    valor: 1234.56,
  })),
  orcadosIgnorados: [
    { linhaId: 'l1', motivo: 'duplicada' },
    { linhaId: 'l2', motivo: 'grupo_oculto' },
    { linhaId: 'l3', motivo: 'duplicada' },
  ],
  orfasAdotaveis: [
    { linhaId: 'l4', categoriaId: 'g1', ano: 2026, valor: 300, tipoMeta: 'valor', meses: [] },
  ],
  metasDeSubgrupo: [{ linhaId: 'l5', categoriaChave: 't1', ano: 2026, total: 3600 }],
  mesesSemReceita: [],
  valoresEmItemTemplate: 0,
  orcadosV2Existentes: 0,
  itensSoltos: [{ itemId: 'i1', nome: 'Item Pessoal Solto', total: 999.99 }],
  usuarioNovo: false,
  sugestoesAAplicar: 0,
  sugestoes: [],
};

const relatorio = (extra: Partial<RelatorioAtivacao> = {}): RelatorioAtivacao => ({
  userId: 'u1',
  status: 'planejado',
  dryRun: true,
  motivo: null,
  plano,
  mudancas: {
    gruposPersonalizados: 0,
    ocultosPreservados: 0,
    geraisCriadas: 0,
    geraisAdotadas: 0,
    orcadosInseridos: 0,
    sugestoesCriadas: 0,
    prefsGravado: false,
  },
  divergencias: [],
  ...extra,
});

const semDadoPessoal = (linhas: string[]) => {
  const texto = linhas.join('\n');
  expect(texto).not.toMatch(/Pessoal|1234|999|@/);
};

describe('scripts/orcamento-v2/ativar', () => {
  it('dry-run por padrão; flags', () => {
    expect(lerAtivar(['--email', 'a@x.com'])).toMatchObject({
      alvo: 'a@x.com',
      aplicar: false,
      beta: false,
      adotarOrfas: false,
      sugestoes: false,
    });
    expect(
      lerAtivar(['--email', 'a@x.com', '--aplicar', '--beta', '--adotar-orfas', '--sugestoes']),
    ).toMatchObject({ aplicar: true, beta: true, adotarOrfas: true, sugestoes: true });
    // --apply (outro padrão) NÃO grava
    expect(lerAtivar(['--email', 'a@x.com', '--apply']).aplicar).toBe(false);
    expect(() => lerAtivar([])).toThrow(/--email/);
  });

  it('relatório só com contagens e ids (sem nomes, valores ou e-mail)', () => {
    const linhas = formatarRelatorio(relatorio());
    semDadoPessoal(linhas);
    expect(linhas).toContain('metas ignoradas: duplicada=2, grupo_oculto=1');
    expect(linhas).toContain('órfãs adotáveis (--adotar-orfas): 1 [l4]');
    expect(linhas).toContain('orçados a inserir: 12 linha(s) mensais');
    expect(linhas).toContain('metas de subgrupo copiadas (além da meta visível): 1 [l5]');
  });

  it('mostra as divergências da compensação', () => {
    const linhas = formatarRelatorio(
      relatorio({
        status: 'compensado',
        dryRun: false,
        motivo: 'verificacao_divergiu',
        divergencias: [{ chave: '2026|t1', tipo: 'orcado', antes: 10, depois: 5 }],
      }),
    );
    expect(linhas).toContain('status: compensado (verificacao_divergiu)');
    expect(linhas.some((l) => l.includes('2026|t1 orcado'))).toBe(true);
  });
});

describe('scripts/orcamento-v2/desativar', () => {
  it('dry-run por padrão; exige --email', () => {
    expect(lerDesativar(['--email', 'a@x.com'])).toEqual({ alvo: 'a@x.com', aplicar: false });
    expect(lerDesativar(['--email', 'a@x.com', '--aplicar']).aplicar).toBe(true);
    expect(() => lerDesativar(['--aplicar'])).toThrow(/--email/);
  });

  it('avisa das Gerais que viram item comum', () => {
    const linhas = formatarPlano(
      {
        userId: 'u1',
        noBeta: true,
        ativado: true,
        orcados: 24,
        temPrefs: true,
        geraisAApagar: ['a', 'b'],
        geraisAConverter: ['c'],
      },
      false,
    );
    expect(linhas[0]).toContain('dry-run');
    expect(linhas.some((l) => l.includes('AVISO: c'))).toBe(true);
  });
});

describe('scripts/orcamento-v2/relatorio-dump', () => {
  it('linha por usuário numerado, totais e nenhum dado pessoal', () => {
    const l1 = linhaDoPlano(plano, 3);
    const l2 = linhaDoPlano({ ...plano, jaAtivado: true, valoresEmItemTemplate: 2 }, 0);
    expect(l1).toMatchObject({
      orfas: 1,
      subgrupos: 1,
      duplicadas: 2,
      ocultas: 1,
      itensSoltos: 1,
      aborta: false,
    });
    expect(l2.aborta).toBe(false); // já ativado não "aborta"
    expect(linhaDoPlano({ ...plano, valoresEmItemTemplate: 1 }, 0).aborta).toBe(true);

    const linhas = formatarRelatorioDump([l1, l2]);
    semDadoPessoal(linhas);
    expect(linhas.join('\n')).not.toContain('u1');
    expect(linhas).toContain('orfas: 2 · 2 usuário(s)');
    expect(linhas).toContain('valorMenorQueBanco: 3 · 1 usuário(s)');
    expect(linhas.at(-1)).toBe('já ativados: 1 · abortariam: 0');
  });
});
