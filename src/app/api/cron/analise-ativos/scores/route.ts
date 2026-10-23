/**
 * ALIAS de /api/cron/analise-ativos/derivados (D6-a, 23/10/2026): o job 'scores' virou 'derivados'
 * (sem Índice MF nem semáforo). Mantida porque a linha de cron de produção ainda pode chamar esta
 * rota; roda o MESMO job (CATALOGO_JOBS.scores === CATALOGO_JOBS.derivados), registrado em
 * AnaliseJobRun como 'derivados' e com o mesmo lock. Remover quando nada mais chamar 'scores'.
 */
export { GET } from '../derivados/route';

// config de segmento literal (o Next não lê runtime/dynamic reexportados)
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
