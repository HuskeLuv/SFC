/**
 * A6, fatia B — campos de seguradora por rótulo (nível até 4 da DRE), só para o Set de seguradoras e
 * independentemente do layout financeiro. Recortes reais da CVM (financeirasFixtures).
 */
import { rmSync } from 'fs';
import { afterAll, describe, expect, it } from 'vitest';
import { urlArquivoCvm } from '@/services/analiseAtivos/acoes/cvmArquivos';
import { relevanteFundamentos } from '@/services/analiseAtivos/acoes/sincronizarCvmCias';
import {
  CNPJ,
  dirZips,
  fakeComSetores,
  linhaFund,
  num,
  rodarFin,
  setoresFixtures,
  zipDfpFin,
} from '@/services/analiseAtivos/acoes/__tests__/financeirasFixtures';
import { criarPrismaFake } from '@/services/analiseAtivos/acoes/__tests__/prismaFake';

afterAll(() => rmSync(dirZips, { recursive: true, force: true }));

const mil = 1000;

async function carregar(ano: 2025 | 2022, comSetores = true) {
  const { prisma, tabelas } = fakeComSetores(comSetores);
  await rodarFin(
    prisma,
    { [urlArquivoCvm('dfp', ano)]: zipDfpFin(ano) },
    {
      doc: 'dfp',
      anos: [ano],
    },
  );
  return (cia: keyof typeof CNPJ) => linhaFund(tabelas, CNPJ[cia], 'con', 'FY', `${ano}-12-31`)!;
}

describe('relevanteFundamentos: 4º nível da DRE só para seguradora e pelo rótulo', () => {
  const l = (cdConta: string, dsConta: string) => ({ demonstrativo: 'DRE', cdConta, dsConta });
  it('PSSA 3.04.05.11, CXSE 3.04.04.01/02 e IRB 3.02.02.01 passam; outra conta de 4º nível não', () => {
    const seg = { seguradora: true };
    expect(relevanteFundamentos(l('3.04.05.11', 'Despesas de seguro'), seg)).toBe(true);
    expect(relevanteFundamentos(l('3.04.05.03', 'Sinistros retidos - bruto'), seg)).toBe(true);
    expect(
      relevanteFundamentos(l('3.04.04.01', 'Receitas de Acesso à Rede e Uso da Marca'), seg),
    ).toBe(true);
    expect(relevanteFundamentos(l('3.04.04.02', 'Receitas de prestação de serviços'), seg)).toBe(
      true,
    );
    expect(relevanteFundamentos(l('3.02.02.01', 'Sinistros Retidos de Resseguros'), seg)).toBe(
      true,
    );
    expect(relevanteFundamentos(l('3.04.02.01', 'Despesas administrativas'), seg)).toBe(false);
    // fora do Set de seguradoras: o 4º nível continua de fora
    expect(relevanteFundamentos(l('3.04.05.11', 'Despesas de seguro'))).toBe(false);
  });
});

