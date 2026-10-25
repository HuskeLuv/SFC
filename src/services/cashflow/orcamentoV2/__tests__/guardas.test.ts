import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CashflowGroup, CashflowItem } from '@/types/cashflow';

const mockEstado = vi.hoisted(() => vi.fn());
const mockGetMerged = vi.hoisted(() => vi.fn());
const mockPrisma = vi.hoisted(() => ({ cashflowGroup: { findUnique: vi.fn() } }));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

vi.mock('@/services/cashflow/orcamentoV2/acesso', () => ({
  estadoAcessoOrcamentoV2: mockEstado,
}));
vi.mock('@/services/cashflow/getCashflowTree', () => ({
  getMergedCashflowGroups: mockGetMerged,
}));
const mockExecutarExclusao = vi.hoisted(() => vi.fn());
vi.mock('@/services/cashflow/orcamentoV2/excluirSubcategoria', () => ({
  executarExclusaoSubcategoria: mockExecutarExclusao,
}));

import {
  ErroEstruturaOrcamento,
  assertNaoCategoriaSistema,
  assertNaoGeral,
  assertNomeLivreNaCategoria,
  categoriaInfo,
  categoriaInfoDoRegistro,
  delegarExclusaoItem,
  ehCategoriaSistema,
  guardarCriacaoItemV2,
  guardarEdicaoItemV2,
  localizarGrupo,
  localizarItem,
  nomesIrmaos,
  orderIndexNovaSub,
  usuarioOrcamentoV2Ativo,
  validarNomeNaCategoria,
} from '../guardas';

const item = (id: string, name: string, extra: Partial<CashflowItem> = {}): CashflowItem => ({
  id,
  userId: 'u1',
  groupId: 'g',
  name,
  significado: null,
  rank: null,
  values: [],
  ...extra,
});

const grupo = (
  id: string,
  name: string,
  extra: Partial<CashflowGroup> = {},
  children: CashflowGroup[] = [],
  items: CashflowItem[] = [],
): CashflowGroup => ({
  id,
  userId: null,
  name,
  type: 'despesa',
  parentId: null,
  orderIndex: 0,
  items,
  children,
  isTemplate: true,
  templateName: name,
  ...extra,
});

