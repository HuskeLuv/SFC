import { describe, expect, it } from 'vitest';
import {
  BLOCOS_REPORTE,
  CAMPOS_REPORTAVEIS,
  LIMITES,
  STATUS_CASO,
  TRANSICOES,
  campoPertenceAoGrupo,
  campoReportavel,
  camposReportaveisValidos,
  chaveCaso,
  contemHtml,
  dataCivilSaoPaulo,
  diasUteisRestantes,
  efeitoTelaValido,
  ehLiberacao,
  gerarProtocolo,
  idadeDiasUteis,
  podeTransitar,
  protocoloValido,
  resolucaoValida,
  sanearTextoLivre,
  sanearTextoLivreComContagem,
  situacaoPrazo,
  slaAte,
  statusParaUsuario,
} from '@/services/analiseAtivos/curadoria/contrato';

describe('transições do caso', () => {
  it('aberto ↔ em_analise; ambos fecham; fechado é final', () => {
    expect(podeTransitar('aberto', 'em_analise')).toBe(true);
    expect(podeTransitar('em_analise', 'aberto')).toBe(true);
    for (const de of ['aberto', 'em_analise'] as const) {
      expect(podeTransitar(de, 'corrigido')).toBe(true);
      expect(podeTransitar(de, 'rejeitado')).toBe(true);
    }
    for (const de of ['corrigido', 'rejeitado'] as const) {
      for (const para of STATUS_CASO) expect(podeTransitar(de, para)).toBe(false);
      expect(TRANSICOES[de]).toEqual([]);
    }
    expect(podeTransitar('aberto', 'aberto')).toBe(false);
  });

  it('resolução obrigatória e coerente ao fechar', () => {
    expect(resolucaoValida('corrigido', 'corrigido_fonte')).toBe(true);
    expect(resolucaoValida('corrigido', 'dado_confirmado')).toBe(false);
    expect(resolucaoValida('rejeitado', 'sem_procedencia')).toBe(true);
    expect(resolucaoValida('rejeitado', null)).toBe(false);
    expect(resolucaoValida('rejeitado', undefined)).toBe(false);
  });

  it('liberar o valor só com rejeitado/dado_confirmado', () => {
    expect(efeitoTelaValido('rejeitado', 'dado_confirmado', 'liberar_valor')).toBe(true);
    expect(efeitoTelaValido('rejeitado', 'sem_procedencia', 'liberar_valor')).toBe(false);
    expect(efeitoTelaValido('corrigido', 'corrigido_fonte', 'liberar_valor')).toBe(false);
    expect(efeitoTelaValido('em_analise', null, 'manter_conferencia')).toBe(true);
    expect(
      ehLiberacao({
        status: 'rejeitado',
        resolucao: 'dado_confirmado',
        efeitoTela: 'liberar_valor',
      }),
    ).toBe(true);
    expect(
      ehLiberacao({ status: 'rejeitado', resolucao: 'dado_confirmado', efeitoTela: 'sem_efeito' }),
    ).toBe(false);
  });

  it('rejeitado aparece ao usuário como "conferido, sem alteração"', () => {
    expect(statusParaUsuario('rejeitado')).toBe('conferido_sem_alteracao');
    expect(statusParaUsuario('em_analise')).toBe('em_analise');
  });
});

describe('prazo em dias úteis (calendário B3)', () => {
  it('relato na sexta 09/10/2026: 12/10 é feriado e o fim de semana não conta → 19/10', () => {
    expect(slaAte('2026-10-09')).toBe('2026-10-19');
  });

  it('relato no sábado 10/10: conta a partir de terça 13/10 → 19/10', () => {
    expect(slaAte('2026-10-10')).toBe('2026-10-19');
  });

  it('relato na quarta 30/09/2026 → 07/10', () => {
    expect(slaAte('2026-09-30')).toBe('2026-10-07');
  });

  it('Date usa o dia civil de São Paulo (02:00 UTC de sábado = sexta à noite em SP)', () => {
    const d = new Date('2026-10-10T02:00:00Z');
    expect(dataCivilSaoPaulo(d)).toBe('2026-10-09');
    expect(slaAte(d)).toBe('2026-10-19');
  });

  it('dias úteis restantes, vence hoje e vencido', () => {
    expect(diasUteisRestantes('2026-10-19', '2026-10-09')).toBe(5);
    expect(diasUteisRestantes('2026-10-19', '2026-10-16')).toBe(1);
    expect(diasUteisRestantes('2026-10-19', '2026-10-19')).toBe(0);
    expect(diasUteisRestantes('2026-10-19', '2026-10-20')).toBe(-1);
    // sexta prazo, sábado: já vencido (não "vence hoje")
    expect(diasUteisRestantes('2026-10-16', '2026-10-17')).toBe(-1);
    expect(diasUteisRestantes('2026-10-16', '2026-10-21')).toBe(-3);
  });

  it('situação do prazo', () => {
    expect(situacaoPrazo(null, '2026-10-09')).toBe('sem_prazo');
    expect(situacaoPrazo('2026-10-19', '2026-10-09')).toBe('no_prazo');
    expect(situacaoPrazo('2026-10-19', '2026-10-15')).toBe('vencendo');
    expect(situacaoPrazo('2026-10-19', '2026-10-19')).toBe('vence_hoje');
    expect(situacaoPrazo('2026-10-19', '2026-10-20')).toBe('vencido');
  });

  it('idade em dias úteis', () => {
    expect(idadeDiasUteis('2026-10-09', '2026-10-13')).toBe(1);
    expect(idadeDiasUteis('2026-10-09', '2026-10-09')).toBe(0);
  });
});

