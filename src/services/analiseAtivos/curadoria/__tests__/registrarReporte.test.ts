import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/services/push/enviarPush', () => ({ enviarPushDaNotificacao: vi.fn() }));

import { logger } from '@/lib/logger';
import {
  registrarReporte,
  validarCorpoReporte,
  type CorpoReporte,
} from '@/services/analiseAtivos/curadoria/registrarReporte';
import { notificarAdminsNovoCaso } from '@/services/analiseAtivos/curadoria/notificacoesReporte';
import { chaveCaso } from '@/services/analiseAtivos/curadoria/contrato';
import { criarBancoFalso, linhaQuadro, type BancoFalso } from './bancoFalsoCuradoria';

const AGORA = new Date('2026-10-02T15:00:00Z'); // sexta
const corpoValido = (over: Partial<CorpoReporte> = {}): CorpoReporte => ({
  ticker: 'WEGE3',
  bloco: 'valuation',
  campo: 'payout',
  valorExibido: '55%',
  periodo: '2025',
  fonteExibida: 'CVM DFP 2025',
  frescorExibido: 'atualizado em 29/09',
  versao: 'q-2026-10-02',
  mensagem: 'O release do 4T25 informa payout de 52% em 2025.',
  valorEsperado: '52%',
  fonteEsperada: 'release 4T25 no site de RI',
  ...over,
});

let banco: BancoFalso;
const db = () => banco.db as unknown as PrismaClient;
const registrar = (over: Partial<CorpoReporte> = {}, extra: Record<string, unknown> = {}) =>
  registrarReporte(db(), {
    autorId: 'u1',
    clienteId: null,
    corpo: corpoValido(over),
    linha: linhaQuadro(),
    removidos: 0,
    agora: AGORA,
    ...extra,
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  banco = criarBancoFalso();
});

