import { describe, it, expect } from 'vitest';
import {
  replayPosition,
  buildQuantityTimeline,
  quantityAtDate,
  computeCorporateActionAudit,
  isCorporateActionAuditTx,
} from '../corporateActions';

const buy = (date: string, quantity: number, price: number) => ({
  date: new Date(date),
  type: 'compra',
  quantity,
  price,
  total: quantity * price,
});
const sell = (date: string, quantity: number, price: number) => ({
  date: new Date(date),
  type: 'venda',
  quantity,
  price,
  total: quantity * price,
});
const ca = (date: string, factor: number, type = 'DESDOBRAMENTO') => ({
  date: new Date(date),
  type,
  factor,
});

describe('replayPosition', () => {
  it('split 2:1 dobra qty e divide avg (custo intacto)', () => {
    const r = replayPosition([buy('2024-01-10', 100, 28)], [ca('2024-06-01', 2)]);
    expect(r.quantity).toBeCloseTo(200, 6);
    expect(r.cost).toBeCloseTo(2800, 6);
    expect(r.cost / r.quantity).toBeCloseTo(14, 6);
  });

  it('grupamento 1:100 reduz qty e multiplica avg', () => {
    const r = replayPosition([buy('2024-01-10', 100, 10)], [ca('2024-06-01', 0.01, 'GRUPAMENTO')]);
    expect(r.quantity).toBeCloseTo(1, 6);
    expect(r.cost / r.quantity).toBeCloseTo(1000, 6);
  });

  it('bonificação 1.1 adiciona 10% de papéis sem mudar custo', () => {
    const r = replayPosition([buy('2024-01-10', 100, 10)], [ca('2024-06-01', 1.1, 'BONIFICACAO')]);
    expect(r.quantity).toBeCloseTo(110, 6);
    expect(r.cost).toBeCloseTo(1000, 6);
  });

  it('ignora evento ANTERIOR à compra (papel já comprado ajustado)', () => {
    const r = replayPosition([buy('2025-01-10', 100, 14)], [ca('2024-06-01', 2)]);
    expect(r.quantity).toBeCloseTo(100, 6);
    expect(r.cost / r.quantity).toBeCloseTo(14, 6);
  });

  it('robusto a quantidade editada: 200 com split 2:1 → 400', () => {
    const r = replayPosition([buy('2024-01-10', 200, 28)], [ca('2024-06-01', 2)]);
    expect(r.quantity).toBeCloseTo(400, 6);
    expect(r.cost / r.quantity).toBeCloseTo(14, 6);
  });

  it('venda após split remove custo proporcional ao avg ajustado', () => {
    const r = replayPosition(
      [buy('2024-01-10', 100, 28), sell('2024-07-01', 50, 20)],
      [ca('2024-06-01', 2)], // 100→200 @ avg 14; vende 50 → 150 @ 14
    );
    expect(r.quantity).toBeCloseTo(150, 6);
    expect(r.cost / r.quantity).toBeCloseTo(14, 6);
  });

  it('ignora tipos não aplicáveis (CIS RED CAP)', () => {
    const r = replayPosition([buy('2024-01-10', 100, 28)], [ca('2024-06-01', 100, 'CIS RED CAP')]);
    expect(r.quantity).toBeCloseTo(100, 6);
  });
});

describe('buildQuantityTimeline + quantityAtDate', () => {
  const txs = [
    { date: new Date('2024-01-10'), type: 'compra', quantity: 100 },
    { date: new Date('2024-08-10'), type: 'compra', quantity: 50 },
  ];
  const cas = [ca('2024-06-01', 2)];

  it('quantidade antes do split = pré-split; depois = pós-split', () => {
    const tl = buildQuantityTimeline(txs, cas);
    expect(quantityAtDate(tl, new Date('2024-03-01').getTime())).toBeCloseTo(100, 6);
    // após split (200) e segunda compra (250)
    expect(quantityAtDate(tl, new Date('2024-09-01').getTime())).toBeCloseTo(250, 6);
    // entre o split e a 2ª compra
    expect(quantityAtDate(tl, new Date('2024-07-01').getTime())).toBeCloseTo(200, 6);
  });

  it('retorna 0 antes de qualquer transação', () => {
    const tl = buildQuantityTimeline(txs, cas);
    expect(quantityAtDate(tl, new Date('2020-01-01').getTime())).toBe(0);
  });
});

describe('computeCorporateActionAudit', () => {
  it('calcula antes/depois por evento, ignorando os anteriores à 1ª compra', () => {
    const txs = [{ date: new Date('2023-06-14'), type: 'compra', quantity: 100 }];
    const audit = computeCorporateActionAudit(txs, [
      { id: 'a0', date: new Date('2020-01-01'), type: 'DESDOBRAMENTO', factor: 2 }, // antes
      { id: 'a1', date: new Date('2025-03-17'), type: 'BONIFICACAO', factor: 1.1 },
    ]);
    expect(audit).toHaveLength(2);
    expect(audit[0]).toMatchObject({ id: 'a0', quantityBefore: 0, quantityAfter: 0 });
    expect(audit[1].quantityBefore).toBeCloseTo(100, 6);
    expect(audit[1].quantityAfter).toBeCloseTo(110, 6);
  });
});

describe('isCorporateActionAuditTx', () => {
  it('detecta linha de auditoria pelo marcador no notes', () => {
    expect(isCorporateActionAuditTx('{"corporateActionId":"x"}')).toBe(true);
    expect(isCorporateActionAuditTx('{"operation":{"action":"compra"}}')).toBe(false);
    expect(isCorporateActionAuditTx(null)).toBe(false);
  });
});
