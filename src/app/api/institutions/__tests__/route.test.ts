import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../route';
import { CODIGO_PREFIXOS_NAO_EMISSOR, TIPOS_BACEN_EMISSORES } from '@/lib/fgc/produtosCobertos';

const mockPrisma = vi.hoisted(() => ({
  institution: { findMany: vi.fn() },
  $queryRaw: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ default: mockPrisma, prisma: mockPrisma }));

const createRequest = (params: Record<string, string>) => {
  const url = new URL('http://localhost/api/institutions');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url.toString());
};

type Where = { AND: Array<Record<string, unknown>> };
const SO_CATALOGO = { NOT: { codigo: { startsWith: 'BCB-' } } };
const SO_BACEN = { codigo: { startsWith: 'BCB-' } };
type Chamada = { where: Where; take: number; orderBy: unknown };
/** 1ª consulta do último GET (linhas do catálogo), sem a cláusula do prefixo BCB-. */
const ultimaChamada = (): Chamada => {
  const chamadas = mockPrisma.institution.findMany.mock.calls.map((c) => c[0] as Chamada);
  const ehCatalogo = (f: Record<string, unknown>) =>
    JSON.stringify(f) === JSON.stringify(SO_CATALOGO);
  const c = chamadas.filter((x) => x.where.AND.some(ehCatalogo)).at(-1)!;
  return { ...c, where: { AND: c.where.AND.filter((f) => !ehCatalogo(f)) } };
};
/** Valores interpolados no SQL da busca: [COM_ACENTO, SEM_ACENTO, busca, ..., porCnpj, porCnpj]. */
const valoresDaBusca = () => mockPrisma.$queryRaw.mock.calls.at(-1)!.slice(1) as unknown[];
const sqlDaBusca = () => (mockPrisma.$queryRaw.mock.calls.at(-1)![0] as string[]).join('?');