describe('sanearTextoLivre e contemHtml', () => {
  it('remove U+202E, U+200B, U+FEFF, U+00AD e \\u0007; mantém acentos, emoji, \\n', () => {
    const entrada = 'Pay\u202Eout \u200Berrado\uFEFF\u0007: ação\u00AD vale 52% 😀\nlinha 2';
    const r = sanearTextoLivreComContagem(entrada);
    expect(r.texto).toBe('Payout errado: ação vale 52% 😀\nlinha 2');
    expect(r.removidos).toBe(5);
  });

  it('bidi isolates (U+2066–U+2069) e zero-width joiner saem', () => {
    expect(sanearTextoLivre('a\u2066b\u2069c\u200Dd\u200Ee')).toBe('abcde');
  });

  it('NFC, CRLF → LF, espaços colapsados, ≥ 3 quebras viram 2, aparo', () => {
    expect(sanearTextoLivre('  água   e\t\tmar \r\n\r\n\r\n\r\nfim  ')).toBe('água e mar\n\nfim');
  });

  it('contemHtml', () => {
    expect(contemHtml('<script>alert(1)</script>')).toBe(true);
    expect(contemHtml('veja <a href="x">aqui</a>')).toBe(true);
    expect(contemHtml('<!-- x -->')).toBe(true);
    expect(contemHtml('</b>')).toBe(true);
    expect(contemHtml('P/L < 5 e DY > 3')).toBe(false);
    expect(contemHtml('1<2')).toBe(false);
  });
});

describe('blocos, campos e chave do caso', () => {
  it('campos reportáveis existem; "outro" vale em todo bloco; carteira/tese/educação fora', () => {
    expect(camposReportaveisValidos()).toBe(true);
    for (const b of BLOCOS_REPORTE) expect(campoReportavel(b, 'outro')).toBe(true);
    expect(campoReportavel('kpis', 'payout')).toBe(true);
    expect(campoReportavel('kpis', 'receita')).toBe(false);
    expect(campoReportavel('pares', 'pl')).toBe(false);
    expect(BLOCOS_REPORTE as readonly string[]).not.toContain('tese');
    expect(BLOCOS_REPORTE as readonly string[]).not.toContain('carteira');
    expect(Object.keys(CAMPOS_REPORTAVEIS).sort()).toEqual([...BLOCOS_REPORTE].sort());
  });

  it('campoPertenceAoGrupo: só campos do grupo; outro/grupo inválido nunca', () => {
    expect(campoPertenceAoGrupo('dy12m', 'preco_base')).toBe(true);
    expect(campoPertenceAoGrupo('preco', 'preco_base')).toBe(true);
    expect(campoPertenceAoGrupo('payout', 'preco_base')).toBe(false);
    expect(campoPertenceAoGrupo('payout', 'proventos')).toBe(true);
    expect(campoPertenceAoGrupo('outro', 'proventos')).toBe(false);
    expect(campoPertenceAoGrupo('pl', 'outro')).toBe(false);
    expect(campoPertenceAoGrupo('vacanciaCvm', 'manual')).toBe(false);
  });

  it('chaveCaso normaliza symbol e período', () => {
    expect(chaveCaso({ symbol: ' wege3 ', campo: 'payout', periodo: ' 2025 ' })).toBe(
      'WEGE3|payout|2025',
    );
    expect(chaveCaso({ symbol: 'WEGE3', campo: 'payout' })).toBe('WEGE3|payout|');
    expect(chaveCaso({ symbol: 'WEGE3', campo: 'payout', periodo: null })).toBe('WEGE3|payout|');
  });

  it('limites aprovados (decisão 6)', () => {
    expect(LIMITES).toMatchObject({
      porDia: 5,
      porHoraAtivo: 3,
      globalDia: 300,
      abertosPorDado: 1,
      mensagemMin: 10,
      mensagemMax: 1000,
      respostaPublica: 500,
    });
  });
});

describe('protocolo', () => {
  it('8 caracteres do alfabeto sem ambíguos', () => {
    for (let i = 0; i < 50; i += 1) {
      const p = gerarProtocolo();
      expect(p).toHaveLength(8);
      expect(protocoloValido(p)).toBe(true);
      expect(p).not.toMatch(/[01OIL]/);
    }
    expect(gerarProtocolo(() => new Uint8Array(8))).toBe('22222222');
    expect(protocoloValido('ABC')).toBe(false);
  });
});
