import { describe, expect, it } from 'vitest';
import {
  calcularFrescor,
  deveAlertar,
  JOB_POR_CAMADA,
  LIMITES_FRESCOR_PADRAO,
} from '@/services/analiseAtivos/regras/eventos/alertasFrescor';
import type { Camada, NomeJob } from '@/services/analiseAtivos/tipos';

const AGORA = new Date('2026-09-30T09:26:00Z');
const H = 60 * 60 * 1000;
const antes = (horas: number) => new Date(AGORA.getTime() - horas * H);

/** status do mais antigo para o mais novo; o último é o run que acabou de terminar (agora) */
function runs(statuses: string[], intervaloH = 24) {
  return statuses.map((status, i) => ({
    status,
    inicio: antes((statuses.length - 1 - i) * intervaloH),
  }));
}

describe('deveAlertar', () => {
  it('[ok, falha] ⇒ não', () => {
    expect(deveAlertar(runs(['ok', 'falha']), AGORA)).toEqual({ alertar: false, motivo: null });
  });

  it('[falha, falha] ⇒ sim', () => {
    expect(deveAlertar(runs(['falha', 'falha']), AGORA)).toEqual({
      alertar: true,
      motivo: '2 falhas seguidas',
    });
  });

  it('[falha, falha, falha] com alerta há < 24 h ⇒ não repete; há ≥ 24 h ⇒ repete', () => {
    // runs de 12 em 12 h (ex.: cotahist 2×/dia): o 2º run alertou há 12 h
    expect(deveAlertar(runs(['falha', 'falha', 'falha'], 12), AGORA).alertar).toBe(false);
    // job diário: o alerta anterior foi há 24 h
    expect(deveAlertar(runs(['falha', 'falha', 'falha'], 24), AGORA).alertar).toBe(true);
    // 2×/dia persistindo: alerta no 2º, silêncio no 3º, repete no 4º (24 h depois do 2º)
    expect(deveAlertar(runs(['falha', 'falha', 'falha', 'falha'], 12), AGORA).alertar).toBe(true);
  });

  it('[abandonado, falha] ⇒ sim (processo morto conta como falha)', () => {
    expect(deveAlertar(runs(['abandonado', 'falha']), AGORA).alertar).toBe(true);
  });

  it('[pulado, falha] ⇒ não (pulado é neutro)', () => {
    expect(deveAlertar(runs(['pulado', 'falha']), AGORA).alertar).toBe(false);
    expect(deveAlertar(runs(['falha', 'pulado']), AGORA).alertar).toBe(false);
  });

  it("'ok' zera a sequência; ordem de entrada não importa (ordena por início)", () => {
    expect(deveAlertar(runs(['falha', 'falha', 'ok', 'falha']), AGORA).alertar).toBe(false);
    expect(deveAlertar(runs(['falha', 'falha', 'ok', 'falha', 'falha']), AGORA).alertar).toBe(true);
    expect(deveAlertar(runs(['falha', 'falha']).reverse(), AGORA).alertar).toBe(true);
    expect(deveAlertar([], AGORA).alertar).toBe(false);
  });
});

function entradaTudoEmDia() {
  const ultimaOkPorJob = new Map<NomeJob, Date>();
  for (const job of Object.values(JOB_POR_CAMADA)) ultimaOkPorJob.set(job, antes(1));
  const dadoMaisRecente: Record<Camada, string | null> = {
    cotacoes: '2026-09-29',
    fundamentos_dfp: '2025-12-31',
    fundamentos_itr: '2026-06-30',
    fii_mensal: '2026-08-01',
    fii_trimestral: '2026-06-30',
    cadastro_b3: '2026-09-27',
    cadastro_fii: '2026-09-27',
    eventos: '2026-09-25',
    scores: '2026-09-29',
    quadro: '2026-09-29',
  };
  return { ultimaOkPorJob, dadoMaisRecente };
}

describe('calcularFrescor', () => {
  it('tudo recente ⇒ em_dia em todas as camadas', () => {
    const p = calcularFrescor(entradaTudoEmDia(), AGORA);
    expect(p.atrasadas).toEqual([]);
    expect(Object.values(p.camadas).every((c) => c.status === 'em_dia')).toBe(true);
    expect(p.camadas.cotacoes).toMatchObject({ job: 'cotahist', idadeDado: 1 });
  });

  it('cotação de 5 pregões atrás ⇒ atrasado', () => {
    const e = entradaTudoEmDia();
    // 23/09/2026 (qua): pregões depois dele até 30/09 = 24, 25, 28, 29, 30
    e.dadoMaisRecente.cotacoes = '2026-09-23';
    const p = calcularFrescor(e, AGORA);
    expect(p.camadas.cotacoes.status).toBe('atrasado');
    expect(p.camadas.cotacoes.idadeDado).toBe(5);
    expect(p.atrasadas).toEqual(['cotacoes']);
  });

  it('sexta → segunda não atrasa (fim de semana não é pregão)', () => {
    const e = entradaTudoEmDia();
    e.dadoMaisRecente.cotacoes = '2026-09-25';
    const p = calcularFrescor(e, new Date('2026-09-28T12:00:00Z'));
    expect(p.camadas.cotacoes.idadeDado).toBe(1);
    expect(p.camadas.cotacoes.status).toBe('em_dia');
  });

  it('job OK há 30 h com limite 26 h ⇒ atrasado', () => {
    const e = entradaTudoEmDia();
    e.ultimaOkPorJob.set('cvm-ipe', antes(30));
    const p = calcularFrescor(e, AGORA, {
      ...LIMITES_FRESCOR_PADRAO,
      eventos: { maxHorasJob: 26, maxDiasDado: 120 },
    });
    expect(p.camadas.eventos.status).toBe('atrasado');
    expect(p.camadas.eventos.horasDesdeExecucaoOk).toBe(30);
    expect(p.camadas.eventos.motivos[0]).toMatch(/30 h \(limite 26 h\)/);
  });

  it('sem execução e sem dado ⇒ sem_dado; dado sem job OK ⇒ atrasado', () => {
    const e = entradaTudoEmDia();
    e.ultimaOkPorJob.delete('scores');
    e.dadoMaisRecente.scores = null;
    e.ultimaOkPorJob.delete('fii-mensal');
    const p = calcularFrescor(e, AGORA);
    expect(p.camadas.scores.status).toBe('sem_dado');
    expect(p.camadas.fii_mensal.status).toBe('atrasado');
    expect(p.atrasadas).toEqual(['fii_mensal']);
  });
});