describe('GET /api/institutions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.institution.findMany.mockResolvedValue([]);
    mockPrisma.$queryRaw.mockResolvedValue([{ id: 'i1' }, { id: 'i2' }]);
  });

  it('sem busca: só ATIVA, por nome, limit padrão 200', async () => {
    const res = await GET(createRequest({}));
    expect(res.status).toBe(200);
    const args = ultimaChamada();
    expect(args.where).toEqual({ AND: [{ status: 'ATIVA' }] });
    expect(args.take).toBe(200);
    expect(args.orderBy).toEqual({ nome: 'asc' });
  });

  it('limit 99999 vira 500; 0 vira 1; lixo vira 200', async () => {
    await GET(createRequest({ limit: '99999' }));
    expect(ultimaChamada().take).toBe(500);
    await GET(createRequest({ limit: '0' }));
    expect(ultimaChamada().take).toBe(1);
    await GET(createRequest({ limit: 'abc' }));
    expect(ultimaChamada().take).toBe(200);
  });

  it('busca sem acento nem caixa em nome, codigo e apelidos; filtra pelos ids achados', async () => {
    await GET(createRequest({ search: 'Itaú BBA' }));
    const valores = valoresDaBusca();
    expect(valores[2]).toBe('itau bba');
    expect(sqlDaBusca()).toContain('translate(lower(nome)');
    expect(sqlDaBusca()).toContain('apelidos');
    expect(sqlDaBusca()).not.toMatch(/LIKE/i);
    expect(valores.at(-1)).toBeNull();
    expect(ultimaChamada().where.AND).toContainEqual({ id: { in: ['i1', 'i2'] } });
  });

  it("'%' e '_' chegam como texto literal (strpos, sem curinga)", async () => {
    await GET(createRequest({ search: '%_' }));
    expect(valoresDaBusca()).toContain('%_');
  });

  it('busca corta em 100 caracteres', async () => {
    await GET(createRequest({ search: 'a'.repeat(300) }));
    expect(valoresDaBusca()).toContain('a'.repeat(100));
  });

  it("busca '3326' e CNPJ formatado procuram o início do CNPJ pelos dígitos", async () => {
    await GET(createRequest({ search: '3326' }));
    expect(valoresDaBusca().at(-1)).toBe('3326');
    await GET(createRequest({ search: '33.264.668' }));
    expect(valoresDaBusca().at(-1)).toBe('33264668');
  });

  it('busca com menos de 4 dígitos não filtra por cnpj', async () => {
    await GET(createRequest({ search: '341' }));
    expect(valoresDaBusca().at(-1)).toBeNull();
  });

  it('busca só com espaços não consulta o banco', async () => {
    await GET(createRequest({ search: '   ' }));
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    expect(ultimaChamada().where).toEqual({ AND: [{ status: 'ATIVA' }] });
  });

  it('papel=emissor: tipos emissores ou sem tipo, e o NOT dos prefixos não emissores', async () => {
    await GET(createRequest({ papel: 'emissor', search: 'banco' }));
    const { AND } = ultimaChamada().where;
    expect(AND[0]).toEqual({ status: 'ATIVA' });
    expect(AND).toContainEqual({
      OR: [{ tipoBacen: { in: [...TIPOS_BACEN_EMISSORES] } }, { tipoBacen: null }],
    });
    const not = AND.find((f) => 'NOT' in f)?.NOT as Array<{ codigo: { startsWith: string } }>;
    expect(not.map((n) => n.codigo.startsWith)).toEqual(CODIGO_PREFIXOS_NAO_EMISSOR);
    expect(CODIGO_PREFIXOS_NAO_EMISSOR).toEqual(
      expect.arrayContaining(['COR-', 'PREV-', 'INT-', 'RESERVA-']),
    );
  });

  it('sem papel=emissor não aplica o filtro de emissor', async () => {
    await GET(createRequest({ search: 'xp' }));
    expect(ultimaChamada().where.AND.some((f) => 'NOT' in f)).toBe(false);
  });

  it('resposta traz os campos novos (aditivos)', async () => {
    mockPrisma.institution.findMany.mockResolvedValueOnce([
      {
        id: 'i1',
        nome: 'Banco BTG Pactual S.A.',
        codigo: 'BCB-30306294',
        status: 'ATIVA',
        cnpj: '30306294000145',
        cnpjCalculado: true,
        tipoBacen: 'B1',
        conglomeradoBacen: 'C0080000',
        apelidos: 'btg',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    const res = await GET(createRequest({ papel: 'emissor' }));
    const data = await res.json();
    expect(data).toEqual({
      success: true,
      count: 1,
      institutions: [
        {
          id: 'i1',
          nome: 'Banco BTG Pactual S.A.',
          codigo: 'BCB-30306294',
          status: 'ATIVA',
          cnpj: '30306294000145',
          cnpjCalculado: true,
          tipoBacen: 'B1',
        },
      ],
    });
  });
});

describe('GET /api/institutions — ordem catálogo antes do Bacen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('completa o limite com as linhas BCB- depois das do catálogo', async () => {
    mockPrisma.institution.findMany
      .mockResolvedValueOnce([{ id: 'c1', nome: 'XP', codigo: '102' }])
      .mockResolvedValueOnce([{ id: 'b1', nome: 'AGORACRED', codigo: 'BCB-1' }]);
    const res = await GET(createRequest({ limit: '2' }));
    const data = await res.json();
    expect(data.institutions.map((i: { id: string }) => i.id)).toEqual(['c1', 'b1']);
    const [primeira, segunda] = mockPrisma.institution.findMany.mock.calls.map((c) => c[0]);
    expect(primeira.where.AND).toContainEqual(SO_CATALOGO);
    expect(primeira.take).toBe(2);
    expect(segunda.where.AND).toContainEqual(SO_BACEN);
    expect(segunda.take).toBe(1);
  });

  it('catálogo já enche o limite: não consulta as linhas BCB-', async () => {
    mockPrisma.institution.findMany.mockResolvedValueOnce([
      { id: 'c1', nome: 'XP', codigo: '102' },
    ]);
    await GET(createRequest({ limit: '1' }));
    expect(mockPrisma.institution.findMany).toHaveBeenCalledTimes(1);
  });
});
