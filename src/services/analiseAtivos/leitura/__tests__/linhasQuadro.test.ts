import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

const mockPrisma = vi.hoisted(() => ({
  analiseQuadroLinha: { aggregate: vi.fn(), findMany: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

import {
  INTERVALO_SONDA_VERSAO_MS,
  VERSAO_VAZIA,
  _resetarCacheLinhasQuadro,
  decimalParaNumero,
  obterLinhaQuadro,
  obterLinhasQuadro,
  obterLinhasQuadroApi,
  paraLinhaQuadroApi,
  versaoQuadro,
} from '../linhasQuadro';
import {
  GERADO_EM_FIXTURE,
  LINHAS_FIXTURE,
  LINHA_AURE3,
  LINHA_HCTR11,
  LINHA_HFOF11,
  LINHA_HGLG11,
  LINHA_ITUB4,
  LINHA_TGMA3,
  LINHA_WEGE3,
} from '@/test/fixtures/analiseAtivos/linhasDb';

function prepararBanco(geradoEm: Date | null = GERADO_EM_FIXTURE, linhas = LINHAS_FIXTURE) {
  mockPrisma.analiseQuadroLinha.aggregate.mockResolvedValue({ _max: { geradoEm } });
  mockPrisma.analiseQuadroLinha.findMany.mockResolvedValue(linhas);
}

describe('linhasQuadro', () => {
  beforeEach(() => {
    _resetarCacheLinhasQuadro();
    mockPrisma.analiseQuadroLinha.aggregate.mockReset();
    mockPrisma.analiseQuadroLinha.findMany.mockReset();
  });

  describe('versão e cache', () => {
    it('versão = max(geradoEm) ISO; vazio sem linhas', async () => {
      prepararBanco();
      expect(await versaoQuadro(1000)).toBe(GERADO_EM_FIXTURE.toISOString());
      _resetarCacheLinhasQuadro();
      prepararBanco(null, []);
      expect(await versaoQuadro(1000)).toBe(VERSAO_VAZIA);
    });

    it('sonda no máximo 1× a cada 60 s', async () => {
      prepararBanco();
      await versaoQuadro(1000);
      await versaoQuadro(1000 + INTERVALO_SONDA_VERSAO_MS - 1);
      expect(mockPrisma.analiseQuadroLinha.aggregate).toHaveBeenCalledTimes(1);
      await versaoQuadro(1000 + INTERVALO_SONDA_VERSAO_MS + 1);
      expect(mockPrisma.analiseQuadroLinha.aggregate).toHaveBeenCalledTimes(2);
    });

    it('linhas em memória: um findMany por versão; requisições simultâneas compartilham a carga', async () => {
      prepararBanco();
      await Promise.all([
        obterLinhasQuadro('acao'),
        obterLinhasQuadro('fii'),
        obterLinhaQuadro('WEGE3'),
      ]);
      await obterLinhasQuadro();
      expect(mockPrisma.analiseQuadroLinha.findMany).toHaveBeenCalledTimes(1);
    });

    it('troca de versão recarrega as linhas', async () => {
      vi.useFakeTimers();
      try {
        prepararBanco();
        await obterLinhasQuadro();
        vi.advanceTimersByTime(INTERVALO_SONDA_VERSAO_MS + 1);
        prepararBanco(new Date('2026-10-01T10:40:00.000Z'), [LINHA_WEGE3]);
        const linhas = await obterLinhasQuadro(undefined, { incluirForaDoQuadro: true });
        expect(linhas.map((l) => l.symbol)).toEqual(['WEGE3']);
        expect(mockPrisma.analiseQuadroLinha.findMany).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it('filtra classe e noQuadro; obterLinhaQuadro acha fora do Quadro e ignora caixa', async () => {
      prepararBanco();
      const acoes = await obterLinhasQuadro('acao');
      expect(acoes.map((l) => l.symbol)).toEqual(['AURE3', 'ITUB4', 'TGMA3', 'WEGE3']);
      const todas = await obterLinhasQuadro('acao', { incluirForaDoQuadro: true });
      expect(todas.map((l) => l.symbol)).toContain('CEDO4');
      expect((await obterLinhaQuadro('cedo4'))?.noQuadro).toBe(false);
      expect(await obterLinhaQuadro('XXXX3')).toBeNull();
    });

    it('API memorizada por versão', async () => {
      prepararBanco();
      const a = await obterLinhasQuadroApi('fii');
      const b = await obterLinhasQuadroApi('fii');
      expect(a[0]).toBe(b[0]);
      expect(a.map((l) => l.ticker)).toEqual(['HCTR11', 'HFOF11', 'HGLG11']);
    });
  });

  describe('Decimal', () => {
    it('converte Decimal, número e nulo', () => {
      expect(decimalParaNumero(new Prisma.Decimal('147.930000'))).toBe(147.93);
      expect(decimalParaNumero(3)).toBe(3);
      expect(decimalParaNumero(null)).toBeNull();
      expect(decimalParaNumero(Number.NaN)).toBeNull();
    });

    it('preço, liquidez e patrimônio saem como number; datas AAAA-MM-DD', () => {
      const api = paraLinhaQuadroApi(LINHA_HGLG11);
      expect(api.preco).toEqual({ estado: 'ok', valor: 147.93 });
      expect(api.patrimonio).toBe(7567668488.14);
      expect(api.liquidezMedia21).toBe(1000000);
      expect(api.precoData).toBe('2026-09-29');
    });
  });

  describe('três estados', () => {
    it('ok, inclusive zero', () => {
      const api = paraLinhaQuadroApi(LINHA_AURE3);
      expect(api.dy12m).toEqual({ estado: 'ok', valor: 0 });
      expect(api.roe).toEqual({ estado: 'ok', valor: -9.47 });
    });

    it('ausente com motivo: P/L com prejuízo; DY com proventos em conferência', () => {
      const aure = paraLinhaQuadroApi(LINHA_AURE3);
      expect(aure.pl).toEqual({
        estado: 'ausente',
        motivo: 'prejuizo',
        texto: 'P/L não calculado: prejuízo no último exercício',
      });
      const tgma = paraLinhaQuadroApi(LINHA_TGMA3);
      expect(tgma.dy12m).toMatchObject({ estado: 'ausente', motivo: 'fonte_defasada' });
      expect(tgma.payout).toMatchObject({ texto: 'proventos em conferência' });
      expect(tgma.proventosEmConferencia).toBe(true);
    });

    it('FII com ticker↔CNPJ não conferido: P/VP em conferência', () => {
      const api = paraLinhaQuadroApi({
        ...LINHA_HGLG11,
        pvp: null,
        flags: ['cnpj_em_conferencia'],
      });
      expect(api.pvp).toMatchObject({ estado: 'ausente', motivo: 'cnpj_em_conferencia' });
    });

    it('não se aplica: financeira, papel sem imóveis e campo de outra classe', () => {
      const itub = paraLinhaQuadroApi(LINHA_ITUB4);
      expect(itub.divLiqEbitda).toMatchObject({ estado: 'nao_se_aplica', motivo: 'financeira' });
      expect(itub.vacanciaCvm).toMatchObject({ estado: 'nao_se_aplica', motivo: 'fora_do_escopo' });
      const hctr = paraLinhaQuadroApi(LINHA_HCTR11);
      expect(hctr.vacanciaCvm).toMatchObject({
        estado: 'nao_se_aplica',
        motivo: 'papel_sem_imoveis',
      });
      expect(hctr.roe.estado).toBe('nao_se_aplica');
    });

    it('naoSeAplica com motivo explícito', () => {
      const api = paraLinhaQuadroApi({
        ...LINHA_HGLG11,
        naoSeAplica: ['vacanciaFisicaCvmPct:criterio_desligado'],
      });
      expect(api.vacanciaCvm).toMatchObject({ motivo: 'criterio_desligado' });
    });
  });

  describe('Índice nos cinco estados', () => {
    it('calculado, incompleto, zero_regra, sem_score e fora_do_indice', () => {
      expect(paraLinhaQuadroApi(LINHA_WEGE3).indice).toMatchObject({
        valor: 9.01,
        estado: 'calculado',
        motivos: [],
        criteriosAtendidos: 4,
      });
      expect(paraLinhaQuadroApi(LINHA_TGMA3).indice).toMatchObject({
        valor: 8.48,
        estado: 'incompleto',
        motivos: [{ codigo: 'div:fonte_defasada', texto: 'proventos em conferência' }],
      });
      const aure = paraLinhaQuadroApi(LINHA_AURE3).indice;
      expect(aure.estado).toBe('zero_regra');
      expect(aure.valor).toBe(0.08);
      expect(aure.motivos[0].texto).toBe(
        'Componente zerado pela regra: prejuízo no último exercício',
      );
      expect(paraLinhaQuadroApi(LINHA_HCTR11).indice).toMatchObject({
        valor: null,
        estado: 'sem_score',
      });
      expect(paraLinhaQuadroApi(LINHA_HFOF11).indice.motivos[0].texto).toBe(
        'fora do Índice MF nesta fase',
      );
    });

    it('série só com pontos válidos, ordenada, suspeito preservado; tipo da série por classe', () => {
      const api = paraLinhaQuadroApi({
        ...LINHA_WEGE3,
        serie10a: [{ ano: 2025, valor: 2.45, suspeito: true }, { ano: 2024, valor: 0.76 }, 'x'],
      });
      expect(api.serie10a).toEqual([
        { ano: 2024, valor: 0.76 },
        { ano: 2025, valor: 2.45, suspeito: true },
      ]);
      expect(api.tipoSerie).toBe('lucro');
      expect(paraLinhaQuadroApi(LINHA_HGLG11).tipoSerie).toBe('rendimento');
      expect(paraLinhaQuadroApi(LINHA_WEGE3).proventosEmConferencia).toBe(true);
    });
  });
});
