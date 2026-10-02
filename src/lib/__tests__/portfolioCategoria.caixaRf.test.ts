/**
 * Histórico por classe com o mover entre Reservas e Renda Fixa (fase 2,
 * MOVER_CAIXA_RF_HABILITADO): o override vem antes do bloco das reservas e o
 * Tesouro de catálogo usa o BaseCtx. Chave desligada: heurística de sempre.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { getCategoriaFromPortfolio } from '@/lib/portfolioCategoria';

const vazio = new Set<string>();

const cdb = { symbol: 'CDB-BANCO-X', type: 'bond', currency: 'BRL', name: 'CDB Banco X' };
const reservaEmerg = { symbol: 'RESERVA-EMERG-1', type: 'emergency', currency: 'BRL' };
const reservaComTitulo = { symbol: 'CDB-X-RESERVA-EMERG', type: 'emergency', currency: 'BRL' };
const reservaOport = { symbol: 'RESERVA-OPORT-1', type: 'opportunity', currency: 'BRL' };
const tesouro = { symbol: 'TD-TESOURO-SELIC-2029', type: 'tesouro-direto', currency: 'BRL' };
const fii = { symbol: 'HGLG11', type: 'fii', currency: 'BRL' };

const cat = (
  asset: Record<string, string>,
  categoriaOverride: string | null,
  ctx?: Parameters<typeof getCategoriaFromPortfolio>[2],
) => getCategoriaFromPortfolio({ asset, categoriaOverride }, vazio, ctx);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getCategoriaFromPortfolio — trio com a chave ligada', () => {
  it('CDB movido para a Reserva de Emergência agrupa na reserva', () => {
    vi.stubEnv('MOVER_CAIXA_RF_HABILITADO', 'true');
    expect(cat(cdb, 'reservaEmergencia')).toBe('reservaEmergencia');
    expect(cat(cdb, 'reservaOportunidade')).toBe('reservaOportunidade');
  });

  it('reserva movida: entre as reservas e (com título) para a RF — antes do bloco isReserva', () => {
    vi.stubEnv('MOVER_CAIXA_RF_HABILITADO', 'true');
    expect(cat(reservaEmerg, 'reservaOportunidade')).toBe('reservaOportunidade');
    expect(cat(reservaOport, 'reservaEmergencia')).toBe('reservaEmergencia');
    expect(cat(reservaComTitulo, 'rendaFixaFundos')).toBe('rendaFixaFundos');
  });

  it('Tesouro de catálogo comprado como reserva e movido para a RF usa o ctx', () => {
    vi.stubEnv('MOVER_CAIXA_RF_HABILITADO', 'true');
    expect(cat(tesouro, 'rendaFixaFundos', { reservaDestino: 'emergencia' })).toBe(
      'rendaFixaFundos',
    );
    expect(cat(tesouro, 'reservaOportunidade', { reservaDestino: 'emergencia' })).toBe(
      'reservaOportunidade',
    );
    // Tesouro de RF movido para a reserva (sem ctx = base RF).
    expect(cat(tesouro, 'reservaEmergencia')).toBe('reservaEmergencia');
  });

  it('sem override (ou override igual à base) nada muda', () => {
    vi.stubEnv('MOVER_CAIXA_RF_HABILITADO', 'true');
    expect(cat(cdb, null)).toBe('rendaFixaFundos');
    expect(cat(reservaEmerg, null)).toBe('reservaEmergencia');
    expect(cat(reservaEmerg, 'reservaEmergencia')).toBe('reservaEmergencia');
    expect(cat(reservaOport, null)).toBe('reservaOportunidade');
    // Tesouro de catálogo sem override: segue em Renda Fixa aqui, como antes.
    expect(cat(tesouro, null, { reservaDestino: 'emergencia' })).toBe('rendaFixaFundos');
  });

  it('RV ↔ trio continua bloqueado', () => {
    vi.stubEnv('MOVER_CAIXA_RF_HABILITADO', 'true');
    expect(cat(fii, 'rendaFixaFundos')).toBe('fiis');
    expect(cat(cdb, 'acoes')).toBe('rendaFixaFundos');
    expect(cat(fii, 'fimFia')).toBe('fimFia');
  });
});

describe('getCategoriaFromPortfolio — trio com a chave desligada', () => {
  it('override do trio ignorado: tudo como antes', () => {
    vi.stubEnv('MOVER_CAIXA_RF_HABILITADO', 'false');
    expect(cat(cdb, 'reservaEmergencia')).toBe('rendaFixaFundos');
    expect(cat(reservaEmerg, 'reservaOportunidade')).toBe('reservaEmergencia');
    expect(cat(reservaComTitulo, 'rendaFixaFundos')).toBe('reservaEmergencia');
    expect(cat(tesouro, 'reservaEmergencia', { reservaDestino: null })).toBe('rendaFixaFundos');
    // Fase 1 intacta.
    expect(cat(fii, 'fimFia')).toBe('fimFia');
  });
});
