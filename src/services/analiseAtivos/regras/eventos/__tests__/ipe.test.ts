import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { lerCsv, type LinhaCsv } from '@/services/analiseAtivos/fontes/csvStream';
import { ErroLayoutFonte } from '@/services/analiseAtivos/fontes/erros';
import { especCsvIpe } from '@/services/analiseAtivos/eventos/ipeArquivos';
import {
  chaveAssembleia,
  classificarLinhaIpe,
  consolidarAssembleias,
  dataAssembleiaPlausivel,
  normalizarCnpj,
  parseLinhaIpe,
  type EventoIpe,
} from '@/services/analiseAtivos/regras/eventos/ipe';

// ≈30 linhas reais do ipe_cia_aberta_2026.csv (CVM, baixado em 30/09/2026), em latin1
const TEXTO = readFileSync(
  path.join(__dirname, 'fixtures/ipe_cia_aberta_2026_amostra.csv'),
).toString('latin1');
const LINHAS = TEXTO.split(/\r?\n/).filter((l) => l.length > 0);
const CABECALHO = LINHAS[0];

const BB = '00.000.000/0001-91';
const WEG = '84.429.695/0001-11';
const PETROBRAS = '33.000.167/0001-01';

async function* deArray(linhas: string[]): AsyncIterable<string> {
  for (const l of linhas) yield l;
}

async function lerLinhas(linhas: string[], comPreFiltro = false): Promise<LinhaCsv[]> {
  const spec = especCsvIpe(2026);
  const out: LinhaCsv[] = [];
  for await (const l of lerCsv(
    deArray(linhas),
    comPreFiltro ? spec : { ...spec, preFiltro: undefined },
  )) {
    out.push(l);
  }
  return out;
}

async function eventosDe(linhas: string[]): Promise<EventoIpe[]> {
  return (await lerLinhas(linhas)).map(parseLinhaIpe).filter((e): e is EventoIpe => e !== null);
}

