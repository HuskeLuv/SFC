import { describe, expect, it, vi } from 'vitest';
import {
  carregarIndiceEmissores,
  casarEmissor,
  changesMexeuNoEmissor,
  montarIndiceEmissores,
  type InstituicaoIndice,
} from '../casarEmissor';

const inst = (
  id: string,
  nome: string,
  extra: Partial<InstituicaoIndice> = {},
): InstituicaoIndice => ({
  id,
  nome,
  cnpj: null,
  tipoBacen: null,
  codigo: `COD-${id}`,
  apelidos: null,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  ...extra,
});

const catalogo: InstituicaoIndice[] = [
  inst('xp', 'Banco XP S.A.', { cnpj: '33264668000103', tipoBacen: 'B1', apelidos: 'xp' }),
  inst('xp-cctvm', 'XP Investimentos CCTVM S.A.', {
    cnpj: '02332886000104',
    tipoBacen: 'N2',
    apelidos: 'xp',
  }),
  inst('nu-pag', 'Nubank S.A.', { cnpj: '18236120000158', tipoBacen: 'N4' }),
  inst('nu-fin', 'NU FINANCEIRA S.A. - SCFI', {
    cnpj: '30680829000143',
    tipoBacen: 'N1',
    apelidos: 'nubank | nu',
  }),
  inst('inter-1', 'Banco Inter', { cnpj: '00416968000101' }),
  inst('inter-2', 'Banco Inter', { codigo: 'FIN-INTER2' }),
  inst('agora', 'Ágora Investimentos', { codigo: 'COR-AGORA' }),
  inst('reserva-nao', 'Banco Reserva', { tipoBacen: 'NAO_EMISSOR' }),
];

