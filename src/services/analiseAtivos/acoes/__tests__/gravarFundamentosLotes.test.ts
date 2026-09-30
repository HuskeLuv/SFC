/**
 * Fundamentos gravados em lotes que nunca quebram um documento (achado qa-codigo 30/09): o fundamento
 * é o marcador de "documento gravado"; com o prazo estourando entre lotes, um documento com só o 'con'
 * gravado era pulado para sempre e o 'ind' nunca chegava.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import {
  TAMANHO_LOTE,
  gravarFundamentos,
  lotesPorDocumento,
} from '@/services/analiseAtivos/acoes/gravarAcoes';

/** ITR: 4 linhas por documento (con/ind × 3M/YTD), como o job monta. */
function linhasItr(nDocs: number): Prisma.AssetFundamentalsPeriodCreateManyInput[] {
  const out: Prisma.AssetFundamentalsPeriodCreateManyInput[] = [];
  for (let i = 0; i < nDocs; i++) {
    for (const escopo of ['con', 'ind']) {
      for (const tipoPeriodo of ['3M', 'YTD']) {
        out.push({
          emissorId: `${String(i).padStart(8, '0')}/0001-00`,
          dtFim: new Date('2026-06-30T00:00:00Z'),
          versao: 1,
          escopo,
          tipoPeriodo,
        } as Prisma.AssetFundamentalsPeriodCreateManyInput);
      }
    }
  }
  return out;
}

// 1 linha extra no início desalinha os documentos: o 250º (linhas 997–1000) cruzaria a fronteira
// de 1.000 linhas dos lotes antigos ('con' no lote 1, 'ind' no lote 2)
function linhasDesalinhadas() {
  const [extra] = linhasItr(1).map((l) => ({ ...l, emissorId: 'EXTRA/0001-00' }));
  return [extra, ...linhasItr(260)];
}

describe('lotesPorDocumento', () => {
  it('nenhum documento fica dividido entre lotes; lotes ≤ TAMANHO_LOTE', () => {
    const lotes = lotesPorDocumento(linhasDesalinhadas());
    const loteDe = new Map<string, Set<number>>();
    lotes.forEach((lote, i) => {
      expect(lote.length).toBeLessThanOrEqual(TAMANHO_LOTE);
      for (const l of lote) {
        const k = `${l.emissorId}|${l.versao}`;
        loteDe.set(k, (loteDe.get(k) ?? new Set()).add(i));
      }
    });
    for (const s of loteDe.values()) expect(s.size).toBe(1);
    expect(lotes.flat()).toHaveLength(1 + 260 * 4);
  });

  it('prazo estourando depois do 1º lote ⇒ só documentos inteiros gravados', async () => {
    const gravadas: Prisma.AssetFundamentalsPeriodCreateManyInput[] = [];
    const prisma = {
      assetFundamentalsPeriod: {
        createMany: vi.fn(
          async ({ data }: { data: Prisma.AssetFundamentalsPeriodCreateManyInput[] }) => {
            gravadas.push(...data);
            return { count: data.length };
          },
        ),
      },
    } as unknown as PrismaClient;
    let chamadas = 0;
    const r = await gravarFundamentos(
      prisma,
      { estourouPrazo: () => chamadas++ >= 1 },
      linhasDesalinhadas(),
    );
    expect(r.interrompido).toBe(true);
    const porDoc = new Map<string, number>();
    for (const l of gravadas) porDoc.set(l.emissorId, (porDoc.get(l.emissorId) ?? 0) + 1);
    for (const [doc, n] of porDoc) expect(n, doc).toBe(doc === 'EXTRA/0001-00' ? 1 : 4);
  });
});
