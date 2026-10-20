import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';
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
  paraLinhaQuadroApiNaJanela,
  versaoQuadro,
} from '../linhasQuadro';
import {
  COMPACTOS_WEGE3,
  CRITERIOS_LINHA_HGLG11,
  CRITERIOS_LINHA_WEGE3,
} from '@/test/fixtures/analiseAtivos/criterios';
import type { CriteriosCompactos } from '@/types/analiseAtivosCriterios';
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

    it('API memorizada por versão e janela', async () => {
      prepararBanco();
      const a = await obterLinhasQuadroApi('fii');
      const b = await obterLinhasQuadroApi('fii');
      expect(a[0]).toBe(b[0]);
      expect(a.map((l) => l.ticker)).toEqual(['HCTR11', 'HFOF11', 'HGLG11']);
      const c = await obterLinhasQuadroApi('fii', { janela: 10 });
      expect(c[0]).not.toBe(a[0]);
      expect(await obterLinhasQuadroApi('fii', { janela: 10 })).toEqual(c);
      expect(mockPrisma.analiseQuadroLinha.findMany).toHaveBeenCalledTimes(1);
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

  describe('v2.4: critérios da janela e motivos de conferência, sem o indicador antigo', () => {
    const compactosHglg: CriteriosCompactos = {
      '3': { n: 4, de: 6, m: CRITERIOS_LINHA_HGLG11.marcas.map((m) => [m.id, m.estado, m.fato]) },
      '5': {
        n: CRITERIOS_LINHA_HGLG11.n,
        de: CRITERIOS_LINHA_HGLG11.de,
        m: CRITERIOS_LINHA_HGLG11.marcas.map((m) => [m.id, m.estado, m.fato]),
      },
    };

    it('nenhuma chave /indice|semaforo|destaque/ na linha convertida (varredura recursiva)', () => {
      const chaves: string[] = [];
      const visitar = (v: unknown) => {
        if (Array.isArray(v)) return v.forEach(visitar);
        if (v && typeof v === 'object') {
          for (const [k, x] of Object.entries(v)) {
            chaves.push(k);
            visitar(x);
          }
        }
      };
      for (const row of LINHAS_FIXTURE) visitar(paraLinhaQuadroApi(row));
      expect(chaves.filter((k) => /indice|semaforo|destaque/i.test(k))).toEqual([]);
    });

    it('projeta a janela pedida da cópia compacta (padrão 5)', () => {
      const row = { ...LINHA_WEGE3, criterios: COMPACTOS_WEGE3, perfilCriterios: 'acao' };
      expect(paraLinhaQuadroApi(row).criterios).toEqual(CRITERIOS_LINHA_WEGE3);
      const hglg = {
        ...LINHA_HGLG11,
        criterios: compactosHglg,
        perfilCriterios: 'fii_tijolo',
      };
      expect(paraLinhaQuadroApiNaJanela(hglg, 3).criterios).toMatchObject({
        janela: 3,
        n: 4,
        de: 6,
        perfil: 'fii_tijolo',
      });
      expect(paraLinhaQuadroApiNaJanela(hglg, 5).criterios).toEqual(CRITERIOS_LINHA_HGLG11);
    });

    it('sem avaliação (job não rodou, janela ausente ou perfil inválido) = null', () => {
      expect(paraLinhaQuadroApi(LINHA_WEGE3).criterios).toBeNull();
      const row = { ...LINHA_WEGE3, criterios: COMPACTOS_WEGE3, perfilCriterios: 'acao' };
      expect(paraLinhaQuadroApiNaJanela(row, 10).criterios).toBeNull();
      expect(paraLinhaQuadroApi({ ...row, perfilCriterios: 'xpto' }).criterios).toBeNull();
      expect(paraLinhaQuadroApi({ ...row, criterios: 'lixo' }).criterios).toBeNull();
    });

    it('motivosConferencia = os códigos gravados pelo job, com texto', () => {
      expect(paraLinhaQuadroApi(LINHA_TGMA3).motivosConferencia).toEqual([
        { codigo: 'div:fonte_defasada', texto: 'proventos em conferência' },
      ]);
      expect(paraLinhaQuadroApi(LINHA_WEGE3).motivosConferencia).toEqual([]);
      // linhas sem score e fora do Quadro antigo não carregam texto do indicador antigo
      for (const row of [LINHA_AURE3, LINHA_HCTR11, LINHA_HFOF11]) {
        const texto = JSON.stringify(paraLinhaQuadroApi(row));
        expect(texto).not.toMatch(/Índice/);
      }
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

    it('trava de plausibilidade: DY acima do teto fica com valor e em conferência; motivo legível', () => {
      const api = paraLinhaQuadroApi({
        ...LINHA_ITUB4,
        flags: ['proventos_em_conferencia_dy_acima_teto'],
        estadoIndice: 'incompleto',
        motivosIncompleto: ['div:em_conferencia'],
      });
      expect(api.proventosEmConferencia).toBe(true);
      expect(api.dy12m).toMatchObject({ estado: 'ok' });
      expect(api.motivosConferencia).toEqual([
        { codigo: 'div:em_conferencia', texto: 'proventos em conferência' },
      ]);
      const sem = paraLinhaQuadroApi({ ...LINHA_ITUB4, flags: [], motivosIncompleto: [] });
      expect(sem.proventosEmConferencia).toBe(false);
    });
  });

  describe('A6 (fatia E): obrigacoesAtivoPct atrás de ANALISE_ATIVOS_ALAV_ATIVO_HABILITADO', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('chave desligada: a chave não existe em nenhuma linha (resposta idêntica à de hoje)', () => {
      vi.stubEnv('ANALISE_ATIVOS_ALAV_ATIVO_HABILITADO', '');
      const fii = paraLinhaQuadroApi({ ...LINHA_HGLG11, obrigacoesAtivoPct: 12.5 });
      expect('obrigacoesAtivoPct' in fii).toBe(false);
      expect(fii.obrigacoesPl).toEqual({ estado: 'ok', valor: 16.25 });
      expect('obrigacoesAtivoPct' in paraLinhaQuadroApi(LINHA_WEGE3)).toBe(false);
    });

    it('chave ligada: FII com o próprio valor; ação sem a chave; CNPJ não conferido em conferência', () => {
      vi.stubEnv('ANALISE_ATIVOS_ALAV_ATIVO_HABILITADO', 'true');
      const fii = paraLinhaQuadroApi({ ...LINHA_HGLG11, obrigacoesAtivoPct: 12.5 });
      expect(fii.obrigacoesAtivoPct).toEqual({ estado: 'ok', valor: 12.5 });
      expect(fii.obrigacoesPl).toEqual({ estado: 'ok', valor: 16.25 });
      expect('obrigacoesAtivoPct' in paraLinhaQuadroApi(LINHA_WEGE3)).toBe(false);
      expect(
        paraLinhaQuadroApi({ ...LINHA_HGLG11, obrigacoesAtivoPct: null }).obrigacoesAtivoPct,
      ).toMatchObject({ estado: 'ausente', motivo: 'sem_dado_fonte' });
      expect(
        paraLinhaQuadroApi({
          ...LINHA_HGLG11,
          obrigacoesAtivoPct: null,
          flags: ['cnpj_em_conferencia'],
        }).obrigacoesAtivoPct,
      ).toMatchObject({ estado: 'ausente', motivo: 'cnpj_em_conferencia' });
    });
  });
});
