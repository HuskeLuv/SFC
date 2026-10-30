import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../route';
import { CODIGO_PREFIXOS_NAO_EMISSOR, TIPOS_BACEN_EMISSORES } from '@/lib/fgc/produtosCobertos';

const mockPrisma = vi.hoisted(() => ({
  institution: { findMany: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({ default: mockPrisma, prisma: mockPrisma }));

const createRequest = (params: Record<string, string>) => {
  const url = new URL('http://localhost/api/institutions');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url.toString());
};

type Where = { AND: Array<Record<string, unknown>> };
const ultimaChamada = () =>
  mockPrisma.institution.findMany.mock.calls.at(-1)![0] as {
    where: Where;
    take: number;
    orderBy: unknown;
  };
const termosDaBusca = () => {
  const busca = ultimaChamada().where.AND.find(
    (f) => Array.isArray(f.OR) && (f.OR as Array<Record<string, unknown>>).some((t) => 'nome' in t),
  );
  return (busca?.OR ?? []) as Array<Record<string, unknown>>;
};

describe('GET /api/institutions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.institution.findMany.mockResolvedValue([]);
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

  it('busca por nome e codigo (como antes)', async () => {
    await GET(createRequest({ search: 'Itaú' }));
    const termos = termosDaBusca();
    expect(termos).toContainEqual({ nome: { contains: 'Itaú', mode: 'insensitive' } });
    expect(termos).toContainEqual({ codigo: { contains: 'Itaú', mode: 'insensitive' } });
    expect(termos).toContainEqual({ apelidos: { contains: 'itau' } });
    expect(termos.some((t) => 'cnpj' in t)).toBe(false);
  });

  it("busca 'nubank' gera o filtro de apelidos", async () => {
    await GET(createRequest({ search: 'NuBank' }));
    expect(termosDaBusca()).toContainEqual({ apelidos: { contains: 'nubank' } });
  });

  it("busca '3326' gera o filtro de cnpj startsWith", async () => {
    await GET(createRequest({ search: '3326' }));
    expect(termosDaBusca()).toContainEqual({ cnpj: { startsWith: '3326' } });
  });

  it('busca com CNPJ formatado usa só os dígitos', async () => {
    await GET(createRequest({ search: '33.264.668' }));
    expect(termosDaBusca()).toContainEqual({ cnpj: { startsWith: '33264668' } });
  });

  it('busca com menos de 4 dígitos não filtra por cnpj', async () => {
    await GET(createRequest({ search: '341' }));
    expect(termosDaBusca().some((t) => 'cnpj' in t)).toBe(false);
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
    mockPrisma.institution.findMany.mockResolvedValue([
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
