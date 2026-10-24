/**
 * A6 (fundamentei-trazer, fatia 0): os textos novos, congelados para as fatias A–F, cobrem os
 * códigos dos contratos (src/types/analiseAtivosComplementos.ts) e trazem as decisões do Wellington
 * de 19/10: 'Alavancagem ≤ 15% do ativo'; retornos (retorno total desde 24/10) + texto do FII sobre rendimentos;
 * "texto do FRE 2022 · pode ter sido alterado" + link do FRE vigente; acionistas só nome e %.
 * A varredura de palavras fica no linguagemV2Global (módulos registrados lá).
 */
import { describe, expect, it } from 'vitest';
import { folhasTexto } from '@/services/analiseAtivos/regras/comum/varreduraTextos';
import { TEXTOS_ATIVO } from '@/services/analiseAtivos/textosAtivo';
import { TEXTOS_COMPARADOR } from '@/services/analiseAtivos/textosComparador';
import { TEXTOS_CRITERIOS } from '@/services/analiseAtivos/textosCriterios';
import { TEXTOS_FINANCEIRAS } from '@/services/analiseAtivos/textosFinanceiras';
import { TEXTOS_IMOVEIS_FII } from '@/services/analiseAtivos/textosImoveisFii';
import { TEXTOS_RAIO_X } from '@/services/analiseAtivos/textosRaioX';
import { TEXTOS_RETORNOS } from '@/services/analiseAtivos/textosRetornos';
import { TEXTOS_SOCIETARIO } from '@/services/analiseAtivos/textosSocietario';
import {
  COLUNAS_ESSENCIAL_BANCO,
  COLUNAS_ESSENCIAL_SEGURADORA,
  CODIGOS_FATIA_COMPOSICAO,
  JANELAS_RETORNO,
  LIMITE_ALAV_ATIVO_V4_PCT,
  type BaseTagAlong,
  type CodigoBlocoRaioXFinanceira,
  type CodigoLinhaRaioXBanco,
  type CodigoLinhaRaioXFiiComplemento,
  type CodigoLinhaRaioXSeguradora,
  type MotivoComposicaoFii,
  type MotivoListaImoveisFii,
  type MotivoSocietario,
  type OrigemReceitaSeguradora,
} from '@/types/analiseAtivosComplementos';

const NOVOS = { TEXTOS_IMOVEIS_FII, TEXTOS_RETORNOS, TEXTOS_SOCIETARIO, TEXTOS_FINANCEIRAS };
const todas = Object.entries(NOVOS).flatMap(([n, m]) => folhasTexto(m, n));

/** Garante, em tempo de compilação, que a lista cobre a união inteira. */
function todos<T extends string>(): <L extends readonly T[]>(
  l: L & ([T] extends [L[number]] ? unknown : never),
) => L {
  return (l) => l;
}

