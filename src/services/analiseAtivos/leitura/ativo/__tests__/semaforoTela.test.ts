import { describe, it, expect } from 'vitest';
import {
  lerScoreGravado,
  montarIndiceTopo,
  montarSemaforoTela,
  type CheckGravado,
  type LinhaIndiceTopo,
} from '@/services/analiseAtivos/leitura/ativo/semaforoTela';
import { encontrarPalavrasProibidas } from '@/services/analiseAtivos/textos';

// AssetScore.checks do banco dev de 29/09/2026 (fixture da Fase 1)
const WEGE3: CheckGravado[] = [
  { valor: 12, codigo: 'lucros_consecutivos', status: 'atende', referencia: 5 },
  { valor: -0.4204, codigo: 'endividamento', status: 'atende', referencia: 3 },
  { valor: 33.1579, codigo: 'rentabilidade', status: 'atende', referencia: 15 },
  { valor: -8.6798, codigo: 'preco_historico', status: 'atende', referencia: 0 },
  { valor: 3.98339, codigo: 'dividendos', status: 'parcial', referencia: 4 },
];
const HGLG11: CheckGravado[] = [
  {
    valor: null,
    codigo: 'renda_recorrente',
    motivo: 'fonte_defasada',
    status: 'sem_dado',
    referencia: 8,
  },
  {
    valor: null,
    codigo: 'vacancia',
    motivo: 'criterio_desligado',
    status: 'nao_se_aplica',
    referencia: 5,
  },
  {
    valor: null,
    codigo: 'diversificacao_imoveis',
    motivo: 'criterio_desligado',
    status: 'nao_se_aplica',
    referencia: 15,
  },
  { valor: 16.2476, codigo: 'obrigacoes_pl', status: 'parcial', provisorio: true, referencia: 10 },
  { valor: 0.8914, codigo: 'preco_vp', status: 'atende', referencia: 1.05 },
];
const ITUB4: CheckGravado[] = [
  { valor: 12, codigo: 'lucros_consecutivos', status: 'atende', referencia: 5 },
  {
    valor: null,
    codigo: 'endividamento',
    motivo: 'financeira',
    status: 'nao_se_aplica',
    referencia: 3,
  },
];
const AURE3: CheckGravado[] = [
  { valor: 0, codigo: 'lucros_consecutivos', status: 'nao_atende', referencia: 5 },
  { valor: 5.752, codigo: 'endividamento', status: 'parcial', referencia: 3 },
  { valor: -9.467, codigo: 'rentabilidade', status: 'nao_atende', referencia: 15 },
  {
    valor: null,
    codigo: 'preco_historico',
    motivo: 'pl_negativo',
    status: 'nao_atende',
    referencia: 0,
  },
  { valor: 0, codigo: 'dividendos', status: 'nao_atende', referencia: 4 },
];
const KNCR11_PRECO_VP: CheckGravado = {
  valor: 1.033,
  codigo: 'preco_vp',
  status: 'atende',
  referencia: [0.9, 1.05],
};

function linha(over: Partial<LinhaIndiceTopo> = {}): LinhaIndiceTopo {
  return {
    estadoIndice: 'calculado',
    indiceMf: 9.01,
    regua: 'acao',
    motivosIncompleto: [],
    componentesZeroRegra: [],
    criteriosAtendidos: 4,
    criteriosAplicaveis: 5,
    ...over,
  };
}

const SCORE_AURE3 = lerScoreGravado({
  regua: 'acao',
  indiceMf: 0.08,
  componentes: {
    div: { nota: 0, estado: 'calculado', metrica: 0 },
    rent: { nota: 0, estado: 'calculado', metrica: -9.47 },
    lucro: { nota: 0, estado: 'zero_regra', motivo: 'prejuizo' },
    preco: { nota: 0, estado: 'zero_regra', motivo: 'prejuizo' },
    divida: { nota: 0.41, estado: 'calculado', metrica: 5.75 },
  },
  pesosEfetivos: { div: 0.15, rent: 0.2, lucro: 0.35, preco: 0.1, divida: 0.2 },
  checks: AURE3,
  criteriosAplicaveis: 5,
  criteriosAtendidos: 0,
  motivosIncompleto: [],
});