describe('IPE — linha → assembleia', () => {
  it("'Assembleia;AGO;Edital de Convocação' real (WEG) ⇒ assembleia AGO na Data_Referencia", async () => {
    const edital = LINHAS.find((l) => l.startsWith('84.429.695') && l.includes(';AGO;Edital'))!;
    const [e] = await eventosDe([CABECALHO, edital]);
    expect(e).toMatchObject({
      cnpj: WEG,
      subtipo: 'AGO',
      data: '2026-04-23',
      especie: 'Edital de Convocação',
      dataEntrega: '2026-03-19',
      versao: 1,
    });
    expect(e.protocolo).toMatch(/^005410IPE/);
    expect(e.linkDownload).toMatch(/^https:\/\/www\.rad\.cvm\.gov\.br\/ENET\//);
    expect(chaveAssembleia(e)).toBe('AGO:2026-04-23');
  });

  it('categoria diferente de Assembleia é ignorada (Fato Relevante, Aviso aos Acionistas, Calendário…)', async () => {
    const outras = LINHAS.slice(1).filter((l) => l.split(';')[4] !== 'Assembleia');
    expect(outras.length).toBeGreaterThanOrEqual(4);
    const linhas = await lerLinhas([CABECALHO, ...outras]);
    expect(linhas.map((l) => classificarLinhaIpe(l))).toEqual(
      outras.map(() => ({ tipo: 'ignorada', motivo: 'categoria' })),
    );
  });

  it('o preFiltro do arquivo descarta as outras categorias antes do split', async () => {
    const todas = await lerLinhas(LINHAS, true);
    expect(todas.every((l) => l.get('Categoria') === 'Assembleia')).toBe(true);
    expect(todas.length).toBe(LINHAS.slice(1).filter((l) => l.includes(';Assembleia;')).length);
  });

  it('AGDEB (debenturistas) fica fora; data 3026-04-30 (erro de digitação real) é rejeitada', async () => {
    const agdeb = LINHAS.find((l) => l.includes(';AGDEB;'))!;
    const d3026 = LINHAS.find((l) => l.includes(';3026-04-30;'))!;
    const [a, b] = await lerLinhas([CABECALHO, agdeb, d3026]);
    expect(classificarLinhaIpe(a)).toEqual({ tipo: 'ignorada', motivo: 'tipo_assembleia' });
    expect(classificarLinhaIpe(b)).toEqual({ tipo: 'rejeitada', motivo: 'data_implausivel' });
    expect(dataAssembleiaPlausivel('2026-04-30', '2026-04-09')).toBe(true);
    expect(dataAssembleiaPlausivel('2025-04-30', '2026-02-01')).toBe(true);
  });

  it('Assunto com várias pautas (||) vira texto único de no máximo 200 caracteres', async () => {
    const edital = LINHAS.find((l) => l.startsWith('00.000.000/0001-91') && l.includes('Edital'))!;
    const [e] = await eventosDe([CABECALHO, edital]);
    expect(e.assunto!.length).toBeLessThanOrEqual(200);
    expect(e.assunto).not.toContain('||');
    expect(e.assunto!.startsWith('Autorizar a alienação')).toBe(true);
  });

  it('normalizarCnpj: máscara padronizada; emissor estrangeiro (00.000.000/0000-00) ⇒ null', () => {
    expect(normalizarCnpj('00.000.000/0001-91')).toBe(BB);
    expect(normalizarCnpj('00.000.000/0000-00')).toBeNull();
    expect(normalizarCnpj('123')).toBeNull();
  });

  it('header sem Data_Referencia ⇒ ErroLayoutFonte (falha alto, não grava vazio)', async () => {
    const semData = CABECALHO.replace('Data_Referencia', 'Data_Ref');
    await expect(lerLinhas([semData, LINHAS[1]])).rejects.toBeInstanceOf(ErroLayoutFonte);
    await expect(lerLinhas([semData, LINHAS[1]])).rejects.toThrow(/Data_Referencia/);
  });
});

describe('consolidarAssembleias', () => {
  it('Ata posterior da mesma assembleia não duplica (WEG AGO 23/04/2026: 6 documentos ⇒ 1 evento, do Edital)', async () => {
    const weg = LINHAS.filter((l) => l.startsWith('84.429.695') && l.includes(';Assembleia;'));
    expect(weg.length).toBe(6);
    const eventos = consolidarAssembleias(await eventosDe([CABECALHO, ...weg]));
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({
      cnpj: WEG,
      subtipo: 'AGO',
      data: '2026-04-23',
      especie: 'Edital de Convocação',
    });
  });

  it('BB: documentos AGO, AGE e AGO/E do mesmo dia ⇒ um só evento AGO/AGE', async () => {
    const bb = LINHAS.filter(
      (l) => l.startsWith('00.000.000/0001-91') && l.includes(';Assembleia;'),
    );
    const eventos = consolidarAssembleias(await eventosDe([CABECALHO, ...bb]));
    expect(eventos.map((e) => [e.cnpj, e.subtipo, e.data])).toEqual([
      [BB, 'AGO/AGE', '2026-04-29'],
    ]);
    expect(eventos[0].especie).toBe('Edital de Convocação');
  });

  it('linha repetida no arquivo (PPLA, mesmo protocolo e versão) ⇒ 1 evento', async () => {
    const ppla = LINHAS.filter((l) => l.startsWith('15.073.274'));
    expect(ppla).toHaveLength(2);
    expect(consolidarAssembleias(await eventosDe([CABECALHO, ...ppla]))).toHaveLength(1);
  });

  it('versão maior do mesmo protocolo substitui (e pode remarcar a data)', async () => {
    const petro = LINHAS.filter((l) => l.startsWith('33.000.167') && l.includes(';Assembleia;'));
    const eventos = await eventosDe([CABECALHO, ...petro]);
    const edital = eventos.find((e) => e.especie === 'Edital de Convocação')!;
    // v2 do edital remarcando a AGO para 30/04 (o arquivo do ano só traz a última versão de cada
    // protocolo; a v2 é a linha real com Versao/Data_Referencia trocadas)
    const v2: EventoIpe = { ...edital, versao: 2, data: '2026-04-30', dataEntrega: '2026-04-01' };
    const soEdital = consolidarAssembleias([edital, v2]);
    expect(soEdital).toHaveLength(1);
    expect(soEdital[0]).toMatchObject({ data: '2026-04-30', versao: 2 });
    // os demais documentos continuam sustentando a data antiga
    const todos = consolidarAssembleias([...eventos, v2]);
    expect(todos.map((e) => [e.subtipo, e.data, e.versao])).toEqual([
      ['AGO', '2026-04-16', 1],
      ['AGO', '2026-04-30', 2],
    ]);
    expect(todos[0].cnpj).toBe(PETROBRAS);
  });

  it('arquivo inteiro da amostra: 1 evento por (cnpj, subtipo, data), ordenado', async () => {
    const eventos = consolidarAssembleias(await eventosDe(LINHAS));
    const chaves = eventos.map((e) => `${e.cnpj}|${chaveAssembleia(e)}`);
    expect(new Set(chaves).size).toBe(chaves.length);
    expect(eventos.map((e) => e.cnpj)).toEqual([...eventos.map((e) => e.cnpj)].sort());
    expect(eventos.map((e) => e.cnpj)).toEqual(
      expect.arrayContaining([BB, WEG, PETROBRAS, '15.073.274/0001-88']),
    );
  });
});
