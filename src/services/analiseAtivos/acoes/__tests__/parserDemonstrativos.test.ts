import { mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, describe, expect, it } from 'vitest';
import { ErroLayoutFonte } from '@/services/analiseAtivos/fontes/erros';
import { listarEntradasZip } from '@/services/analiseAtivos/fontes/zipStream';
import {
  acharEntrada,
  chaveDoc,
  lerIndice,
  criarInternador,
  lerLinhasDemonstrativo,
  valorEmReais,
  type LinhaLida,
} from '@/services/analiseAtivos/acoes/parserDemonstrativos';
import { lerComposicao } from '@/services/analiseAtivos/acoes/parserComposicaoCapital';
import {
  fixture,
  montarZip,
  zipDfp2025,
  zipItr,
} from '@/services/analiseAtivos/acoes/__tests__/zipFixtures';

/** CNPJ de 14 dígitos na máscara da CVM (as linhas cruas das fixtures vêm assim). */
const mascarar = (c: string) =>
  `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;

const dir = mkdtempSync(path.join(os.tmpdir(), 'parser-cvm-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const WEGE = '84429695000111';
const VALE = '33592510000154';
const BBAS = '00000000000191';

async function coletar(it: AsyncIterable<LinhaLida>): Promise<LinhaLida[]> {
  const out: LinhaLida[] = [];
  for await (const l of it) out.push(l);
  return out;
}

describe('lerIndice (DFP 2025 real)', () => {
  it('maior VERSAO por documento e dtEntregaOriginal = menor DT_RECEB (VALE3: v1 12/02, v2 12/03)', async () => {
    const zip = zipDfp2025(dir);
    const idx = await lerIndice(zip, await listarEntradasZip(zip), 'dfp', 2025);
    const vale = idx.get(chaveDoc(VALE, '2025-12-31'))!;
    expect(vale.versao).toBe(2);
    expect(vale.dtReceb).toBe('2026-03-12');
    expect(vale.dtEntregaOriginal).toBe('2026-02-12');
    expect(idx.get(chaveDoc(WEGE, '2025-12-31'))).toMatchObject({
      versao: 1,
      dtEntregaOriginal: '2026-02-25',
    });
    expect(idx.size).toBe(3);
  });

  it('filtro pelo universo (prefixo do CNPJ)', async () => {
    const zip = zipDfp2025(dir);
    const idx = await lerIndice(zip, await listarEntradasZip(zip), 'dfp', 2025, {
      cnpjs: new Set([WEGE]),
    });
    expect([...idx.keys()]).toEqual([chaveDoc(WEGE, '2025-12-31')]);
  });
});

describe('lerLinhasDemonstrativo', () => {
  it('header real do DFP aceito; só ÚLTIMO; ESCALA_MOEDA=MIL ⇒ ×1000, exceto o LPA (3.99)', async () => {
    const zip = zipDfp2025(dir);
    const entradas = await listarEntradasZip(zip);
    const linhas = await coletar(
      lerLinhasDemonstrativo(zip, acharEntrada(entradas, 'dfp_cia_aberta_DRE_con_2025.csv')!, {
        dem: 'DRE',
        escopo: 'con',
        docs: new Map([[chaveDoc(WEGE, '2025-12-31'), 1]]),
      }),
    );
    expect(linhas.length).toBeGreaterThan(10);
    expect(new Set(linhas.map((l) => l.cnpj))).toEqual(new Set([WEGE]));
    // o recorte tem ÚLTIMO e PENÚLTIMO: só o exercício 2025 passa
    expect(new Set(linhas.map((l) => l.dtFim))).toEqual(new Set(['2025-12-31']));
    const receita = linhas.find((l) => l.cdConta === '3.01')!;
    expect(receita.escala).toBe('MIL');
    expect(Math.round(receita.valor / 1e5) / 10).toBeGreaterThan(40_000); // R$ mil × 1000
    expect(linhas.find((l) => l.cdConta === '3.99.01.01')?.valor).toBe(1.51971);
    expect(linhas.every((l) => l.demonstrativo === 'DRE' && l.escopo === 'con')).toBe(true);
  });

  it('maior VERSAO: linha de versão anterior do mesmo documento é descartada', async () => {
    const original = fixture('dfp_cia_aberta_DRE_con_2025.csv');
    const linhaV2 = original
      .split('\n')
      .find((l) => l.startsWith(mascarar(VALE)) && l.includes(';3.01;'))!;
    const linhaV1 = linhaV2.replace(';2025-12-31;2;', ';2025-12-31;1;');
    const zip = montarZip(dir, 'versoes.zip', {
      'dfp_cia_aberta_DRE_con_2025.csv': `${original}${linhaV1}\n`,
    });
    const entradas = await listarEntradasZip(zip);
    const linhas = await coletar(
      lerLinhasDemonstrativo(zip, entradas[0], {
        dem: 'DRE',
        escopo: 'con',
        docs: new Map([[chaveDoc(VALE, '2025-12-31'), 2]]),
      }),
    );
    expect(linhas.filter((l) => l.cdConta === '3.01')).toHaveLength(1);
    expect(linhas.every((l) => l.versao === 2)).toBe(true);
  });

  it('coluna renomeada (layout mudou) ⇒ ErroLayoutFonte, nunca grava vazio', async () => {
    const zip = montarZip(dir, 'layout.zip', {
      'dfp_cia_aberta_DRE_con_2025.csv': fixture('dfp_cia_aberta_DRE_con_2025.csv').replace(
        'VL_CONTA',
        'VALOR_CONTA',
      ),
    });
    const entradas = await listarEntradasZip(zip);
    await expect(
      coletar(
        lerLinhasDemonstrativo(zip, entradas[0], {
          dem: 'DRE',
          escopo: 'con',
          docs: new Map([[chaveDoc(WEGE, '2025-12-31'), 1]]),
        }),
      ),
    ).rejects.toBeInstanceOf(ErroLayoutFonte);
  });

  it('header real do ITR aceito: 2T26 traz os períodos de 3 meses e YTD (DT_INI_EXERC)', async () => {
    const zip = zipItr(dir, 2026);
    const entradas = await listarEntradasZip(zip);
    const linhas = await coletar(
      lerLinhasDemonstrativo(zip, acharEntrada(entradas, 'itr_cia_aberta_DRE_con_2026.csv')!, {
        dem: 'DRE',
        escopo: 'con',
        docs: new Map([[chaveDoc(BBAS, '2026-06-30'), 1]]),
      }),
    );
    const inicios = new Set(linhas.filter((l) => l.cdConta === '3.11.01').map((l) => l.dtIni));
    expect(inicios).toEqual(new Set(['2026-01-01', '2026-04-01']));
    const ytd = linhas.find((l) => l.cdConta === '3.11.01' && l.dtIni === '2026-01-01')!;
    expect(ytd.valor).toBe(4_794_808_000);
  });

  it('composicao_capital sem unidade: VALE3 2025 publica 4.539.007 (milhares) — cru', async () => {
    const zip = zipDfp2025(dir);
    const entradas = await listarEntradasZip(zip);
    const comp = await lerComposicao(
      zip,
      acharEntrada(entradas, 'dfp_cia_aberta_composicao_capital_2025.csv')!,
      new Map([[chaveDoc(VALE, '2025-12-31'), 2]]),
    );
    expect(comp.get(chaveDoc(VALE, '2025-12-31'))).toMatchObject({ on: 4_539_007, tesOn: 270_228 });
  });

  it('criarInternador: cópia igual, uma instância por texto (não prende o bloco lido)', () => {
    const fixar = criarInternador();
    const bloco = `x;Receitas de Intermediação Financeira;y`;
    const a = fixar(bloco.slice(2, 38));
    const b = fixar(`Receitas de Intermediação Financeira`);
    expect(a).toBe('Receitas de Intermediação Financeira');
    expect(b).toBe(a);
  });

  it('valorEmReais', () => {
    expect(valorEmReais('1.5', 'MIL', '3.01')).toBe(1500);
    expect(valorEmReais('1.5', 'MIL', '3.99.01.01')).toBe(1.5);
    expect(valorEmReais('1.5', 'UNIDADE', '3.01')).toBe(1.5);
    expect(Number.isNaN(valorEmReais('', 'MIL', '3.01'))).toBe(true);
  });
});
