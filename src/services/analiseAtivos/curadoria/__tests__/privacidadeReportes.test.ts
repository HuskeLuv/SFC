import { beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  anonimizarReportesDoUsuario,
  anonimizarReportesRetencao,
  corteRetencao,
  relatosParaExportacao,
} from '@/services/analiseAtivos/curadoria/privacidadeReportes';
import { criarBancoFalso, type BancoFalso } from './bancoFalsoCuradoria';

const AGORA = new Date('2026-10-03T12:00:00Z');
let banco: BancoFalso;
const db = () => banco.db as unknown as PrismaClient;

function relato(over: Record<string, unknown>) {
  const r = {
    id: `r-${banco.tabelas.reportes.length + 1}`,
    protocolo: `P${banco.tabelas.reportes.length + 1}`,
    userId: 'u1',
    clienteId: null,
    symbol: 'WEGE3',
    bloco: 'valuation',
    campo: 'payout',
    periodo: '2025',
    valorExibido: '55%',
    valorEsperado: '52%',
    fonteExibida: 'CVM',
    frescorExibido: null,
    mensagem: 'meu texto com dado pessoal: joao@x.com',
    fonteEsperada: 'site de RI',
    contextoServidor: { estadoIndice: 'calculado' },
    anonimizadoEm: null,
    respondidoEm: null,
    createdAt: new Date('2025-01-10T12:00:00Z'),
    ...over,
  };
  banco.tabelas.reportes.push(r);
  return r;
}

beforeEach(() => {
  banco = criarBancoFalso();
});

describe('anonimizarReportesDoUsuario (exclusão de conta)', () => {
  it('limpa mensagem/valor esperado/fonte do autor e o vínculo de cliente; caso fica', async () => {
    const caso = banco.casoDeRegra({ symbol: 'WEGE3', origem: 'usuario' });
    const meu = relato({ casoId: caso.id });
    const outro = relato({ casoId: caso.id, userId: 'u2', mensagem: 'texto do u2' });
    const comoCliente = relato({ casoId: caso.id, userId: 'consultor', clienteId: 'u1' });

    const r = await anonimizarReportesDoUsuario(db(), 'u1', AGORA);
    expect(r).toEqual({ anonimizados: 1, desvinculados: 1 });
    expect(meu).toMatchObject({
      mensagem: '[removido]',
      valorEsperado: null,
      fonteEsperada: null,
      anonimizadoEm: AGORA,
      // o que a TELA mostrava continua (não é dado pessoal)
      valorExibido: '55%',
    });
    expect(outro.mensagem).toBe('texto do u2');
    expect(comoCliente.clienteId).toBeNull();
    expect(banco.tabelas.casos).toHaveLength(1);
    expect(banco.tabelas.eventos).toEqual([
      expect.objectContaining({ casoId: caso.id, tipo: 'anonimizado', texto: 'exclusão de conta' }),
    ]);
  });

  it('idempotente: 2ª chamada não mexe em nada', async () => {
    const caso = banco.casoDeRegra({ symbol: 'WEGE3' });
    relato({ casoId: caso.id });
    await anonimizarReportesDoUsuario(db(), 'u1', AGORA);
    const r = await anonimizarReportesDoUsuario(db(), 'u1', AGORA);
    expect(r.anonimizados).toBe(0);
  });
});

describe('anonimizarReportesRetencao (12 meses após o fechamento)', () => {
  it('corte = 12 meses antes', () => {
    expect(corteRetencao(AGORA).toISOString()).toBe('2025-10-03T12:00:00.000Z');
  });

  it('só relatos de casos FECHADOS há mais de 12 meses', async () => {
    const velho = banco.casoDeRegra({
      symbol: 'WEGE3',
      status: 'rejeitado',
      resolvidoEm: new Date('2025-09-01T00:00:00Z'),
    });
    const recente = banco.casoDeRegra({
      symbol: 'ITUB4',
      status: 'corrigido',
      resolvidoEm: new Date('2026-01-01T00:00:00Z'),
    });
    const aberto = banco.casoDeRegra({ symbol: 'PETR4', status: 'aberto' });
    const a = relato({ casoId: velho.id });
    const b = relato({ casoId: recente.id });
    const c = relato({ casoId: aberto.id });

    const r = await anonimizarReportesRetencao(db(), AGORA);
    expect(r.anonimizados).toBe(1);
    expect(a.mensagem).toBe('[removido]');
    expect(b.mensagem).not.toBe('[removido]');
    expect(c.mensagem).not.toBe('[removido]');
    expect(banco.tabelas.eventos.map((e) => e.texto)).toEqual(['retenção de 12 meses']);
    // idempotente
    expect((await anonimizarReportesRetencao(db(), AGORA)).anonimizados).toBe(0);
  });
});

describe('relatosParaExportacao', () => {
  it('só os relatos do usuário, com status como ele vê e resposta só se fechado', async () => {
    const fechado = banco.casoDeRegra({
      symbol: 'WEGE3',
      status: 'rejeitado',
      resolucao: 'dado_confirmado',
      respostaPublica: 'Conferimos com a CVM.',
      resolvidoEm: new Date('2026-10-01T00:00:00Z'),
    });
    const emAnalise = banco.casoDeRegra({
      symbol: 'ITUB4',
      status: 'em_analise',
      respostaPublica: 'rascunho do curador',
    });
    relato({ casoId: fechado.id });
    relato({ casoId: emAnalise.id, symbol: 'ITUB4', clienteId: 'cliente-1' });
    relato({ casoId: emAnalise.id, userId: 'u2' });

    const out = await relatosParaExportacao(db(), 'u1');
    expect(out).toHaveLength(2);
    const porSymbol = Object.fromEntries(out.map((r) => [r.symbol, r]));
    expect(porSymbol.WEGE3.caso).toEqual({
      status: 'conferido_sem_alteracao',
      resolucao: 'dado_confirmado',
      respostaPublica: 'Conferimos com a CVM.',
      resolvidoEm: new Date('2026-10-01T00:00:00Z'),
    });
    expect(porSymbol.ITUB4.caso).toMatchObject({ status: 'em_analise', respostaPublica: null });
    expect(porSymbol.ITUB4.agindoPeloCliente).toBe(true);
    expect(porSymbol.ITUB4).not.toHaveProperty('clienteId');
  });
});