describe('montarSemaforoTela', () => {
  it('WEGE3: 5 critérios com frase número + referência; caixa líquido; duas casas no DY', () => {
    const s = montarSemaforoTela(WEGE3);
    expect(s.map((c) => c.status)).toEqual(['atende', 'atende', 'atende', 'atende', 'parcial']);
    expect(s[0]).toMatchObject({
      titulo: 'Lucros consecutivos',
      frase: '12 anos seguidos de lucro; referência do critério: 5 anos',
    });
    expect(s[1].frase).toBe('Caixa líquido (dívida líquida menor ou igual a zero)');
    expect(s[2].frase).toBe('ROE de 33,2%; referência do critério: 15%');
    expect(s[3].frase).toBe(
      'P/L −9% em relação à média de 10 anos; referência do critério: até 0%',
    );
    expect(s[4].frase).toBe('Dividend yield de 12 meses de 3,98%; referência do critério: 4%');
  });

  it('HGLG11: desligados aparecem como n/a "critério desligado"; obrigações provisório; sem dado com motivo', () => {
    const s = montarSemaforoTela(HGLG11);
    expect(s[0]).toMatchObject({ status: 'sem_dado', frase: 'Sem dado: proventos em conferência' });
    for (const c of [s[1], s[2]]) {
      expect(c).toMatchObject({
        status: 'nao_se_aplica',
        desligado: true,
        frase: 'Não se aplica · critério desligado até a validação da fonte',
      });
    }
    expect(s[3]).toMatchObject({ provisorio: true, status: 'parcial' });
    expect(s[3].frase).toBe('Obrigações/PL de 16,2%; referência do critério: até 10%');
    expect(s[4].frase).toBe('P/VP de 0,89; referência do critério: 1,05');
  });

  it('faixa de referência do P/VP (FII de papel)', () => {
    expect(montarSemaforoTela([KNCR11_PRECO_VP])[0].frase).toBe(
      'P/VP de 1,03; referência do critério: 0,90 a 1,05',
    );
  });

  it('ITUB4: endividamento n/a pela regra de financeira, sem "desligado"', () => {
    const s = montarSemaforoTela(ITUB4);
    expect(s[1]).toMatchObject({ status: 'nao_se_aplica', desligado: false });
    expect(s[1].frase).toBe('não se aplica a bancos, seguradoras e holdings financeiras');
  });

  it('AURE3: preço histórico NÃO atende com frase própria (nunca "sem dado")', () => {
    const s = montarSemaforoTela(AURE3);
    expect(s[3]).toMatchObject({
      status: 'nao_atende',
      frase: 'P/L não calculado: prejuízo no último exercício',
    });
    expect(s.every((c) => c.status !== 'sem_dado')).toBe(true);
    expect(s[1].frase).toBe('Dívida líquida/EBITDA de 5,8×; referência do critério: até 3×');
  });

  it('varredura: nenhuma palavra proibida e nenhum placeholder sobrando', () => {
    const todas = [WEGE3, HGLG11, ITUB4, AURE3, [KNCR11_PRECO_VP]].flatMap(montarSemaforoTela);
    for (const c of todas) {
      expect(encontrarPalavrasProibidas(`${c.titulo} ${c.frase}`)).toEqual([]);
      expect(c.frase).not.toMatch(/[{}]/);
    }
  });
});

describe('montarIndiceTopo', () => {
  it('calculado: leitura "n de m" sem caixa', () => {
    const i = montarIndiceTopo(
      linha(),
      lerScoreGravado({ ...SCORE_AURE3, checks: WEGE3 } as never),
    );
    expect(i.leitura).toBe('4 de 5 critérios atendidos');
    expect(i.caixaExplicativa).toBeNull();
    expect(i.valor).toBe(9.01);
  });

  it('incompleto (TGMA3): caixa "O que falta" com os motivos legíveis', () => {
    const i = montarIndiceTopo(
      linha({
        estadoIndice: 'incompleto',
        indiceMf: 8.48,
        motivosIncompleto: ['div:fonte_defasada'],
      }),
      null,
    );
    expect(i.caixaExplicativa).toEqual({
      titulo: 'O que falta',
      itens: ['proventos em conferência'],
    });
    expect(i.motivos[0].codigo).toBe('div:fonte_defasada');
    expect(i.valor).toBe(8.48);
  });

  it('zero_regra (AURE3): caixa "Componente zerado pela regra" e componentes "zero_regra"', () => {
    const i = montarIndiceTopo(
      linha({
        estadoIndice: 'zero_regra',
        indiceMf: 0.08,
        componentesZeroRegra: ['lucro:prejuizo', 'preco:prejuizo'],
        criteriosAtendidos: 0,
      }),
      SCORE_AURE3,
    );
    expect(i.caixaExplicativa?.titulo).toBe('Componente zerado pela regra');
    expect(i.caixaExplicativa?.itens).toEqual([
      'Componente zerado pela regra: prejuízo no último exercício',
    ]);
    expect(i.componentes.map((c) => c.nome)).toEqual(['lucro', 'divida', 'rent', 'div', 'preco']);
    expect(i.componentes[0]).toMatchObject({ estado: 'zero_regra', nota: 0, peso: 0.35 });
    expect(i.leitura).toBe('0 de 5 critérios atendidos');
  });

  it('sem_score (HCTR11) e fora_do_indice (FoF): sem número, sem componentes, texto próprio', () => {
    const s = montarIndiceTopo(linha({ estadoIndice: 'sem_score', indiceMf: null }), null);
    expect(s).toMatchObject({
      valor: null,
      leitura: 'Índice MF não calculado para este fundo nesta data',
      componentes: [],
      criteriosAtendidos: null,
    });
    const f = montarIndiceTopo(linha({ estadoIndice: 'fora_do_indice', indiceMf: null }), null);
    expect(f.leitura).toBe('fora do Índice MF nesta fase');
    expect(f.valor).toBeNull();
  });
});
