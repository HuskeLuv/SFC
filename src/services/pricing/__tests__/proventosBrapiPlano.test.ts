/**
 * Plano de gravação da BRAPI (chave com data-com) com as linhas reais de prod do backtest de
 * 18/10/2026 (asset_dividend_history de 17/10 × resposta da BRAPI de 18/10).
 */
import { describe, expect, it } from 'vitest';
import {
  linhaSemPagamento,
  planejarGravacaoProventosBrapi,
  planoVazio,
  type LinhaProventoGravada,
  type ProventoBrapiParaGravar,
} from '@/services/pricing/proventosBrapiPlano';

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const linha = (
  id: string,
  pag: string,
  com: string | null,
  tipo: string,
  valor: number,
  source = 'BRAPI',
): LinhaProventoGravada => ({
  id,
  date: d(pag),
  dataCom: com ? d(com) : null,
  tipo,
  valorUnitario: valor,
  source,
});
const fonte = (pag: string, com: string, tipo: string, valor: number): ProventoBrapiParaGravar => ({
  date: d(pag),
  dataCom: d(com),
  tipo,
  valorUnitario: valor,
});

describe('planejarGravacaoProventosBrapi', () => {
  it('SAPR11: soma 1,9606 (30/12/2025) volta a 0,5524 e o JCP de 30/06/2025 ganha linha própria', () => {
    const plano = planejarGravacaoProventosBrapi(
      [
        linha('soma', '2026-06-26', '2025-12-30', 'JCP', 1.960639691),
        // legado "sem pagamento" (pagamento = data-com): nunca é apagado pelo plano
        linha('sp1', '2025-06-30', '2025-06-30', 'JCP', 1.4082268),
        linha('sp2', '2025-12-30', '2025-12-30', 'JCP', 0.5524128),
      ],
      [
        fonte('2026-06-26', '2025-06-30', 'JCP', 1.408226885),
        fonte('2026-06-26', '2025-12-30', 'JCP', 0.552412806),
      ],
    );
    expect(plano.atualizar).toEqual([
      { id: 'soma', valorUnitario: 0.552412806, antes: 1.960639691 },
    ]);
    expect(plano.criar).toEqual([fonte('2026-06-26', '2025-06-30', 'JCP', 1.408226885)]);
    expect(plano.apagar).toEqual([]);
  });

  it('VIVT3: soma de 14/04/2026 com data-com que a fonte não tem mais ⇒ soma_orfa; 0,8559 de 30/04/2026 ⇒ versao_antiga', () => {
    const plano = planejarGravacaoProventosBrapi(
      [
        linha('soma', '2026-04-14', '2025-12-28', 'JCP', 1.004061293601),
        linha('velha', '2026-04-30', '2025-12-30', 'JCP', 0.855916956),
        // histórico de 2019 que a resposta não cobre: fica
        linha('antiga', '2019-12-20', '2019-03-25', 'JCP', 0.2),
      ],
      [
        fonte('2026-04-14', '2025-11-24', 'JCP', 0.1063014382),
        fonte('2026-04-14', '2025-12-29', 'JCP', 0.10952537999),
      ],
    );
    expect(plano.apagar.map((a) => [a.id, a.motivo])).toEqual([
      ['soma', 'soma_orfa'],
      ['velha', 'versao_antiga'],
    ]);
    expect(plano.criar).toHaveLength(2);
  });

  it('ITUB4: JCP de 18/06/2026 repetido com pagamento 31/08 ⇒ versao_antiga; a parcela de 28/08 é atualizada', () => {
    const plano = planejarGravacaoProventosBrapi(
      [
        linha('p28', '2026-08-28', '2026-06-18', 'JCP', 0.71076),
        linha('p31', '2026-08-31', '2026-06-18', 'JCP', 0.71076),
      ],
      [
        fonte('2026-08-28', '2026-03-19', 'JCP', 0.34888),
        fonte('2026-08-28', '2026-06-18', 'JCP', 0.36188),
      ],
    );
    expect(plano.atualizar).toEqual([{ id: 'p28', valorUnitario: 0.36188, antes: 0.71076 }]);
    expect(plano.criar).toEqual([fonte('2026-08-28', '2026-03-19', 'JCP', 0.34888)]);
    expect(plano.apagar.map((a) => [a.id, a.motivo])).toEqual([['p31', 'versao_antiga']]);
  });

  it('CPFE3: parcelas de 30/04/2026 que a fonte trocou pelo total de 29/04 (3,7315) ⇒ versao_antiga', () => {
    const plano = planejarGravacaoProventosBrapi(
      [
        linha('total', '2026-12-31', '2026-04-29', 'DIVIDENDO', 3.731536204),
        linha('p1', '2026-05-18', '2026-04-30', 'DIVIDENDO', 1.128223),
        linha('p2', '2026-06-18', '2026-04-30', 'DIVIDENDO', 0.130179),
        linha('p3', '2026-08-21', '2026-04-30', 'DIVIDENDO', 0.216965),
        linha('p4', '2026-09-24', '2026-04-30', 'DIVIDENDO', 0.607504),
        // repetição sem pagamento (pagamento = data-com 29/04): legado, fica para a auditoria
        linha('sp', '2026-04-29', '2026-04-30', 'DIVIDENDO', 3.7315361),
      ],
      [fonte('2026-12-31', '2026-04-29', 'DIVIDENDO', 3.731536204)],
    );
    expect(plano.apagar.map((a) => a.id).sort()).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(plano.apagar.every((a) => a.motivo === 'versao_antiga')).toBe(true);
    expect(plano.criar).toEqual([]);
    expect(plano.atualizar).toEqual([]);
  });

  it('linhas de outra fonte (YAHOO) e de outro tipo não são tocadas; 2ª execução = plano vazio', () => {
    const atual = [
      linha('y', '2026-04-14', null, 'Dividendo', 0.5, 'YAHOO'),
      linha('div', '2026-04-14', '2025-12-29', 'DIVIDENDO', 0.3),
      linha('jcp', '2026-04-14', '2025-12-29', 'JCP', 0.10952537999),
    ];
    const resposta = [fonte('2026-04-14', '2025-12-29', 'JCP', 0.10952537999)];
    const plano = planejarGravacaoProventosBrapi(atual, resposta);
    expect(planoVazio(plano)).toBe(true);
  });

  it('linhaSemPagamento: pagamento = data-com, data-com −1 dia (fuso) e o pregão seguinte (sexta → segunda)', () => {
    expect(linhaSemPagamento({ date: d('2025-12-30'), dataCom: d('2025-12-30') })).toBe(true);
    expect(linhaSemPagamento({ date: d('2014-04-01'), dataCom: d('2014-04-02') })).toBe(true);
    expect(linhaSemPagamento({ date: d('2025-09-29'), dataCom: d('2025-09-26') })).toBe(true);
    expect(linhaSemPagamento({ date: d('2025-10-01'), dataCom: d('2025-09-26') })).toBe(false);
    expect(linhaSemPagamento({ date: d('2025-10-01'), dataCom: null })).toBe(false);
  });
});
