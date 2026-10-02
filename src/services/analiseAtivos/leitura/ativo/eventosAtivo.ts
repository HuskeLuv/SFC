/**
 * Próximos eventos do ativo (fatia B), no máximo 3, SÓ com fonte (decisão 6 do Wellington):
 * - resultado (data informada) e resultado estimado pelo histórico de entregas (selo 'data
 *   estimada'), de asset_eventos, sem os estimados já substituídos pelo real;
 * - assembleias (IPE);
 * - data-com REAL já anunciada, de asset_proventos_auditados (status 'valido', entre hoje e
 *   hoje + 2 anos: descarta a data-sentinela 9999-12-31).
 * NÃO existe 'JCP estimado'. FIIs não têm IPE: só datas-com.
 */
import { formatarNumeroBR, formatarTexto } from '@/services/analiseAtivos/textos';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import type { ClasseQuadro, EventoAtivo } from '@/types/analiseAtivosApi';

export const MAX_EVENTOS = 3;
export const HORIZONTE_DATA_COM_ANOS = 2;
const MAX_DESCRICAO = 160;

export interface EventoGravado {
  tipo: string;
  subtipo: string;
  periodoRef: string | null;
  data: string;
  estimado: boolean;
  substituidoEm: string | null;
  assunto: string | null;
}

export interface DataComGravada {
  dataComReal: string | null;
  tipoNormalizado: string;
  valor: number;
  status: string;
}

export interface EntradaEventos {
  classe: ClasseQuadro;
  hoje: string;
  eventos: readonly EventoGravado[];
  datasCom: readonly DataComGravada[];
}

/** '2026-3T' → '3T26'; '2026-FY' → 'anual de 2026'. */
export function rotuloPeriodo(periodoRef: string | null, subtipo: string): string {
  if (periodoRef) {
    const [ano, p] = periodoRef.split('-');
    if (p === 'FY') return formatarTexto(TEXTOS_TELA.ativo.periodoAnual, { ano });
    if (/^\dT$/.test(p ?? '')) return `${p}${ano.slice(2)}`;
  }
  return subtipo;
}

function somarAnos(iso: string, anos: number): string {
  return `${Number(iso.slice(0, 4)) + anos}${iso.slice(4)}`;
}

function cortar(s: string): string {
  return s.length > MAX_DESCRICAO ? `${s.slice(0, MAX_DESCRICAO - 1).trimEnd()}…` : s;
}

export function montarEventos(e: EntradaEventos): EventoAtivo[] {
  const t = TEXTOS_TELA.eventos;
  const limite = somarAnos(e.hoje, HORIZONTE_DATA_COM_ANOS);
  const out: EventoAtivo[] = [];

  if (e.classe === 'acao') {
    for (const ev of e.eventos) {
      if (ev.substituidoEm || ev.data < e.hoje) continue;
      if (ev.tipo === 'resultado' || ev.tipo === 'resultado_estimado') {
        const estimado = ev.tipo === 'resultado_estimado' || ev.estimado;
        out.push({
          data: ev.data,
          tipo: estimado ? 'resultado_estimado' : 'resultado',
          titulo: formatarTexto(t.resultado, { valor: rotuloPeriodo(ev.periodoRef, ev.subtipo) }),
          descricao: estimado ? t.resultadoEstimadoDescricao : null,
          estimado,
        });
      } else if (ev.tipo === 'assembleia') {
        out.push({
          data: ev.data,
          tipo: 'assembleia',
          titulo: formatarTexto(t.assembleia, { valor: ev.subtipo }),
          descricao: ev.assunto ? cortar(ev.assunto) : null,
          estimado: false,
        });
      }
    }
  }

  const unidade =
    e.classe === 'fii' ? TEXTOS_TELA.ativo.valorPorCota : TEXTOS_TELA.ativo.valorPorAcao;
  const vistos = new Set<string>();
  for (const d of e.datasCom) {
    if (d.status !== 'valido' || !d.dataComReal) continue;
    if (d.dataComReal < e.hoje || d.dataComReal > limite) continue;
    const chave = `${d.dataComReal}|${d.tipoNormalizado}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    const tipo =
      TEXTOS_TELA.ativo.tiposProvento[d.tipoNormalizado] ?? TEXTOS_TELA.ativo.tiposProvento.OUTRO;
    out.push({
      data: d.dataComReal,
      tipo: 'data_com',
      titulo: formatarTexto(t.dataCom, { valor: tipo }),
      descricao:
        Number.isFinite(d.valor) && d.valor > 0
          ? formatarTexto(unidade, {
              valor: `R$ ${formatarNumeroBR(d.valor, d.valor < 0.1 ? 4 : 2)}`,
            })
          : null,
      estimado: false,
    });
  }

  return out.sort((a, b) => a.data.localeCompare(b.data)).slice(0, MAX_EVENTOS);
}
