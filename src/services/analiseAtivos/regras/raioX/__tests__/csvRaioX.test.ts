import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }));

import { gerarCsvRaioX, numeroCsv, textoCsv } from '../csvRaioX';
import { montarAcao } from '@/services/analiseAtivos/leitura/ativo/raioX';
import { RODAPE_LEGAL } from '@/services/analiseAtivos/textosTela';
import { nomeArquivoCsvRaioX } from '@/services/analiseAtivos/cenarios/contrato';
import { HOJE_DEV, dadosAcaoDev } from '@/test/fixtures/analiseAtivos/raioXDev';
import type { RaioXResposta } from '@/types/analiseAtivosBlocoD';

const RESPOSTA: RaioXResposta = {
  ticker: 'TEST3',
  classe: 'acao',
  nome: 'Teste S.A.',
  variante: 'acao',
  unidade: 'R$ mi',
  base: 'ano fiscal',
  fonte: 'CVM',
  padraoContabil: 'IFRS',
  escopo: 'con',
  anos: [2025, 2024],
  blocos: [
    {
      codigo: 'lucro_caixa',
      rotulo: 'Lucro e geração de caixa',
      linhas: [
        {
          codigo: 'receita',
          rotulo: 'Receita líquida',
          sub: null,
          tipo: 'valor',
          formato: 'moedaMi',
          fonteCvmAviso: false,
          campoConferencia: 'receita',
          valores: {
            2025: { estado: 'ok', valor: 40804.11 },
            2024: { estado: 'ok', valor: -1234.5 },
          },
          selos: {},
          conferencias: {},
          observacao: null,
        },
        {
          codigo: 'lpa',
          rotulo: 'LPA (R$)',
          sub: null,
          tipo: 'valor',
          formato: 'moeda',
          fonteCvmAviso: false,
          campoConferencia: 'lpa',
          valores: {
            2025: {
              estado: 'ausente',
              motivo: 'per_share_em_conferencia',
              texto: 'base quebrada',
              exibicao: 'ocultar',
              valorNaoPublicado: 185.9,
            },
            2024: { estado: 'ok', valor: 1.51970472 },
          },
          selos: {},
          conferencias: { 2025: { exibicao: 'ocultar', motivo: 'base; "quebrada"' } },
          observacao: null,
        },
        {
          codigo: 'margemBrutaPct',
          rotulo: '=1+1',
          sub: null,
          tipo: 'razao',
          formato: 'pct',
          fonteCvmAviso: false,
          campoConferencia: null,
          valores: {
            2025: { estado: 'nao_se_aplica', motivo: 'financeira', texto: 'n/a' },
            2024: { estado: 'ok', valor: -0.0001 },
          },
          selos: {},
          conferencias: {},
          observacao: null,
        },
      ],
    },
  ],
  observacoes: ['-perigo', 'Linha com\nquebra'],
  linhasNaoAplicaveis: [],
  versao: 'v',
};

describe('gerarCsvRaioX', () => {
  it('byte a byte: BOM, ";", vírgula decimal, CRLF, escape, injeção e rodapé legal', () => {
    const csv = gerarCsvRaioX(RESPOSTA, { hoje: '2026-10-08', versaoParams: 2 });
    const esperado =
      '﻿' +
      [
        'Linha;2025;2024',
        'Lucro e geração de caixa;;',
        'Receita líquida (R$ mi);40804,11;-1234,50',
        'LPA (R$);;1,5197',
        "'=1+1 (%);n/a;0,00",
        '',
        'Em conferência',
        '"2025 · LPA (R$): base; ""quebrada"""',
        '',
        'Sobre os dados',
        "'-perigo",
        '"Linha com\nquebra"',
        '',
        'Fonte;CVM (DFP/ITR, informes de FII) · B3 · cálculos do My Finance',
        'Gerado em;08/10/2026',
        'Parâmetros;v2',
        `Aviso legal;"${RODAPE_LEGAL}"`,
      ].join('\r\n') +
      '\r\n';
    expect(csv).toBe(esperado);
  });

  it('WEGE3 do DEV: sem "Notas", só CRLF, números como números e nenhum dado de usuário', () => {
    const { raioX } = montarAcao(HOJE_DEV, dadosAcaoDev('WEGE3'));
    const csv = gerarCsvRaioX(
      { ...raioX, ticker: 'WEGE3', classe: 'acao', nome: 'WEG S.A.', versao: 'v' },
      { hoje: HOJE_DEV, versaoParams: 2 },
    );
    expect(csv.startsWith('﻿Linha;2025;2024;2023')).toBe(true);
    expect(csv).not.toMatch(/(^|[^\p{L}])notas?(?!\p{L})/iu);
    expect(csv.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    expect(csv).toContain('\r\nReceita líquida (R$ mi);40804,11;37986,94;');
    expect(csv).toContain('\r\nCaixa de financiamento (R$ mi);-4362,86;');
    expect(csv).toContain('\r\nLPA (R$);1,5197;');
    expect(csv).not.toContain('FCF');
    expect(csv).not.toMatch(/@|usuario|email/i);
  });

  it('nome do arquivo (decisão 13)', () => {
    expect(nomeArquivoCsvRaioX('WEGE3', '2026-10-08')).toBe('raio-x_WEGE3_2026-10-08.csv');
  });

  it('helpers', () => {
    expect(numeroCsv(-0.004, 2)).toBe('0,00');
    expect(numeroCsv(1234567.891, 2)).toBe('1234567,89');
    expect(numeroCsv(12, 0)).toBe('12');
    for (const c of ['=1+1', '+1', '-1', '@SUM(A1)', '\tx', '\rx']) {
      expect(textoCsv(c).startsWith("'") || textoCsv(c).startsWith('"\'')).toBe(true);
    }
    expect(textoCsv('a;b')).toBe('"a;b"');
    expect(textoCsv('normal')).toBe('normal');
  });
});