describe('validarCorpoReporte', () => {
  const bruto = (over: Record<string, unknown> = {}) => ({
    ticker: 'wege3',
    bloco: 'valuation',
    campo: 'payout',
    versao: 'q1',
    mensagem: 'payout errado no 4T25',
    ...over,
  });

  it('aceita o mínimo, normaliza o ticker e troca opcionais vazios por null', () => {
    const r = validarCorpoReporte(bruto({ valorEsperado: '   ' }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.corpo.ticker).toBe('WEGE3');
    expect(r.corpo.valorEsperado).toBeNull();
    expect(r.corpo.periodo).toBeNull();
  });

  it('remove bidi/zero-width/controle ANTES do tamanho e conta o que removeu', () => {
    const r = validarCorpoReporte(bruto({ mensagem: 'abc‮def​ghi\u0007jk' }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.corpo.mensagem).toBe('abcdefghijk');
    expect(r.removidos).toBe(3);
    // 9 visíveis + 3 invisíveis: curto depois de saneado
    const curto = validarCorpoReporte(bruto({ mensagem: 'abcdefghi‮​﻿' }));
    expect(curto).toEqual({ ok: false, erros: { mensagem: ['min'] } });
  });

  it('HTML em qualquer texto → erro "html" no campo', () => {
    expect(validarCorpoReporte(bruto({ mensagem: 'veja <script>alert(1)</script>' }))).toEqual({
      ok: false,
      erros: { mensagem: ['html'] },
    });
    expect(validarCorpoReporte(bruto({ fonteEsperada: '<a href=x>RI</a>' }))).toEqual({
      ok: false,
      erros: { fonteEsperada: ['html'] },
    });
  });

  it('limites por campo (valor esperado até 40, decisão 8) e campo fora da allowlist', () => {
    expect(validarCorpoReporte(bruto({ valorEsperado: 'x'.repeat(41) }))).toEqual({
      ok: false,
      erros: { valorEsperado: ['max'] },
    });
    expect(validarCorpoReporte(bruto({ mensagem: 'x'.repeat(1001) }))).toEqual({
      ok: false,
      erros: { mensagem: ['max'] },
    });
    expect(validarCorpoReporte(bruto({ campo: 'receita' }))).toEqual({
      ok: false,
      erros: { campo: ['invalido'] },
    });
    expect(validarCorpoReporte(bruto({ campo: 'outro' })).ok).toBe(true);
  });

  it('zod strict: chave desconhecida e bloco inválido → erro', () => {
    const extra = validarCorpoReporte(bruto({ userId: 'u2' }));
    expect(extra.ok).toBe(false);
    expect(validarCorpoReporte(bruto({ bloco: 'tese' })).ok).toBe(false);
    expect(validarCorpoReporte(null).ok).toBe(false);
  });
});

describe('registrarReporte', () => {
  it('1º relato: caso novo de usuário com prazo de 5 dias úteis, relato e eventos', async () => {
    const r = await registrar();
    expect(r.tipo).toBe('criado');
    if (r.tipo !== 'criado') return;
    expect(r.casoNovo).toBe(true);
    expect(r.primeiroRelato).toBe(true);
    // sexta 02/10 → 05, 06, 07, 08, 09/10
    expect(r.resposta).toMatchObject({ status: 'aberto', slaAte: '2026-10-09' });
    expect(r.resposta.protocolo).toMatch(/^[2-9A-HJKMNP-Z]{8}$/);
    const caso = banco.tabelas.casos[0];
    expect(caso).toMatchObject({
      symbol: 'WEGE3',
      origem: 'usuario',
      grupo: 'outro',
      campo: 'payout',
      periodo: '2025',
      chaveAberta: chaveCaso({ symbol: 'WEGE3', campo: 'payout', periodo: '2025' }),
      nReportes: 1,
    });
    const rep = banco.tabelas.reportes[0];
    expect(rep).toMatchObject({
      userId: 'u1',
      clienteId: null,
      valorEsperado: '52%',
      versaoQuadro: 'q-2026-10-02',
    });
    // retrato do servidor com a linha do Quadro
    expect(rep.contextoServidor).toMatchObject({
      estadoIndice: 'calculado',
      paramsVersion: 1,
      dataRef: '2026-10-02',
      valores: expect.objectContaining({ payoutPct: 55, preco: 52.1 }),
    });
    expect(banco.tabelas.eventos.map((e) => e.tipo)).toEqual(['aberto', 'reporte']);
    // o evento NUNCA leva o texto livre do usuário
    expect(JSON.stringify(banco.tabelas.eventos)).not.toContain('release');
    expect(banco.db.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('duplicado: relato aberto do mesmo usuário × ativo × dado → nada criado', async () => {
    const r1 = await registrar();
    const r2 = await registrar({ mensagem: 'outro texto sobre o mesmo payout' });
    expect(r2.tipo).toBe('duplicado');
    if (r1.tipo !== 'criado' || r2.tipo !== 'duplicado') return;
    expect(r2).toEqual({
      tipo: 'duplicado',
      casoId: r1.resposta.casoId,
      reporteId: r1.resposta.id,
    });
    expect(banco.tabelas.reportes).toHaveLength(1);
  });

  it('outro usuário relatando o mesmo dado entra no MESMO caso (sem prazo novo)', async () => {
    const r1 = await registrar();
    const r2 = await registrar({}, { autorId: 'u2' });
    if (r1.tipo !== 'criado' || r2.tipo !== 'criado') throw new Error('esperado criado');
    expect(r2.resposta.casoId).toBe(r1.resposta.casoId);
    expect(r2.casoNovo).toBe(false);
    expect(r2.primeiroRelato).toBe(false);
    expect(banco.tabelas.casos).toHaveLength(1);
    expect(banco.tabelas.casos[0].nReportes).toBe(2);
  });

  it('caso fechado: relato novo abre outro caso com casoAnteriorId', async () => {
    const r1 = await registrar();
    if (r1.tipo !== 'criado') throw new Error('esperado criado');
    Object.assign(banco.tabelas.casos[0], {
      status: 'rejeitado',
      chaveAberta: null,
      resolvidoEm: new Date('2026-10-02T16:00:00Z'),
    });
    const r2 = await registrar({ mensagem: 'continua errado depois da resposta' });
    if (r2.tipo !== 'criado') throw new Error('esperado criado');
    expect(r2.resposta.casoId).not.toBe(r1.resposta.casoId);
    expect(banco.tabelas.casos[1].casoAnteriorId).toBe(r1.resposta.casoId);
  });

  it('anexa ao caso de REGRA aberto só quando o campo pertence ao grupo (vira misto)', async () => {
    const regra = banco.casoDeRegra({
      symbol: 'WEGE3',
      classe: 'acao',
      grupo: 'proventos',
      campo: 'dy12m',
      periodo: '2026-09-30',
      chaveAberta: 'WEGE3|dy12m|2026-09-30',
      regraCodigo: 'dy_acima_teto',
    });
    const r = await registrar({ bloco: 'valuation', campo: 'payout' });
    if (r.tipo !== 'criado') throw new Error('esperado criado');
    expect(r.resposta.casoId).toBe(regra.id);
    expect(r.primeiroRelato).toBe(true);
    expect(r.casoNovo).toBe(false);
    expect(regra).toMatchObject({ origem: 'misto', nReportes: 1 });
    // caso de regra não tinha prazo: o 1º relato define
    expect((regra.slaAte as Date).toISOString().slice(0, 10)).toBe('2026-10-09');
  });

  it('campo FORA do grupo do caso de regra → caso novo de usuário', async () => {
    const regra = banco.casoDeRegra({
      symbol: 'WEGE3',
      classe: 'acao',
      grupo: 'proventos',
      campo: 'dy12m',
      chaveAberta: 'WEGE3|dy12m|2026-09-30',
    });
    const r = await registrar({ bloco: 'valuation', campo: 'pl', periodo: null });
    if (r.tipo !== 'criado') throw new Error('esperado criado');
    expect(r.resposta.casoId).not.toBe(regra.id);
    expect(regra.origem).toBe('regra');
    expect(r.casoNovo).toBe(true);
  });

  it("campo 'outro' nunca entra em caso de regra", async () => {
    banco.casoDeRegra({ symbol: 'WEGE3', classe: 'acao', grupo: 'proventos', campo: 'dy12m' });
    const r = await registrar({ campo: 'outro', periodo: null });
    if (r.tipo !== 'criado') throw new Error('esperado criado');
    expect(r.casoNovo).toBe(true);
  });

  it('consultor agindo: autor = consultor, clienteId = cliente', async () => {
    await registrar({}, { autorId: 'consultor-1', clienteId: 'cliente-9' });
    expect(banco.tabelas.reportes[0]).toMatchObject({
      userId: 'consultor-1',
      clienteId: 'cliente-9',
    });
  });

  describe('limites (decisão 6)', () => {
    const relatosAntigos = (n: number, over: Record<string, unknown>) => {
      const caso = banco.casoDeRegra({ symbol: 'ZZZZ3', origem: 'usuario', status: 'corrigido' });
      for (let i = 0; i < n; i += 1) {
        banco.tabelas.reportes.push({
          id: `r${i}`,
          casoId: caso.id,
          userId: 'u1',
          symbol: 'ZZZZ3',
          campo: `c${i}`,
          createdAt: new Date(AGORA.getTime() - (i + 1) * 60_000),
          ...over,
        });
      }
    };

    it('6º relato em 24 h → limite "dia" com voltaEm', async () => {
      relatosAntigos(5, {});
      const r = await registrar();
      expect(r).toEqual({
        tipo: 'limite',
        limite: 'dia',
        // o mais antigo (5 min atrás) + 24 h
        voltaEm: new Date(AGORA.getTime() - 5 * 60_000 + 24 * 3600_000).toISOString(),
      });
      expect(banco.tabelas.reportes).toHaveLength(5);
    });

    it('4º relato no mesmo ativo em 1 h → limite "hora_ativo"', async () => {
      relatosAntigos(3, { symbol: 'WEGE3' });
      const r = await registrar();
      expect(r).toMatchObject({ tipo: 'limite', limite: 'hora_ativo' });
    });

    it('300 no total em 24 h → limite "global" + logger.error', async () => {
      relatosAntigos(300, { userId: 'outra-pessoa' });
      const r = await registrar();
      expect(r).toMatchObject({ tipo: 'limite', limite: 'global', voltaEm: null });
      expect(logger.error).toHaveBeenCalled();
    });

    it('relatos de mais de 24 h não contam', async () => {
      relatosAntigos(5, { createdAt: new Date(AGORA.getTime() - 25 * 3600_000) });
      expect((await registrar()).tipo).toBe('criado');
    });
  });
});

describe('notificarAdminsNovoCaso', () => {
  const caso = { id: 'caso-1', symbol: 'WEGE3', campo: 'payout', slaAte: '2026-10-09' };

  beforeEach(() => {
    banco.tabelas.usuarios.push({ id: 'adm1', role: 'admin' }, { id: 'adm2', role: 'admin' });
  });

  it('fora de produção ou com a flag desligada: não avisa', async () => {
    vi.stubEnv('ANALISE_ATIVOS_REPORTE_HABILITADO', 'true');
    expect(await notificarAdminsNovoCaso(db(), caso)).toBe(0);
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ANALISE_ATIVOS_REPORTE_HABILITADO', 'false');
    expect(await notificarAdminsNovoCaso(db(), caso)).toBe(0);
    expect(banco.tabelas.notificacoes).toHaveLength(0);
  });

  it('produção + flag: avisa cada admin 1× por caso, mesmo com ALERTA_ADMIN desligado', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ANALISE_ATIVOS_REPORTE_HABILITADO', 'true');
    vi.stubEnv('ANALISE_ATIVOS_ALERTA_ADMIN', 'false');
    expect(await notificarAdminsNovoCaso(db(), caso)).toBe(2);
    expect(banco.tabelas.notificacoes[0]).toMatchObject({
      type: 'analise_ativos_reporte',
      title: 'Novo relato de dado: WEGE3 · Payout',
      message: expect.stringContaining('09/10/2026'),
      metadata: { casoId: 'caso-1', href: '/admin/curadoria/caso-1' },
    });
    // não empilha enquanto houver aviso não lido do caso
    expect(await notificarAdminsNovoCaso(db(), caso)).toBe(0);
    // adm1 leu: o próximo relato do caso avisa só ele
    banco.tabelas.notificacoes[0].readAt = new Date();
    expect(await notificarAdminsNovoCaso(db(), caso)).toBe(1);
  });

  it('erro no banco nunca lança', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ANALISE_ATIVOS_REPORTE_HABILITADO', 'true');
    banco.db.user.findMany.mockRejectedValueOnce(new Error('caiu'));
    expect(await notificarAdminsNovoCaso(db(), caso)).toBe(0);
    expect(logger.error).toHaveBeenCalled();
  });
});
