import { describe, expect, it } from 'vitest';
import {
  ROTULO_SECAO_RENDA_FIXA,
  SECOES_RENDA_FIXA,
  secaoDoTituloTesouro,
  secaoRendaFixa,
  type SecaoRendaFixaInput,
} from '../rendaFixaSecao';
import type { TipoRendaFixa } from '@/types/rendaFixa';

/**
 * Cópia LITERAL da regra da rota renda-fixa na main (antes da fase 2):
 * renda-fixa/route.ts (com FI: _HIB → híbrida; CDI|IPCA → pós; senão pré) e o
 * ramo legacy (debentureTipo válido; senão 'prefixada').
 */
const regraDaMain = (i: SecaoRendaFixaInput): TipoRendaFixa => {
  if (i.fiType) {
    const isHibrido = String(i.fiType).endsWith('_HIB');
    const isPosFixada = i.indexer === 'CDI' || i.indexer === 'IPCA';
    return isHibrido ? 'hibrida' : isPosFixada ? 'pos-fixada' : 'prefixada';
  }
  return i.debentureTipo && ['prefixada', 'pos-fixada', 'hibrida'].includes(i.debentureTipo)
    ? (i.debentureTipo as TipoRendaFixa)
    : 'prefixada';
};

/**
 * Os FIs de RF de PROD em 02/10/2026 (docs/carteira-mover/fase2-prod-contagens.md, item f)
 * + o legacy. Nenhum deles foi movido: a seção tem de ser a de hoje.
 */
const CASOS_PROD: { nome: string; n: number; input: SecaoRendaFixaInput; hoje: TipoRendaFixa }[] = [
  { nome: 'CDB_PRE/CDI', n: 11, input: { fiType: 'CDB_PRE', indexer: 'CDI' }, hoje: 'pos-fixada' },
  {
    nome: 'CDB_HIB/IPCA (banco)',
    n: 3,
    input: { fiType: 'CDB_HIB', indexer: 'IPCA' },
    hoje: 'hibrida',
  },
  {
    nome: 'CDB_HIB/IPCA Tesouro IPCA+',
    n: 4,
    input: { fiType: 'CDB_HIB', indexer: 'IPCA', tesouroBondType: 'Tesouro IPCA+' },
    hoje: 'hibrida',
  },
  {
    nome: 'CDB_HIB/IPCA Tesouro Renda+',
    n: 1,
    input: {
      fiType: 'CDB_HIB',
      indexer: 'IPCA',
      tesouroBondType: 'Tesouro Renda+ Aposentadoria Extra',
    },
    hoje: 'hibrida',
  },
  {
    nome: 'CDB_PRE/PRE (banco)',
    n: 1,
    input: { fiType: 'CDB_PRE', indexer: 'PRE' },
    hoje: 'prefixada',
  },
  {
    nome: 'CDB_PRE/PRE Tesouro Prefixado c/ juros',
    n: 2,
    input: {
      fiType: 'CDB_PRE',
      indexer: 'PRE',
      tesouroBondType: 'Tesouro Prefixado com Juros Semestrais',
    },
    hoje: 'prefixada',
  },
  {
    nome: 'Tesouro Selic (CDB_PRE/CDI)',
    n: 2,
    input: { fiType: 'CDB_PRE', indexer: 'CDI', tesouroBondType: 'Tesouro Selic' },
    hoje: 'pos-fixada',
  },
  { nome: 'CRI_HIB', n: 2, input: { fiType: 'CRI_HIB', indexer: 'IPCA' }, hoje: 'hibrida' },
  { nome: 'LCI', n: 2, input: { fiType: 'LCI_PRE', indexer: 'CDI' }, hoje: 'pos-fixada' },
  {
    nome: 'FI sem indexador',
    n: 0,
    input: { fiType: 'CDB_PRE', indexer: null },
    hoje: 'prefixada',
  },
  {
    nome: 'legacy com debentureTipo',
    n: 0,
    input: { debentureTipo: 'hibrida' },
    hoje: 'hibrida',
  },
  { nome: 'legacy sem debentureTipo', n: 0, input: { benchmark: 'CDI' }, hoje: 'prefixada' },
  {
    nome: 'legacy com debentureTipo inválido',
    n: 0,
    input: { debentureTipo: 'outra' },
    hoje: 'prefixada',
  },
];