describe('Campos de seguradora — DFP 2025 (IFRS 17)', () => {
  it('BBSE (holding): receita = comissões, equivalência e resultado financeiro preenchidos; receita de seguro 0', async () => {
    const fy = await carregar(2025);
    const b = fy('BBSE');
    expect(num(b.receitaComissoesServicos)).toBe(4_994_545 * mil);
    expect(num(b.equivalenciaPatrimonial)).toBe(5_340_918 * mil);
    expect(num(b.resultadoFinanceiro)).toBe(1_075_600 * mil);
    expect(num(b.receitaSeguro)).toBe(0);
  });

  it('PSSA 3.04.05.11 (despesa de seguro) e 3.01.07 (receita de seguro) chegam preenchidas', async () => {
    const fy = await carregar(2025);
    const p = fy('PSSA');
    expect(num(p.despesaSeguro)).toBe(-25_361_238 * mil);
    expect(num(p.receitaSeguro)).toBe(32_641_790 * mil);
    expect(num(p.resultadoFinanceiro)).toBe(1_565_871 * mil);
    expect(num(p.equivalenciaPatrimonial)).toBe(65_759 * mil);
  });

  it('CXSE 3.04.04.01/02 viram receitaComissoesServicos (layout industrial)', async () => {
    const fy = await carregar(2025);
    const c = fy('CXSE');
    expect(num(c.receitaComissoesServicos)).toBe((202_778 + 2_254_577) * mil);
    expect(num(c.equivalenciaPatrimonial)).toBe(3_279_914 * mil);
    expect(num(c.resultadoFinanceiro)).toBe(182_196 * mil);
  });

  it('IFRS 17 a partir de 2023: sem o rótulo de sinistralidade (prêmios ganhos/sinistros sem valor)', async () => {
    const fy = await carregar(2025);
    // o modelo novo não tem 'prêmios ganhos'; a PSSA ainda traz 'Sinistros retidos - bruto' zerada
    for (const cia of ['PSSA', 'IRBR', 'BBSE'] as const) {
      expect(num(fy(cia).premiosGanhos) ?? 0).toBe(0);
      expect(num(fy(cia).sinistrosRetidos) ?? 0).toBe(0);
    }
    expect(num(fy('IRBR').receitaSeguro)).toBe(5_211_349 * mil);
    expect(num(fy('IRBR').despesaSeguro)).toBe(-4_632_662 * mil);
  });

  it('banco e indústria não ganham campos de seguradora', async () => {
    const fy = await carregar(2025);
    for (const cia of ['ITUB', 'WEGE'] as const) {
      expect(fy(cia).receitaComissoesServicos ?? null).toBeNull();
      expect(fy(cia).resultadoFinanceiro ?? null).toBeNull();
    }
  });

  it('sem o Set de seguradoras (AssetSetorB3 vazio) ⇒ nenhum campo novo (comportamento de antes)', async () => {
    const fy = await carregar(2025, false);
    expect(fy('PSSA').despesaSeguro ?? null).toBeNull();
    expect(fy('BBSE').receitaComissoesServicos ?? null).toBeNull();
  });
});

describe('Campos de seguradora — DFP 2022 (antes do IFRS 17)', () => {
  it('PSSA 3.04.05.03 (sinistros retidos) e prêmios ganhos = emitidos + cedidos + variação das provisões', async () => {
    const fy = await carregar(2022);
    const p = fy('PSSA');
    expect(num(p.sinistrosRetidos)).toBe(-13_681_393 * mil);
    expect(num(p.premiosGanhos)).toBe((22_728_851 - 136_795 - 2_750_716) * mil);
    expect(num(p.receitaSeguro)).toBeNull();
  });

  it('IRB 3.02.02.01 (sinistros retidos) e 3.01.02.01 (prêmios ganhos)', async () => {
    const fy = await carregar(2022);
    const i = fy('IRBR');
    expect(num(i.sinistrosRetidos)).toBe(-6_911_514 * mil);
    expect(num(i.premiosGanhos)).toBe(7_021_200 * mil);
  });

  it('BBSE 2022: comissões líquidas como receita da holding', async () => {
    const fy = await carregar(2022);
    expect(num(fy('BBSE').receitaComissoesServicos)).toBe(4_141_994 * mil);
    expect(num(fy('BBSE').equivalenciaPatrimonial)).toBe(3_363_765 * mil);
  });
});

describe("Layout 'Receitas das Operações' restrito ao Set de seguradoras", () => {
  it('BBSE 2022 passa a financeira (EBIT/D&A não se aplicam); fora do Set, o mesmo rótulo não muda nada', async () => {
    const comSet = await carregar(2022);
    const b = comSet('BBSE');
    expect(b.ebit ?? null).toBeNull();
    expect(b.naoSeAplica).toContain('ebit');

    // BBSE fora do Set = uma 'industrial' com o mesmo rótulo na 3.01: segue o layout comum
    const { prisma, tabelas } = criarPrismaFake();
    tabelas.assetSetorB3.push(...setoresFixtures(['BBSE']));
    await rodarFin(
      prisma,
      { [urlArquivoCvm('dfp', 2022)]: zipDfpFin(2022) },
      {
        doc: 'dfp',
        anos: [2022],
      },
    );
    const fora = linhaFund(tabelas, CNPJ.BBSE, 'con', 'FY', '2022-12-31')!;
    expect(num(fora.ebit)).toBe(3_681_904 * mil); // 3.05 do modelo antigo, como hoje
    expect(fora.naoSeAplica).not.toContain('ebit');
    expect(tabelas.cvmCompany.find((c) => c.cnpj === CNPJ.BBSE)?.layoutFinanceiro ?? false).toBe(
      false,
    );
  });
});
