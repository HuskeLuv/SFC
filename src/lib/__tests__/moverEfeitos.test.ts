import { describe, expect, it } from 'vitest';
import { AVISO_OBJETIVO_ZERA, AVISO_SAUDE_RESERVA } from '../carteiraMover';
import {
  ALERTA_RESERVA_ABAIXO,
  LINHA_FLUXO_CAIXA_RF,
  calcularEfeitosMover,
  efeitoSaude,
} from '../moverEfeitos';

/** Intl usa espaço não separável em "R$ 1,00": normaliza para comparar. */
const norm = (s: string) => s.replace(/ /g, ' ');
const textos = (input: Parameters<typeof calcularEfeitosMover>[0]) =>
  calcularEfeitosMover(input).map((e) => ({ ...e, texto: norm(e.texto) }));

describe('calcularEfeitosMover', () => {
  it('fora do trio ou sem troca de aba → nada (confirmação da fase 1 intacta)', () => {
    expect(calcularEfeitosMover({ origem: 'fiis', destino: 'fimFia', valorItem: 10 })).toEqual([]);
    expect(
      calcularEfeitosMover({ origem: 'rendaFixaFundos', destino: 'rendaFixaFundos', valorItem: 1 }),
    ).toEqual([]);
  });

  it('entrar na Emergência LIGA a cobertura: o alerta deixa de aparecer', () => {
    const [s] = textos({
      origem: 'rendaFixaFundos',
      destino: 'reservaEmergencia',
      valorItem: 15_612.4,
      saude: { reservaAtual: 18_400, necessario: 30_000 },
    });
    expect(s.marcador).toBe('S');
    expect(s.texto).toBe(
      `Saúde Financeira: reserva de emergência R$ 18.400,00 → R$ 34.012,40 (necessário R$ 30.000,00) · o alerta “${ALERTA_RESERVA_ABAIXO}” deixa de aparecer.`,
    );
  });

  it('sair da Emergência DESLIGA a cobertura: o alerta passa a aparecer', () => {
    const [s] = textos({
      origem: 'reservaEmergencia',
      destino: 'reservaOportunidade',
      valorItem: 10_000,
      saude: { reservaAtual: 35_000, necessario: 30_000 },
    });
    expect(s.texto).toContain('R$ 35.000,00 → R$ 25.000,00');
    expect(s.texto).toContain('passa a aparecer');
  });

  it('sem cruzar o necessário: só os números', () => {
    const s = efeitoSaude({
      origem: 'rendaFixaFundos',
      destino: 'reservaEmergencia',
      valorItem: 1_000,
      saude: { reservaAtual: 1_000, necessario: 30_000 },
    })!;
    expect(norm(s.texto)).toBe(
      'Saúde Financeira: reserva de emergência R$ 1.000,00 → R$ 2.000,00 (necessário R$ 30.000,00).',
    );
    const semGasto = efeitoSaude({
      origem: 'rendaFixaFundos',
      destino: 'reservaEmergencia',
      valorItem: 1_000,
      saude: { reservaAtual: 0, necessario: null },
    })!;
    expect(norm(semGasto.texto)).toBe(
      'Saúde Financeira: reserva de emergência R$ 0,00 → R$ 1.000,00.',
    );
  });

  it('sem dado da Saúde (carregando/erro) → frase fixa', () => {
    const [s] = textos({ origem: 'rendaFixaFundos', destino: 'reservaEmergencia', valorItem: 10 });
    expect(s).toEqual({ marcador: 'S', texto: `Saúde Financeira: ${AVISO_SAUDE_RESERVA}.` });
    const comNaN = efeitoSaude({
      origem: 'reservaEmergencia',
      destino: 'rendaFixaFundos',
      valorItem: Number.NaN,
      saude: { reservaAtual: 100, necessario: 1 },
    });
    expect(comNaN?.texto).toContain(AVISO_SAUDE_RESERVA);
  });

  it('troca entre RF e Oportunidade não fala da Saúde', () => {
    const efeitos = textos({
      origem: 'rendaFixaFundos',
      destino: 'reservaOportunidade',
      valorItem: 10,
      saude: { reservaAtual: 1, necessario: 2 },
    });
    expect(efeitos.map((e) => e.marcador)).toEqual(['A', 'F', '=']);
  });

  it('liquidez, alocação, fluxo, seção e "não muda" na ordem do protótipo', () => {
    const efeitos = textos({
      origem: 'rendaFixaFundos',
      destino: 'reservaEmergencia',
      valorItem: 100,
      saude: { reservaAtual: 0, necessario: 30_000 },
      liquidez: { noVencimento: true, vencimento: '02/01/2030' },
      objetivoClasse: { reservaEmergencia: 30_000, rendaFixaFundos: 30 },
      objetivoPosicao: 5,
    });
    expect(efeitos.map((e) => e.marcador)).toEqual(['S', '!', 'A', 'F', '=']);
    expect(efeitos[1]).toMatchObject({ alerta: true });
    expect(efeitos[1].texto).toBe(
      'Liquidez: resgate só no vencimento (vence 02/01/2030). Mesmo assim conta inteiro como Reserva de Emergência na Saúde Financeira.',
    );
    expect(efeitos[2].texto).toBe(
      `Alocação: o valor sai da meta de 30% da carteira de Renda Fixa e passa a contar na meta de R$ 30.000,00 (em reais) de Reserva Emergência. ${AVISO_OBJETIVO_ZERA}.`,
    );
    expect(efeitos[3].texto).toBe(
      `Fluxo de Caixa: aportes e resgates passam da linha “${LINHA_FLUXO_CAIXA_RF.rendaFixaFundos}” para “${LINHA_FLUXO_CAIXA_RF.reservaEmergencia}”, em todos os meses.`,
    );
    expect(efeitos[4]).toMatchObject({ igual: true });
  });

  it('destino RF: seção automática pelo indexador ou pelo título', () => {
    const porIndexador = textos({
      origem: 'reservaEmergencia',
      destino: 'rendaFixaFundos',
      valorItem: 1,
      secao: { id: 'pos-fixada', via: 'indexador' },
    }).find((e) => e.marcador === '§')!;
    expect(porIndexador.texto).toBe(
      'Seção: entra em Pós-fixada, pelo indexador. Na Renda Fixa a seção não é escolhida à mão.',
    );
    const porTitulo = textos({
      origem: 'reservaOportunidade',
      destino: 'rendaFixaFundos',
      valorItem: 1,
      secao: { id: 'prefixada', via: 'titulo', titulo: 'Tesouro Prefixado' },
    }).find((e) => e.marcador === '§')!;
    expect(porTitulo.texto).toContain('Pré-fixada, pelo tipo do título (Tesouro Prefixado)');
  });

  it('saldo em conta: o "não muda" fala do saldo; sem metas, texto genérico', () => {
    const efeitos = textos({
      origem: 'reservaOportunidade',
      destino: 'reservaEmergencia',
      valorItem: 1,
      semTitulo: true,
    });
    expect(efeitos.at(-1)!.texto).toBe('Não muda: valor e rendimento do saldo.');
    expect(efeitos.find((e) => e.marcador === 'A')!.texto).toBe(
      'Alocação: o valor sai da meta de Reserva Oportunidade e passa a contar na meta de Reserva Emergência.',
    );
  });
});