/** Árvore mesclada sintética: Despesas > Despesas Fixas > Habitação; Despesas > D. Variáveis. */
const arvore = (): CashflowGroup[] => [
  grupo('ent', 'Entradas', { type: 'entrada' }, [], [item('sal', 'Salário')]),
  grupo('desp', 'Despesas', {}, [
    grupo(
      'fixas',
      'Despesas Fixas',
      {},
      [
        grupo(
          'ovr-hab',
          'Minha Casa',
          { userId: 'u1', templateId: 'tpl-hab', templateName: 'Habitação', isTemplate: false },
          [],
          [
            item('aluguel', 'Aluguel', { orderIndex: 1 }),
            item('ovr-luz', 'Energia Elétrica', { orderIndex: 4, templateId: 'tpl-luz' }),
            item('geral-hab', 'Geral', { isGeral: true, orderIndex: 0 }),
          ],
        ),
      ],
      [item('solto', 'Solto')],
    ),
    grupo('var', 'Despesas Variáveis', {}, [], [item('geral-var', 'Geral', { isGeral: true })]),
  ]),
  grupo('custom', 'Habitação', { userId: 'u1', isTemplate: false, templateName: 'Habitação' }, [
    grupo('sub', 'Interno', { userId: 'u1', isTemplate: false }),
  ]),
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('usuarioOrcamentoV2Ativo', () => {
  it('só liberada && ativado', async () => {
    mockEstado.mockResolvedValueOnce({ estado: 'liberada', ativado: true });
    expect(await usuarioOrcamentoV2Ativo('u1')).toBe(true);
    mockEstado.mockResolvedValueOnce({ estado: 'liberada', ativado: false });
    expect(await usuarioOrcamentoV2Ativo('u1')).toBe(false);
    mockEstado.mockResolvedValueOnce({ estado: 'fora_do_beta', ativado: true });
    expect(await usuarioOrcamentoV2Ativo('u1')).toBe(false);
    mockEstado.mockResolvedValueOnce({ estado: 'desligada', ativado: false });
    expect(await usuarioOrcamentoV2Ativo('u1')).toBe(false);
    expect(mockEstado).toHaveBeenCalledWith('u1');
  });
});

describe('assertNaoGeral', () => {
  it('lança 409 para a Geral e passa para o resto', () => {
    expect(() => assertNaoGeral({ isGeral: true }, 'excluir')).toThrow(
      'A subcategoria Geral não pode ser excluída',
    );
    try {
      assertNaoGeral({ isGeral: true }, 'mover');
    } catch (e) {
      expect(e).toBeInstanceOf(ErroEstruturaOrcamento);
      expect((e as ErroEstruturaOrcamento).statusCode).toBe(409);
      expect((e as ErroEstruturaOrcamento).codigo).toBe('geral');
    }
    expect(() => assertNaoGeral({ isGeral: false }, 'renomear')).not.toThrow();
    expect(() => assertNaoGeral({}, 'renomear')).not.toThrow();
    expect(() => assertNaoGeral(null, 'renomear')).not.toThrow();
  });
});

describe('categoria de sistema', () => {
  it('catálogo e níveis estruturais vindos do template; grupo do usuário nunca', () => {
    const [, desp, custom] = arvore();
    const hab = desp.children[0].children[0];
    expect(ehCategoriaSistema(categoriaInfo(hab))).toBe(true); // override renomeado
    expect(ehCategoriaSistema(categoriaInfo(desp))).toBe(true);
    expect(ehCategoriaSistema(categoriaInfo(desp.children[0]))).toBe(true);
    expect(ehCategoriaSistema(categoriaInfo(custom))).toBe(false); // mesmo nome, criado pelo usuário
    expect(ehCategoriaSistema({ nomeCanonico: 'Viagens', derivadaDeTemplate: true })).toBe(false);
    expect(() => assertNaoCategoriaSistema(categoriaInfo(hab), 'excluir')).toThrow(
      ErroEstruturaOrcamento,
    );
    expect(() => assertNaoCategoriaSistema(categoriaInfo(custom), 'excluir')).not.toThrow();
  });
});

describe('validarNomeNaCategoria', () => {
  it('devolve o nome com trim ou lança 422 com o motivo', () => {
    expect(validarNomeNaCategoria('  Gás  ', ['Aluguel'])).toBe('Gás');
    const motivo = (nome: string, irmaos: string[]) => {
      try {
        validarNomeNaCategoria(nome, irmaos);
        return null;
      } catch (e) {
        expect((e as ErroEstruturaOrcamento).statusCode).toBe(422);
        return (e as ErroEstruturaOrcamento).codigo;
      }
    };
    expect(motivo('   ', [])).toBe('nome_vazio');
    expect(motivo('x'.repeat(61), [])).toBe('nome_longo');
    expect(motivo('ALUGUÉL', ['Aluguel'])).toBe('nome_duplicado');
  });
});

describe('assertNomeLivreNaCategoria', () => {
  it('só barra o duplicado (nome antigo longo não impede mover)', () => {
    expect(() => assertNomeLivreNaCategoria('x'.repeat(80), ['Aluguel'])).not.toThrow();
    expect(() => assertNomeLivreNaCategoria('aluguel', ['Aluguel'])).toThrow(
      ErroEstruturaOrcamento,
    );
  });
});

describe('papéis na árvore', () => {
  it('localiza grupos e itens com o papel da partição de categorias', () => {
    const a = arvore();
    expect(localizarGrupo(a, 'desp')?.papel).toBe('nivel_solto');
    expect(localizarGrupo(a, 'fixas')?.papel).toBe('nivel_solto');
    expect(localizarGrupo(a, 'tpl-hab')?.grupo.id).toBe('ovr-hab'); // pelo id do template
    expect(localizarGrupo(a, 'ovr-hab')?.papel).toBe('categoria');
    expect(localizarGrupo(a, 'var')?.papel).toBe('categoria');
    expect(localizarGrupo(a, 'custom')?.papel).toBe('categoria');
    expect(localizarGrupo(a, 'sub')?.papel).toBe('outro');
    expect(localizarGrupo(a, 'ent')?.papel).toBe('outro');
    expect(localizarGrupo(a, 'nada')).toBeNull();

    expect(localizarItem(a, 'tpl-luz')?.item.id).toBe('ovr-luz');
    expect(localizarItem(a, 'solto')?.papel).toBe('nivel_solto');
    expect(localizarItem(a, 'sal')?.papel).toBe('outro');
    expect(localizarItem(a, 'nada')).toBeNull();
  });

  it('irmãos e orderIndex antes da Geral', () => {
    const hab = localizarGrupo(arvore(), 'ovr-hab')!.grupo;
    expect(nomesIrmaos(hab, 'aluguel')).toEqual(['Energia Elétrica', 'Geral']);
    expect(orderIndexNovaSub(hab)).toBe(5);
    expect(orderIndexNovaSub(localizarGrupo(arvore(), 'var')!.grupo)).toBe(1);
  });
});

describe('guardarCriacaoItemV2', () => {
  beforeEach(() => mockGetMerged.mockResolvedValue(arvore()));

  it('categoria: nome validado e orderIndex antes da Geral', async () => {
    expect(await guardarCriacaoItemV2('u1', 'ovr-hab', ' Gás ')).toEqual({
      nome: 'Gás',
      orderIndex: 5,
    });
    await expect(guardarCriacaoItemV2('u1', 'ovr-hab', 'geral')).rejects.toMatchObject({
      statusCode: 422,
      codigo: 'nome_duplicado',
    });
  });

  it('Q15: nível solto → 409; fora de categoria → sem mudança', async () => {
    await expect(guardarCriacaoItemV2('u1', 'fixas', 'X')).rejects.toMatchObject({
      statusCode: 409,
      codigo: 'item_solto',
    });
    expect(await guardarCriacaoItemV2('u1', 'ent', ' Bônus ')).toEqual({ nome: ' Bônus ' });
    expect(await guardarCriacaoItemV2('u1', 'fora', 'X')).toEqual({ nome: 'X' });
  });
});

describe('delegarExclusaoItem', () => {
  it('fusão feita → fundido; não se aplica (null) → nao_aplica; repassa o contexto', async () => {
    const contexto = { request: {} as never, auth: {} as never };
    mockExecutarExclusao.mockResolvedValueOnce({ itemId: 'i1' });
    expect(await delegarExclusaoItem('u1', 'i1', contexto)).toBe('fundido');
    expect(mockExecutarExclusao).toHaveBeenCalledWith('u1', 'i1', { contexto, delegacao: true });
    mockExecutarExclusao.mockResolvedValueOnce(null);
    expect(await delegarExclusaoItem('u1', 'i2')).toBe('nao_aplica');
  });

  it('recusa da fusão sobe (409 da rota)', async () => {
    mockExecutarExclusao.mockRejectedValueOnce(new Error('cores'));
    await expect(delegarExclusaoItem('u1', 'i1')).rejects.toThrow('cores');
  });
});

describe('categoriaInfoDoRegistro', () => {
  it('template, override (nome do template) e grupo do usuário', async () => {
    expect(
      await categoriaInfoDoRegistro({ name: 'Habitação', userId: null, templateId: null }),
    ).toEqual({ nomeCanonico: 'Habitação', derivadaDeTemplate: true });
    mockPrisma.cashflowGroup.findUnique.mockResolvedValue({ name: 'Habitação' });
    expect(
      await categoriaInfoDoRegistro({ name: 'Minha Casa', userId: 'u1', templateId: 'tpl-hab' }),
    ).toEqual({ nomeCanonico: 'Habitação', derivadaDeTemplate: true });
    expect(
      await categoriaInfoDoRegistro({ name: 'Habitação', userId: 'u1', templateId: null }),
    ).toEqual({ nomeCanonico: 'Habitação', derivadaDeTemplate: false });
  });
});

describe('guardarEdicaoItemV2', () => {
  beforeEach(() => mockGetMerged.mockResolvedValue(arvore()));

  it('sem nome nem grupo não carrega a árvore', async () => {
    expect(await guardarEdicaoItemV2('u1', 'aluguel', {})).toEqual({});
    expect(await guardarEdicaoItemV2('u1', 'aluguel', { name: undefined, groupId: '' })).toEqual(
      {},
    );
    expect(mockGetMerged).not.toHaveBeenCalled();
  });

  it("name: '' é nome pedido: 422 nome_vazio na categoria", async () => {
    await expect(guardarEdicaoItemV2('u1', 'aluguel', { name: '' })).rejects.toMatchObject({
      statusCode: 422,
      codigo: 'nome_vazio',
    });
  });

  it('renomear na categoria: valida contra as irmãs; nome igual não é renomear', async () => {
    expect(await guardarEdicaoItemV2('u1', 'aluguel', { name: ' Condomínio ' })).toEqual({
      nome: 'Condomínio',
    });
    expect(await guardarEdicaoItemV2('u1', 'aluguel', { name: 'Aluguel' })).toEqual({});
    await expect(
      guardarEdicaoItemV2('u1', 'aluguel', { name: 'energia eletrica' }),
    ).rejects.toMatchObject({ statusCode: 422, codigo: 'nome_duplicado' });
    // Fora de categoria (Entradas): sem regra de nome.
    expect(await guardarEdicaoItemV2('u1', 'sal', { name: '' + 'x'.repeat(80) })).toEqual({});
  });

  it('Geral: 409 ao renomear ou mudar de grupo; reenviar o mesmo nome passa', async () => {
    await expect(guardarEdicaoItemV2('u1', 'geral-hab', { name: 'Outros' })).rejects.toMatchObject({
      statusCode: 409,
      codigo: 'geral',
    });
    await expect(guardarEdicaoItemV2('u1', 'geral-hab', { groupId: 'var' })).rejects.toMatchObject({
      statusCode: 409,
      codigo: 'geral',
    });
    expect(await guardarEdicaoItemV2('u1', 'geral-hab', { name: 'Geral' })).toEqual({});
  });

  it('mudar de grupo: solto → 409; nome repetido no destino → 422', async () => {
    await expect(guardarEdicaoItemV2('u1', 'aluguel', { groupId: 'fixas' })).rejects.toMatchObject({
      codigo: 'item_solto',
    });
    await expect(
      guardarEdicaoItemV2('u1', 'aluguel', { groupId: 'var', name: 'geral' }),
    ).rejects.toMatchObject({ codigo: 'nome_duplicado' });
    expect(await guardarEdicaoItemV2('u1', 'aluguel', { groupId: 'var' })).toEqual({});
  });

  it('lote: a árvore passada recebe o nome novo', async () => {
    const a = arvore();
    await guardarEdicaoItemV2('u1', 'aluguel', { name: 'Gás' }, { arvore: a });
    await expect(
      guardarEdicaoItemV2('u1', 'ovr-luz', { name: 'gas' }, { arvore: a }),
    ).rejects.toMatchObject({ codigo: 'nome_duplicado' });
    expect(mockGetMerged).not.toHaveBeenCalled();
  });
});
