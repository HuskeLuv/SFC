import AdmZip from 'adm-zip';
import { mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, describe, expect, it } from 'vitest';
import { ErroLayoutFonte } from '@/services/analiseAtivos/fontes/erros';
import {
  fimDoTrimestre,
  inicioDoMes,
  anosDoCron,
  urlInformeFii,
} from '@/services/analiseAtivos/fii/fiiArquivos';
import {
  lerInformeMensalLinhas,
  lerInformeMensalZip,
} from '@/services/analiseAtivos/fii/parserInformeMensal';
import { lerInformeTrimestralZip } from '@/services/analiseAtivos/fii/parserInformeTrimestral';
import { assertUrlPermitida } from '@/services/analiseAtivos/fontes/allowlist';
import { SCORING_PARAMS_V1 as P } from '@/services/analiseAtivos/params/scoringParamsV1';
import {
  CNPJ,
  linhasFixture,
  linhasTexto,
  mensalFixture,
  textoFixture,
} from '@/services/analiseAtivos/regras/fii/__tests__/fixturesFii';

/** CNPJ de 14 dígitos na máscara da CVM (as linhas cruas das fixtures vêm assim). */
const mascarar = (c: string) =>
  `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;

const dir = mkdtempSync(path.join(os.tmpdir(), 'fii-parsers-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function zipDe(nome: string, entradas: Record<string, string>): string {
  const z = new AdmZip();
  for (const [n, fixture] of Object.entries(entradas)) {
    z.addFile(n, Buffer.from(textoFixture(fixture), 'latin1'));
  }
  const caminho = path.join(dir, nome);
  z.writeZip(caminho);
  return caminho;
}

describe('parserInformeMensal', () => {
  it('lê o zip anual em streaming (layout 2021+, pós-ago/2025 com Mandato vazio)', async () => {
    const caminho = zipDe('inf_mensal_fii_2026.zip', {
      'inf_mensal_fii_geral_2026.csv': 'inf_mensal_fii_geral_2026_amostra.csv',
      'inf_mensal_fii_complemento_2026.csv': 'inf_mensal_fii_complemento_2026_amostra.csv',
      'inf_mensal_fii_ativo_passivo_2026.csv': 'inf_mensal_fii_ativo_passivo_2026_amostra.csv',
    });
    const r = await lerInformeMensalZip(caminho, { arquivo: 'inf_mensal_fii_2026.zip', params: P });
    const hglg = r.meses.find((m) => m.cnpj === CNPJ.HGLG && m.refMonth === '2026-08-01')!;
    expect(hglg).toMatchObject({ versao: 2, cotistas: 608_345, temComposicao: true });
    expect(hglg.dtEntrega).toMatch(/^2026-\d{2}-\d{2}$/);
    expect(r.geral.get(`${CNPJ.HGLG}|2026-08-01`)).toMatchObject({
      isin: 'BRHGLGCTF004',
      bolsa: true,
    });
    expect(r.linhasLidas).toBeGreaterThan(90);
    expect(r.rejeitadas).toBe(0);
  });

  it('filtra cedo pelos CNPJs pedidos (preFiltro na linha crua)', async () => {
    const r = await lerInformeMensalLinhas(
      {
        geral: linhasFixture('inf_mensal_fii_geral_2026_amostra.csv'),
        complemento: linhasFixture('inf_mensal_fii_complemento_2026_amostra.csv'),
        ativo_passivo: linhasFixture('inf_mensal_fii_ativo_passivo_2026_amostra.csv'),
      },
      { arquivo: 'x', params: P, cnpjs: new Set([CNPJ.KNRI]) },
    );
    expect(new Set(r.meses.map((m) => m.cnpj))).toEqual(new Set([CNPJ.KNRI]));
    expect(r.meses.map((m) => m.refMonth)).toEqual(['2026-06-01', '2026-07-01', '2026-08-01']);
  });

  it('layout 2016–2020 (CNPJ_Fundo/Nome_Fundo, sem CRI_CRA/LCI_LCA) é aceito', async () => {
    const r = await mensalFixture('2016_antigo');
    expect(r.meses.length).toBe(5);
    const g = [...r.geral.values()][0];
    expect(g.cnpj).toMatch(/^\d{14}$/);
    expect(g.nome).not.toBe('');
    expect(r.meses.every((m) => m.temComposicao)).toBe(true);
  });

  it('coluna obrigatória sumida ⇒ ErroLayoutFonte (falha alto)', async () => {
    const texto = textoFixture('inf_mensal_fii_complemento_2026_amostra.csv').replace(
      'Patrimonio_Liquido',
      'PL_Renomeado',
    );
    await expect(
      lerInformeMensalLinhas(
        {
          geral: linhasFixture('inf_mensal_fii_geral_2026_amostra.csv'),
          complemento: linhasTexto(texto),
          ativo_passivo: null,
        },
        { arquivo: 'inf_mensal_fii_2026.zip', params: P },
      ),
    ).rejects.toBeInstanceOf(ErroLayoutFonte);
  });

  it('zip sem a entrada ativo_passivo ⇒ ErroLayoutFonte', async () => {
    const caminho = zipDe('sem_ap.zip', {
      'inf_mensal_fii_geral_2026.csv': 'inf_mensal_fii_geral_2026_amostra.csv',
      'inf_mensal_fii_complemento_2026.csv': 'inf_mensal_fii_complemento_2026_amostra.csv',
    });
    await expect(
      lerInformeMensalZip(caminho, { arquivo: 'sem_ap.zip', params: P }),
    ).rejects.toBeInstanceOf(ErroLayoutFonte);
  });

  it('fica com a MAIOR Versao por (CNPJ, mês) — reenvio', async () => {
    const orig = textoFixture('inf_mensal_fii_complemento_2026_amostra.csv').split('\n');
    const linhaHglg = orig.find(
      (l) => l.startsWith(mascarar(CNPJ.HGLG)) && l.includes(';2026-08-01;'),
    )!;
    const reenvio = linhaHglg
      .replace(';2026-08-01;2;', ';2026-08-01;3;')
      .replace(';608345;', ';999999;');
    const antigo = linhaHglg.replace(';2026-08-01;2;', ';2026-08-01;1;').replace(';608345;', ';1;');
    const r = await lerInformeMensalLinhas(
      {
        geral: linhasFixture('inf_mensal_fii_geral_2026_amostra.csv'),
        complemento: linhasTexto([orig[0], reenvio, linhaHglg, antigo].join('\n')),
        ativo_passivo: null,
      },
      { arquivo: 'x', params: P },
    );
    expect(r.meses[0]).toMatchObject({ versao: 3, cotistas: 999_999, temComposicao: false });
  });
});

describe('parserInformeTrimestral', () => {
  it('lê imóvel/ativo/complemento/resultado e normaliza para o fim do trimestre', async () => {
    const caminho = zipDe('inf_trimestral_fii_2026.zip', {
      'inf_trimestral_fii_imovel_2026.csv': 'inf_trimestral_fii_imovel_2026_amostra.csv',
      'inf_trimestral_fii_alienacao_imovel_2026.csv': 'inf_trimestral_fii_imovel_2026_amostra.csv',
      'inf_trimestral_fii_ativo_2026.csv': 'inf_trimestral_fii_ativo_2026_kncr.csv',
      'inf_trimestral_fii_complemento_2026.csv': 'inf_trimestral_fii_complemento_2026_amostra.csv',
      'inf_trimestral_fii_resultado_contabil_financeiro_2026.csv':
        'inf_trimestral_fii_resultado_2026_amostra.csv',
    });
    const r = await lerInformeTrimestralZip(caminho, { arquivo: 'inf_trimestral_fii_2026.zip' });
    const hglg = r.trimestres.find((t) => t.cnpj === CNPJ.HGLG)!;
    expect(hglg.refQuarter).toBe('2026-06-30');
    expect(hglg.imoveis).toHaveLength(37); // a entrada alienacao_imovel não é confundida
    expect(hglg.faixas).not.toBeNull();
    expect(hglg.receitaAluguel).toBeGreaterThan(0);
    const kncr = r.trimestres.find((t) => t.cnpj === CNPJ.KNCR)!;
    expect(kncr.ativos).toHaveLength(152);
  });

  it('fimDoTrimestre/inicioDoMes', () => {
    expect(fimDoTrimestre('2026-03-30')).toBe('2026-03-31');
    expect(fimDoTrimestre('2026-06-01')).toBe('2026-06-30');
    expect(fimDoTrimestre('2025-12-31')).toBe('2025-12-31');
    expect(inicioDoMes('2026-08-15')).toBe('2026-08-01');
  });
});

describe('fontes FII', () => {
  it('URLs só na allowlist (CVM e B3)', () => {
    expect(() => assertUrlPermitida(urlInformeFii('mensal', 2026))).not.toThrow();
    expect(() => assertUrlPermitida(urlInformeFii('trimestral', 2016))).not.toThrow();
  });

  it('anosDoCron: ano−1 só nos primeiros meses', () => {
    expect(anosDoCron('2026-02-10', 2)).toEqual([2025, 2026]);
    expect(anosDoCron('2026-03-01', 2)).toEqual([2026]);
    expect(anosDoCron('2026-03-01', 3)).toEqual([2025, 2026]);
  });
});
