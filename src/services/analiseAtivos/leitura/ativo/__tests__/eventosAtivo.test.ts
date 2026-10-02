import { describe, it, expect } from 'vitest';
import {
  montarEventos,
  rotuloPeriodo,
  type EventoGravado,
} from '@/services/analiseAtivos/leitura/ativo/eventosAtivo';
import { encontrarPalavrasProibidas } from '@/services/analiseAtivos/textos';

const HOJE = '2026-10-02';
const ev = (over: Partial<EventoGravado>): EventoGravado => ({
  tipo: 'resultado_estimado',
  subtipo: 'ITR3',
  periodoRef: '2026-3T',
  data: '2026-10-22',
  estimado: true,
  substituidoEm: null,
  assunto: null,
  ...over,
});

describe('montarEventos', () => {
  it('resultado estimado com selo; estimado substituído pelo real some', () => {
    const r = montarEventos({
      classe: 'acao',
      hoje: HOJE,
      eventos: [
        ev({ substituidoEm: '2026-10-01T00:00:00Z' }),
        ev({ tipo: 'resultado', estimado: false, data: '2026-10-23' }),
        ev({ subtipo: 'DFP', periodoRef: '2026-FY', data: '2027-02-25' }),
      ],
      datasCom: [],
    });
    expect(r).toEqual([
      {
        data: '2026-10-23',
        tipo: 'resultado',
        titulo: 'Resultado 3T26',
        descricao: null,
        estimado: false,
      },
      {
        data: '2027-02-25',
        tipo: 'resultado_estimado',
        titulo: 'Resultado anual de 2026',
        descricao: 'Pelo histórico de divulgação da companhia',
        estimado: true,
      },
    ]);
  });

  it('data-com real de proventos auditados; 9999-12-31 e datas passadas descartadas; no máximo 3', () => {
    const r = montarEventos({
      classe: 'acao',
      hoje: HOJE,
      eventos: [ev({})],
      datasCom: [
        { dataComReal: '9999-12-31', tipoNormalizado: 'JCP', valor: 0.1, status: 'valido' },
        { dataComReal: '2026-09-30', tipoNormalizado: 'JCP', valor: 0.0182, status: 'valido' },
        { dataComReal: '2026-10-30', tipoNormalizado: 'JCP', valor: 0.0182, status: 'valido' },
        { dataComReal: '2026-10-30', tipoNormalizado: 'JCP', valor: 0.0182, status: 'valido' },
        { dataComReal: '2026-11-30', tipoNormalizado: 'JCP', valor: 0.0182, status: 'valido' },
        { dataComReal: '2026-12-30', tipoNormalizado: 'DIVIDENDO', valor: 1, status: 'duplicata' },
        { dataComReal: '2027-01-30', tipoNormalizado: 'JCP', valor: 0.0182, status: 'valido' },
      ],
    });
    expect(r).toHaveLength(3);
    expect(r.map((e) => e.data)).toEqual(['2026-10-22', '2026-10-30', '2026-11-30']);
    expect(r[1]).toMatchObject({
      tipo: 'data_com',
      titulo: 'Data-com JCP',
      descricao: 'R$ 0,0182 por ação',
    });
    expect(r.some((e) => /estimad/i.test(e.titulo) && e.tipo === 'data_com')).toBe(false);
  });

  it('FII: só data-com (sem resultados/assembleias), valor por cota', () => {
    const r = montarEventos({
      classe: 'fii',
      hoje: HOJE,
      eventos: [ev({}), ev({ tipo: 'assembleia', subtipo: 'AGO', data: '2026-11-01' })],
      datasCom: [
        { dataComReal: '2026-10-31', tipoNormalizado: 'RENDIMENTO', valor: 1.1, status: 'valido' },
      ],
    });
    expect(r).toEqual([
      {
        data: '2026-10-31',
        tipo: 'data_com',
        titulo: 'Data-com rendimento',
        descricao: 'R$ 1,10 por cota',
        estimado: false,
      },
    ]);
  });

  it('assembleia com assunto cortado e sem palavra proibida', () => {
    const r = montarEventos({
      classe: 'acao',
      hoje: HOJE,
      eventos: [
        ev({ tipo: 'assembleia', subtipo: 'AGE', estimado: false, assunto: 'x'.repeat(300) }),
      ],
      datasCom: [],
    });
    expect(r[0].titulo).toBe('Assembleia AGE');
    expect(r[0].descricao!.length).toBeLessThanOrEqual(160);
    expect(encontrarPalavrasProibidas(r.map((e) => e.titulo).join(' '))).toEqual([]);
  });

  it('rótulo do período', () => {
    expect(rotuloPeriodo('2026-3T', 'ITR3')).toBe('3T26');
    expect(rotuloPeriodo('2026-FY', 'DFP')).toBe('anual de 2026');
    expect(rotuloPeriodo(null, 'ITR1')).toBe('ITR1');
  });
});