describe('textos da A6 (fatia 0)', () => {
  it('cobrem os códigos dos contratos', () => {
    expect(Object.keys(TEXTOS_IMOVEIS_FII.composicao.fatias)).toEqual([
      ...CODIGOS_FATIA_COMPOSICAO,
    ]);
    const motivosFii = todos<MotivoComposicaoFii | MotivoListaImoveisFii>()([
      'sem_informe_mensal',
      'composicao_inconsistente',
      'cnpj_em_conferencia',
      'sem_informe_trimestral',
      'sem_imoveis_renda',
      'nao_se_aplica_tipo',
    ] as const);
    expect(Object.keys(TEXTOS_IMOVEIS_FII.motivos).sort()).toEqual([...motivosFii].sort());

    expect(Object.keys(TEXTOS_RETORNOS.janelas)).toEqual([...JANELAS_RETORNO]);
    expect(Object.keys(TEXTOS_RETORNOS.serieCurta)).toEqual([...JANELAS_RETORNO]);

    const bases = todos<BaseTagAlong>()([
      'segmento_b3',
      'lei_254a',
      'fre_2022',
      'conforme_estatuto',
      'nao_emite',
    ] as const);
    expect(Object.keys(TEXTOS_SOCIETARIO.tagAlong.bases)).toEqual([...bases]);
    const motivosSoc = todos<MotivoSocietario>()([
      'sem_fre',
      'sem_distribuicao_capital',
      'remete_outro_item',
    ] as const);
    expect(Object.keys(TEXTOS_SOCIETARIO.motivos)).toEqual([...motivosSoc]);

    expect(Object.keys(TEXTOS_FINANCEIRAS.banco.colunas)).toEqual([...COLUNAS_ESSENCIAL_BANCO]);
    expect(Object.keys(TEXTOS_FINANCEIRAS.seguradora.colunas)).toEqual([
      ...COLUNAS_ESSENCIAL_SEGURADORA,
    ]);
    const origens = todos<OrigemReceitaSeguradora>()([
      'comissoes_servicos',
      'receita_seguro',
      'premios_ganhos',
    ] as const);
    expect(Object.keys(TEXTOS_FINANCEIRAS.seguradora.tooltips.receita)).toEqual([...origens]);
    expect(Object.keys(TEXTOS_FINANCEIRAS.seguradora.receitaUsada)).toEqual([...origens]);

    const linhas = todos<
      CodigoLinhaRaioXBanco | CodigoLinhaRaioXSeguradora | CodigoLinhaRaioXFiiComplemento
    >()([
      'receitaIntermediacao',
      'pdd',
      'pddLucro',
      'margemBancariaPct',
      'ativoTotal',
      'plAtivoPct',
      'receitaOperacional',
      'equivalenciaPatrimonial',
      'resultadoFinanceiro',
      'sinistralidadePct',
      'despesaReceitaSeguroPct',
      'obrigacoesAtivoPct',
    ] as const);
    for (const c of linhas) expect(TEXTOS_RAIO_X.linhas[c].rotulo, c).toBeTruthy();
    const blocos = todos<CodigoBlocoRaioXFinanceira>()([
      'intermediacao_resultado',
      'balanco',
      'receita_resultado',
      'operacao_seguros',
      'proventos',
    ] as const);
    for (const b of blocos) expect(TEXTOS_RAIO_X.blocos[b], b).toBeTruthy();
  });

  it('decisão 1: alavancagem do tijolo na v4 = 15% do ativo; os rótulos de PL não mudam', () => {
    expect(LIMITE_ALAV_ATIVO_V4_PCT).toBe(15);
    expect(TEXTOS_CRITERIOS.alavancagemAtivoV4.rotulo).toBe('Alavancagem ≤ 15% do ativo');
    expect(TEXTOS_CRITERIOS.alavancagemAtivoV4.definicao).toContain('15% do ativo total');
    expect(TEXTOS_CRITERIOS.alavancagemAtivoV4.observacao).toContain('não são dívida');
    expect(TEXTOS_ATIVO.alavancagemAtivo.rotulo).toBe('Alavancagem (% do ativo)');
    expect(TEXTOS_ATIVO.pares.colunas.alavancagemAtivo).toBe('Alavancagem (% do ativo)');
    expect(TEXTOS_COMPARADOR.linhas.obrigacoesAtivo.rotulo).toBe('Alavancagem (% do ativo)');
    expect(TEXTOS_RAIO_X.linhas.obrigacoesAtivoPct.rotulo).toBe('Alavancagem (% do ativo)');
    // as chaves de PL de hoje ficam intactas
    expect(TEXTOS_ATIVO.alavancagem.rotulo).toBe('Alavancagem (% do PL)');
    expect(TEXTOS_ATIVO.pares.colunas.alavancagem).toBe('Alavancagem (% do PL)');
    expect(TEXTOS_RAIO_X.linhas.obrigacoesPlPct.rotulo).toBe('Alavancagem (% do PL)');
  });

  it('retornos = retorno total (24/10: igual ao Fundamentei), texto do FII, sem queda/desconto', () => {
    expect(TEXTOS_RETORNOS.rodape).toContain('proventos reinvestidos');
    expect(TEXTOS_RETORNOS.rodapeFii).toMatch(/reinvestidos na data-ex/);
    expect(TEXTOS_COMPARADOR.linhas.variacao12m.sub).toContain('proventos reinvestidos');
    expect(TEXTOS_COMPARADOR.linhas.variacao5a.sub).toContain('proventos reinvestidos');
    const retornos = folhasTexto(TEXTOS_RETORNOS).map(([, t]) => t);
    expect(retornos.filter((t) => /\b(queda|desconto|caiu|subiu|alta|baixa)\b/i.test(t))).toEqual(
      [],
    );
  });

  it('decisão 4: dividendo mínimo do FRE 2022 com o aviso e o link do FRE vigente', () => {
    expect(TEXTOS_SOCIETARIO.dividendoMinimo.sub).toBe(
      'texto do FRE 2022 · pode ter sido alterado',
    );
    expect(TEXTOS_SOCIETARIO.dividendoMinimo.linkFre).toContain('vigente na CVM');
    expect(TEXTOS_SOCIETARIO.dividendoMinimo.semPct).toBe('sem dado · o FRE remete a outro item');
  });

  it('decisão 5: acionistas só nome e %; nenhum campo de documento nos textos', () => {
    expect(TEXTOS_SOCIETARIO.acionistas.rodape).toContain('Sem CPF/CNPJ do acionista');
    const comDocumento = todas.filter(
      ([c, t]) => /cpf|cnpj/i.test(t) && c !== 'TEXTOS_SOCIETARIO.acionistas.rodape',
    );
    // só o motivo do vínculo código ↔ CNPJ do FUNDO (não do acionista)
    expect(comDocumento.map(([c]) => c)).toEqual([
      'TEXTOS_IMOVEIS_FII.motivos.cnpj_em_conferencia',
    ]);
  });

  it('Basileia fora com a observação de fase 2, sem "Índice" maiúsculo; tag along com duas bases', () => {
    expect(TEXTOS_FINANCEIRAS.banco.observacoes.basileia).toMatch(/fase 2 \(IF\.data do Bacen\)/);
    expect(todas.filter(([, t]) => /Índice/.test(t))).toEqual([]);
    expect(TEXTOS_SOCIETARIO.tagAlong.bases.segmento_b3).toBe('regra do segmento de listagem (B3)');
    expect(TEXTOS_SOCIETARIO.tagAlong.bases.lei_254a).toBe('mínimo legal (Lei 6.404, art. 254-A)');
  });
});
