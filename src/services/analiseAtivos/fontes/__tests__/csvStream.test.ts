import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { lerCsv, type EspecCsv, type LinhaCsv } from '@/services/analiseAtivos/fontes/csvStream';
import { ErroLayoutFonte } from '@/services/analiseAtivos/fontes/erros';

const FIX = path.join(__dirname, 'fixtures');

/** Simula linhasDaEntrada: bytes latin1 → string, split por \n, remove \r. */
async function* linhasLatin1(arquivo: string): AsyncIterable<string> {
  const texto = readFileSync(path.join(FIX, arquivo)).toString('latin1');
  for (const l of texto.split('\n')) yield l.endsWith('\r') ? l.slice(0, -1) : l;
}

async function* deArray(linhas: string[]): AsyncIterable<string> {
  for (const l of linhas) yield l;
}

async function coletar(it: AsyncIterable<LinhaCsv>): Promise<LinhaCsv[]> {
  const out: LinhaCsv[] = [];
  for await (const l of it) out.push(l);
  return out;
}

const COLS_DRE = [
  'CNPJ_CIA',
  'DT_REFER',
  'VERSAO',
  'CD_CVM',
  'ORDEM_EXERC',
  'DT_INI_EXERC',
  'DT_FIM_EXERC',
  'CD_CONTA',
  'DS_CONTA',
  'VL_CONTA',
  'ESCALA_MOEDA',
  'ST_CONTA_FIXA',
];

describe('lerCsv', () => {
  it('header real da DRE (CNPJ_CIA;DT_REFER;VERSAO;…;ST_CONTA_FIXA) passa e latin1 sai certo', async () => {
    const linhas = await coletar(
      lerCsv(linhasLatin1('dfp_cia_aberta_DRE_con_amostra.csv'), {
        separador: ';',
        obrigatorias: COLS_DRE,
      }),
    );
    expect(linhas.length).toBeGreaterThan(10);
    const receita = linhas.find(
      (l) => l.get('CD_CONTA') === '3.01' && l.get('ORDEM_EXERC') === 'ÚLTIMO',
    );
    expect(receita).toBeDefined();
    expect(receita!.get('CNPJ_CIA')).toBe('84.429.695/0001-11');
    expect(receita!.get('ESCALA_MOEDA')).toBe('MIL');
    expect(linhas.some((l) => l.get('ORDEM_EXERC') === 'PENÚLTIMO')).toBe(true);
    expect(receita!.get('DS_CONTA')).toMatch(/^Receita de Venda de Bens e\/ou Serviços$/);
  });

  it("header sem VL_CONTA ⇒ ErroLayoutFonte com faltando=['VL_CONTA']", async () => {
    const semVl =
      'CNPJ_CIA;DT_REFER;VERSAO;CD_CVM;ORDEM_EXERC;DT_INI_EXERC;DT_FIM_EXERC;CD_CONTA;DS_CONTA;ESCALA_MOEDA;ST_CONTA_FIXA';
    const erro = await coletar(
      lerCsv(deArray([semVl, 'x']), { separador: ';', obrigatorias: COLS_DRE, arquivo: 'DRE' }),
    ).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroLayoutFonte);
    expect((erro as ErroLayoutFonte).faltando).toEqual(['VL_CONTA']);
    expect((erro as ErroLayoutFonte).codigo).toBe('layout_mudou');
  });

  it('arquivo vazio ⇒ ErroLayoutFonte com todas as obrigatórias', async () => {
    await expect(
      coletar(lerCsv(deArray([]), { separador: ';', obrigatorias: ['A', 'B'] })),
    ).rejects.toMatchObject({ faltando: ['A', 'B'] });
  });

  it('alias CNPJ_Fundo → CNPJ_Fundo_Classe (layout 2016–2020, header latin1 real)', async () => {
    const spec: EspecCsv = {
      separador: ';',
      obrigatorias: ['CNPJ_Fundo_Classe', 'Data_Referencia', 'Versao', 'Patrimonio_Liquido'],
      aliases: { CNPJ_Fundo: 'CNPJ_Fundo_Classe' },
    };
    const linhas = await coletar(
      lerCsv(linhasLatin1('inf_mensal_fii_complemento_2016_layout_antigo.csv'), spec),
    );
    expect(linhas.length).toBeGreaterThan(0);
    expect(linhas[0].get('CNPJ_Fundo_Classe')).toMatch(/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/);
    // coluna com acento no header latin1 do arquivo real
    expect(linhas[0].tem('Numero_Cotistas_Entidade_Fechada_Previdência_Complementar')).toBe(true);
  });

  it('sem o alias, o layout antigo falha alto', async () => {
    await expect(
      coletar(
        lerCsv(linhasLatin1('inf_mensal_fii_complemento_2016_layout_antigo.csv'), {
          separador: ';',
          obrigatorias: ['CNPJ_Fundo_Classe'],
        }),
      ),
    ).rejects.toBeInstanceOf(ErroLayoutFonte);
  });

  it('preFiltro por prefixo de CNPJ recebe a linha crua e descarta antes do split', async () => {
    const preFiltro = vi.fn((bruta: string) => bruta.startsWith('84.429.695'));
    const linhas = await coletar(
      lerCsv(
        deArray([
          'CNPJ;V',
          '84.429.695/0001-11;1',
          '33.000.167/0001-01;"2;3"',
          '84.429.695/0001-11;4',
        ]),
        {
          separador: ';',
          obrigatorias: ['CNPJ', 'V'],
          preFiltro,
        },
      ),
    );
    expect(preFiltro).toHaveBeenCalledWith('33.000.167/0001-01;"2;3"');
    expect(linhas.map((l) => l.get('V'))).toEqual(['1', '4']);
  });

  it('latin1: ÚLTIMO e Patrimônio Líquido decodificados; \\r\\n tratado; aspas e BOM', async () => {
    const bytes = Buffer.from(
      '﻿ORDEM;DS;TXT\r\nÚLTIMO;Patrimônio Líquido;"com ; dentro"\r\nPENÚLTIMO;x;10"\r\n',
      'utf8',
    );
    const texto = bytes.toString('utf8');
    const linhas = await coletar(
      lerCsv(deArray(texto.split('\n').map((l) => l.replace(/\r$/, ''))), {
        separador: ';',
        obrigatorias: ['ORDEM', 'DS', 'TXT'],
      }),
    );
    expect(linhas[0].get('ORDEM')).toBe('ÚLTIMO');
    expect(linhas[0].get('DS')).toBe('Patrimônio Líquido');
    expect(linhas[0].get('TXT')).toBe('com ; dentro');
    expect(linhas[1].get('TXT')).toBe('10"');

    const latin1 = Buffer.from('DS\r\nPatrimônio Líquido\r\n', 'latin1').toString('latin1');
    const [l] = await coletar(
      lerCsv(deArray(latin1.split('\n').map((x) => x.replace(/\r$/, ''))), {
        separador: ';',
        obrigatorias: ['DS'],
      }),
    );
    expect(l.get('DS')).toBe('Patrimônio Líquido');
  });

  it('coluna inexistente em get() lança (erro de programação, não string vazia)', async () => {
    const [l] = await coletar(lerCsv(deArray(['A', '1']), { separador: ';', obrigatorias: ['A'] }));
    expect(() => l.get('B')).toThrow();
  });
});
