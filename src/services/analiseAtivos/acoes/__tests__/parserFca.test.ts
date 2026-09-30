import { mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, describe, expect, it } from 'vitest';
import { ErroLayoutFonte } from '@/services/analiseAtivos/fontes/erros';
import { listarEntradasZip } from '@/services/analiseAtivos/fontes/zipStream';
import { lerFca } from '@/services/analiseAtivos/acoes/parserFca';
import { fixture, montarZip, zipFca } from '@/services/analiseAtivos/acoes/__tests__/zipFixtures';

const dir = mkdtempSync(path.join(os.tmpdir(), 'parser-fca-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

async function ler(zip: string, ano = 2026) {
  return lerFca(zip, await listarEntradasZip(zip), ano);
}

describe('lerFca (FCA 2026 real)', () => {
  it('MGLU3 vem "Ações Preferenciais" no FCA ⇒ classe ON pelo sufixo (classeFca guarda o PN)', async () => {
    const r = await ler(zipFca(dir, 2026));
    const mglu = r.titulos.find((t) => t.symbol === 'MGLU3')!;
    expect(mglu.classeTitulo).toBe('ON');
    expect(mglu.classeFca).toBe('PN');
  });

  it('TAEE11 ⇒ UNIT com 1 ON + 2 PN; KLBN11 "1 KLBN3 + 4 KLBN4" ⇒ {on:1, pn:4}', async () => {
    const r = await ler(zipFca(dir, 2026));
    expect(r.titulos.find((t) => t.symbol === 'TAEE11')).toMatchObject({
      classeTitulo: 'UNIT',
      unitQtdOn: 1,
      unitQtdPn: 2,
      composicaoTexto: '1 ON / 2 PN',
      dataInicio: '2006-10-27',
      dataFim: null,
    });
    expect(r.titulos.find((t) => t.symbol === 'KLBN11')).toMatchObject({
      classeTitulo: 'UNIT',
      unitQtdOn: 1,
      unitQtdPn: 4,
    });
    expect(r.alertas).toEqual([]);
  });

  it('só ações em bolsa (debêntures de balcão fora); cadastro com mês de fim do exercício', async () => {
    const r = await ler(zipFca(dir, 2026));
    expect(r.titulos.map((t) => t.symbol)).toEqual([
      'BBAS3',
      'KLBN11',
      'MGLU3',
      'TAEE11',
      'TAEE3',
      'TAEE4',
      'VALE3',
      'WEGE3',
    ]);
    expect(r.cias.size).toBe(6);
    expect(r.cias.get('84429695000111')).toMatchObject({
      nome: 'WEG S.A.',
      mesFimExercicio: 12,
      dataRef: '2026-01-01',
    });
  });

  it('unit sem composição reconhecível ⇒ alerta unit_sem_composicao', async () => {
    const r = await ler(zipFca(dir, 2026, (vm) => vm.replace('1 ON / 2 PN', 'ver estatuto')));
    expect(r.alertas.map((a) => a.codigo)).toEqual(['unit_sem_composicao']);
    expect(r.titulos.find((t) => t.symbol === 'TAEE11')?.unitQtdOn).toBeNull();
  });

  it('Data_Fim_Negociacao preenchida ⇒ ticker encerrado', async () => {
    const ajustar = (vm: string) => vm.replace(';2017-12-22;;', ';2017-12-22;2026-06-30;');
    expect(ajustar(fixture('fca_cia_aberta_valor_mobiliario_2026.csv'))).toContain('2026-06-30');
    const r = await ler(zipFca(dir, 2026, ajustar));
    expect(r.titulos.find((t) => t.symbol === 'VALE3')).toMatchObject({
      dataInicio: '2017-12-22',
      dataFim: '2026-06-30',
    });
  });

  it('coluna obrigatória ausente ⇒ ErroLayoutFonte', async () => {
    const zip = montarZip(dir, 'fca_ruim.zip', {
      'fca_cia_aberta_geral_2026.csv': fixture('fca_cia_aberta_geral_2026.csv'),
      'fca_cia_aberta_valor_mobiliario_2026.csv': fixture(
        'fca_cia_aberta_valor_mobiliario_2026.csv',
      ).replace('Codigo_Negociacao', 'Codigo'),
    });
    await expect(ler(zip)).rejects.toBeInstanceOf(ErroLayoutFonte);
  });
});