describe('casarEmissor', () => {
  const indice = montarIndiceEmissores(catalogo);

  it('CNPJ com máscara casa pela raiz', () => {
    expect(casarEmissor(indice, { cnpj: '33.264.668/0001-03', nome: 'qualquer' })).toEqual({
      id: 'xp',
      nome: 'Banco XP S.A.',
      via: 'cnpj',
    });
    // outra filial do mesmo banco: mesma raiz
    expect(casarEmissor(indice, { cnpj: '33264668000294' })?.id).toBe('xp');
  });

  it('vários registros na mesma raiz: prefere o emissor e depois o mais antigo (determinístico)', () => {
    const lista = [
      inst('c-novo', 'Banco C', { cnpj: '11111111000191', createdAt: new Date('2026-01-01') }),
      inst('c-n2', 'C Corretora', {
        cnpj: '11111111000272',
        tipoBacen: 'N2',
        createdAt: new Date('2020-01-01'),
      }),
      inst('c-velho', 'Banco C Antigo', {
        cnpj: '11111111000353',
        createdAt: new Date('2024-01-01'),
      }),
      inst('c-b1', 'Banco C S.A.', {
        cnpj: '11111111000434',
        tipoBacen: 'B1',
        createdAt: new Date('2026-06-01'),
      }),
    ];
    const a = montarIndiceEmissores(lista);
    const b = montarIndiceEmissores([...lista].reverse());
    expect(casarEmissor(a, { cnpj: '11111111' })?.id).toBe('c-b1');
    expect(casarEmissor(b, { cnpj: '11111111' })?.id).toBe('c-b1');
    const semB1 = lista.filter((i) => i.id !== 'c-b1');
    expect(casarEmissor(montarIndiceEmissores(semB1), { cnpj: '11111111' })?.id).toBe('c-velho');
    expect(
      casarEmissor(montarIndiceEmissores([...semB1].reverse()), { cnpj: '11111111' })?.id,
    ).toBe('c-velho');
  });

  it("'BANCO XP S.A.' casa pelo nome", () => {
    expect(casarEmissor(indice, { nome: 'BANCO XP S.A.' })).toEqual({
      id: 'xp',
      nome: 'Banco XP S.A.',
      via: 'nome',
    });
  });

  it("'NUBANK' casa pelo apelido com a Nu Financeira (Nubank S.A. é N4)", () => {
    expect(casarEmissor(indice, { nome: 'NUBANK' })).toEqual({
      id: 'nu-fin',
      nome: 'NU FINANCEIRA S.A. - SCFI',
      via: 'apelido',
    });
  });

  it('apelido casa pela frase inteira, nunca por uma palavra dela', () => {
    const marcas = montarIndiceEmissores([
      inst('mp', 'MERCADO CRÉDITO SCFI S.A.', { tipoBacen: 'N1', apelidos: 'mercado pago' }),
      inst('c6', 'BANCO C6 S.A.', { tipoBacen: 'B1', apelidos: 'c6 | c6 bank' }),
      inst('jsafra', 'Banco J. Safra S.A.', { tipoBacen: 'B1', apelidos: 'banco j safra' }),
    ]);
    expect(casarEmissor(marcas, { nome: 'Mercado Pago' })).toMatchObject({
      id: 'mp',
      via: 'apelido',
    });
    expect(casarEmissor(marcas, { nome: 'C6 Bank' })?.id).toBe('c6');
    expect(casarEmissor(marcas, { nome: 'C6' })?.id).toBe('c6');
    expect(casarEmissor(marcas, { nome: 'Safra' })).toBeNull();
    expect(casarEmissor(marcas, { nome: 'Pago' })).toBeNull();
    expect(casarEmissor(marcas, { nome: 'Bank' })).toBeNull();
  });

  it('nome que bate com 2 registros dá null', () => {
    expect(casarEmissor(indice, { nome: 'BANCO INTER S/A' })).toBeNull();
  });

  it('N2 e NAO_EMISSOR (e prefixo de corretora) não casam pelo nome', () => {
    expect(casarEmissor(indice, { nome: 'XP INVESTIMENTOS CCTVM SA' })).toBeNull();
    expect(casarEmissor(indice, { nome: 'Banco Reserva' })).toBeNull();
    expect(casarEmissor(indice, { nome: 'Ágora Investimentos' })).toBeNull();
    // 'xp' é apelido do Banco XP e da XP CCTVM, mas a corretora fica fora do índice por termo
    expect(casarEmissor(indice, { nome: 'XP' })?.id).toBe('xp');
  });

  it('CNPJ desconhecido cai no nome; sem cnpj nem nome dá null', () => {
    expect(casarEmissor(indice, { cnpj: '99999999000199', nome: 'Banco XP' })?.via).toBe('nome');
    expect(casarEmissor(indice, { cnpj: '99999999000199', nome: 'ARBI' })).toBeNull();
    expect(casarEmissor(indice, {})).toBeNull();
    expect(casarEmissor(indice, { cnpj: '', nome: '  ' })).toBeNull();
    expect(casarEmissor(indice, { cnpj: null, nome: null })).toBeNull();
  });

  it('carregarIndiceEmissores lê só as ATIVAS', async () => {
    const findMany = vi.fn().mockResolvedValue([catalogo[0]]);
    const db = { institution: { findMany } } as unknown as Parameters<
      typeof carregarIndiceEmissores
    >[0];
    const indiceDb = await carregarIndiceEmissores(db);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'ATIVA' } }));
    expect(casarEmissor(indiceDb, { cnpj: '33264668' })?.id).toBe('xp');
  });
});

describe('changesMexeuNoEmissor', () => {
  it('reconhece o FieldChange do emissor, inclusive "Usar a corretora" (after null)', () => {
    expect(
      changesMexeuNoEmissor([
        { field: 'emissor', label: 'Banco emissor', before: 'Banco XP', after: null },
      ]),
    ).toBe(true);
    expect(changesMexeuNoEmissor([{ field: 'nome', label: 'Nome', before: 'a', after: 'b' }])).toBe(
      false,
    );
    expect(changesMexeuNoEmissor(null)).toBe(false);
    expect(changesMexeuNoEmissor({ field: 'emissor' })).toBe(false);
    expect(changesMexeuNoEmissor([null, 'x'])).toBe(false);
  });
});
