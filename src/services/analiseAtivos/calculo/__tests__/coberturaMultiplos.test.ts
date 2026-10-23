import { describe, expect, it } from 'vitest';
import {
  alertasCobertura,
  coberturaMultiplos,
} from '@/services/analiseAtivos/calculo/recalcularAtuais';

const linha = (symbol: string, classe: 'acao' | 'fii', pl: number | null, pvp: number | null) => ({
  symbol,
  classe,
  pl,
  pvp,
});

describe('coberturaMultiplos (D6-b, no lugar do cobertura_scores)', () => {
  it('mede linha de múltiplos por linha do Quadro; P/L ou P/VP só informativo', () => {
    const atuais = [
      linha('AAAA3', 'acao', 10, 2),
      linha('BBBB3', 'acao', null, null), // prejuízo com PL negativo: tem linha, sem múltiplo
      linha('FORA3', 'acao', 5, 1), // fora do Quadro: não conta
      linha('FIIA11', 'fii', null, 0.9),
    ];
    const c = coberturaMultiplos(atuais, new Set(['AAAA3', 'BBBB3', 'FIIA11']), {
      acao: 2,
      fii: 1,
    });
    expect(c).toEqual({
      acoesPct: 100,
      fiisPct: 100,
      acoesComMultiploPct: 50,
      fiisComMultiploPct: 100,
    });
    expect(alertasCobertura(c)).toEqual([]);
  });

  it('alerta quando parte do Quadro ficou sem linha de múltiplos', () => {
    const c = coberturaMultiplos([linha('AAAA3', 'acao', 10, 2)], new Set(['AAAA3']), {
      acao: 20,
      fii: 0,
    });
    expect(c.acoesPct).toBe(5);
    expect(c.fiisPct).toBeNull();
    expect(alertasCobertura(c)).toEqual([
      {
        codigo: 'cobertura_multiplos',
        nivel: 'aviso',
        mensagem: 'cobertura de múltiplos de ações 5.0% (< 95%)',
      },
    ]);
  });
});
