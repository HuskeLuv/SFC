import { describe, expect, it } from 'vitest';
import {
  combinarFrescor,
  frescorCotacao,
  frescorFundamentos,
  frescorInformeFii,
  montarFrescorBlocos,
  trimestreDevido,
} from '../frescorBlocos';
import { encontrarPalavrasProibidas } from '@/services/analiseAtivos/textos';

const HOJE = '2026-10-02'; // sexta; último pregão fechado = 01/10

describe('frescor por bloco (bloco C, fatia B)', () => {
  it('cotação: atrasada só com MAIS de 3 pregões atrás do mercado', () => {
    expect(frescorCotacao('2026-10-01', HOJE).status).toBe('em_dia');
    expect(frescorCotacao('2026-09-28', HOJE).status).toBe('em_dia'); // 3 pregões
    const atrasada = frescorCotacao('2026-09-25', HOJE); // 4 pregões
    expect(atrasada.status).toBe('atrasado');
    expect(atrasada.documentoEsperado).toBe('pregão de 01/10/2026');
    expect(frescorCotacao(null, HOJE).status).toBe('sem_dado');
  });

  it('fundamentos: trimestre devido = fim do trimestre + 75 dias', () => {
    expect(trimestreDevido('2026-10-02')).toEqual({ ano: 2026, trimestre: 2 });
    expect(trimestreDevido('2026-09-12')).toEqual({ ano: 2026, trimestre: 1 });
    expect(trimestreDevido('2026-09-13')).toEqual({ ano: 2026, trimestre: 2 });
    expect(trimestreDevido('2026-03-16')).toEqual({ ano: 2025, trimestre: 4 });
    expect(frescorFundamentos(2025, { ano: 2026, trimestre: 2 }, HOJE).status).toBe('em_dia');
    const sem2T = frescorFundamentos(2025, { ano: 2026, trimestre: 1 }, HOJE);
    expect(sem2T.status).toBe('atrasado');
    expect(sem2T.documentoEsperado).toBe('ITR 2T26');
    expect(sem2T.referencia).toBe('ITR 1T26');
    expect(frescorFundamentos(2024, null, '2026-03-20').documentoEsperado).toBe('DFP 2025');
  });

  it('FII: informe com mais de 2 meses = atrasado', () => {
    expect(frescorInformeFii('2026-08-01', HOJE).status).toBe('em_dia');
    const velho = frescorInformeFii('2026-07-01', HOJE);
    expect(velho.status).toBe('atrasado');
    expect(velho.referencia).toBe('jul/26');
    expect(velho.documentoEsperado).toBe('informe de ago/26');
  });

  it('combinar: fontes unidas e a pior situação', () => {
    const c = combinarFrescor(
      frescorCotacao('2026-10-01', HOJE),
      frescorFundamentos(2025, { ano: 2026, trimestre: 1 }, HOJE),
    );
    expect(c.fonte).toBe('B3 · cotação · CVM · DFP/ITR');
    expect(c.status).toBe('atrasado');
    expect(c.documentoEsperado).toBe('ITR 2T26');
  });

  it('todos os blocos com menu; textos sem palavra proibida', () => {
    for (const classe of ['acao', 'fii'] as const) {
      const b = montarFrescorBlocos({
        classe,
        hoje: HOJE,
        precoData: '2026-10-01',
        dfpAno: 2025,
        itr: { ano: 2026, trimestre: 2 },
        fiiMes: '2026-08-01',
        proventosDefasados: true,
        versao: '2026-10-02T10:40:00.000Z',
        dataRef: '2026-10-01',
      });
      expect(Object.keys(b).sort()).toEqual(
        [
          'cabecalho',
          'criterios',
          'dividendos',
          'fundamentos',
          'grafico',
          'historicos',
          'indice',
          'kpis',
          'pares',
          'valuation',
        ].sort(),
      );
      expect(b.dividendos?.status).toBe('atrasado');
      for (const f of Object.values(b)) {
        expect(
          encontrarPalavrasProibidas(
            `${f?.fonte} ${f?.referencia ?? ''} ${f?.documentoEsperado ?? ''}`,
          ),
        ).toEqual([]);
      }
    }
  });
});