describe('secaoRendaFixa — paridade com a main (item NÃO movido)', () => {
  it.each(CASOS_PROD)('$nome (prod: $n) → $hoje', ({ input, hoje }) => {
    expect(regraDaMain(input)).toBe(hoje);
    expect(secaoRendaFixa(input)).toBe(hoje);
    expect(secaoRendaFixa({ ...input, movidoParaRf: false })).toBe(hoje);
  });

  it('IPCA+ de hoje é Híbrida (o _HIB vale antes do indexador)', () => {
    expect(secaoRendaFixa({ fiType: 'CDB_HIB', indexer: 'IPCA' })).toBe('hibrida');
  });

  it('Tesouro já na RF: a seção pelo título dá o MESMO resultado que a regra do FI', () => {
    for (const c of CASOS_PROD.filter((x) => x.input.tesouroBondType)) {
      expect(secaoDoTituloTesouro(c.input.tesouroBondType)).toBe(regraDaMain(c.input));
      // e mesmo se fosse marcado como movido, nada muda para estes
      expect(secaoRendaFixa({ ...c.input, movidoParaRf: true })).toBe(c.hoje);
    }
  });
});

describe('secaoRendaFixa — item movido de uma Reserva para a RF', () => {
  // FI de reserva: type CDB_PRE e indexer CDI (benchmark padrão), tesouroBondType correto.
  it('Tesouro Prefixado de reserva (FI CDB_PRE/CDI) → Pré-fixada pelo título', () => {
    const input = { fiType: 'CDB_PRE', indexer: 'CDI', tesouroBondType: 'Tesouro Prefixado' };
    expect(regraDaMain(input)).toBe('pos-fixada'); // o erro que a crítica 3 apontou
    expect(secaoRendaFixa({ ...input, movidoParaRf: true })).toBe('prefixada');
  });

  it('Tesouro IPCA+ de reserva → Híbrida (como os IPCA+ da RF hoje)', () => {
    expect(
      secaoRendaFixa({
        fiType: 'CDB_PRE',
        indexer: 'CDI',
        tesouroBondType: 'Tesouro IPCA+',
        movidoParaRf: true,
      }),
    ).toBe('hibrida');
  });

  it('Tesouro Selic de reserva → Pós-fixada', () => {
    expect(
      secaoRendaFixa({
        fiType: 'CDB_PRE',
        indexer: 'CDI',
        tesouroBondType: 'Tesouro Selic',
        movidoParaRf: true,
      }),
    ).toBe('pos-fixada');
  });

  it('CDB de reserva sem título do Tesouro: regra do FI', () => {
    expect(secaoRendaFixa({ fiType: 'CDB_PRE', indexer: 'CDI', movidoParaRf: true })).toBe(
      'pos-fixada',
    );
    expect(secaoRendaFixa({ fiType: 'CDB_PRE', indexer: 'PRE', movidoParaRf: true })).toBe(
      'prefixada',
    );
  });

  it('sem FI: benchmark da reserva CDI/IPCA/SELIC → pós; senão pré', () => {
    expect(secaoRendaFixa({ benchmark: 'CDI', movidoParaRf: true })).toBe('pos-fixada');
    expect(secaoRendaFixa({ benchmark: 'Selic', movidoParaRf: true })).toBe('pos-fixada');
    expect(secaoRendaFixa({ benchmark: 'IPCA + 6%', movidoParaRf: true })).toBe('pos-fixada');
    expect(secaoRendaFixa({ benchmark: 'PRE', movidoParaRf: true })).toBe('prefixada');
    expect(secaoRendaFixa({ movidoParaRf: true })).toBe('prefixada');
    expect(secaoRendaFixa({ debentureTipo: 'hibrida', benchmark: 'CDI', movidoParaRf: true })).toBe(
      'hibrida',
    );
  });
});

describe('rótulos', () => {
  it('3 seções na ordem da aba', () => {
    expect(SECOES_RENDA_FIXA).toEqual(['pos-fixada', 'prefixada', 'hibrida']);
    expect(ROTULO_SECAO_RENDA_FIXA).toEqual({
      'pos-fixada': 'Pós-fixada',
      prefixada: 'Pré-fixada',
      hibrida: 'Híbrida',
    });
    expect(secaoDoTituloTesouro('Tesouro Educa+')).toBe('hibrida');
    expect(secaoDoTituloTesouro('Outro')).toBeNull();
    expect(secaoDoTituloTesouro(null)).toBeNull();
  });
});
