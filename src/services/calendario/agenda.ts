/**
 * Agregador da Agenda: junta as fontes para um período e ordena por dia.
 * Cada fonte é independente e falha isolada (uma fonte quebrada não derruba
 * a agenda inteira — o erro vai para o log e as outras aparecem).
 */
import { logger } from '@/lib/logger';
import { ApiError } from '@/utils/apiErrorHandler';
import { TIPOS_EVENTO, type EventoAgenda, type Periodo, type TipoEvento } from './types';
import { diffDias, ehDataCivilValida, hojeCivil, montar, partes } from './datas';
import { eventosManuais } from './fontes/manual';
import { eventosDividas } from './fontes/dividas';
import { eventosProventos } from './fontes/proventos';
import { eventosRendaFixa } from './fontes/rendaFixa';

export const MAX_DIAS_PERIODO = 400;

type Fonte = (userId: string, periodo: Periodo) => Promise<EventoAgenda[]>;

const FONTES: Array<{ tipo: TipoEvento; carregar: Fonte }> = [
  { tipo: 'manual', carregar: eventosManuais },
  { tipo: 'divida', carregar: eventosDividas },
  { tipo: 'provento', carregar: eventosProventos },
  { tipo: 'rf', carregar: eventosRendaFixa },
];

/** ?tipos=manual,divida → só essas fontes; ausente = todas. */
export function parseTipos(params: URLSearchParams): TipoEvento[] | undefined {
  const raw = params.get('tipos');
  if (!raw) return undefined;
  const tipos = raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const invalidos = tipos.filter((t) => !(TIPOS_EVENTO as readonly string[]).includes(t));
  if (invalidos.length > 0) {
    throw new ApiError(400, `Tipo de evento desconhecido: ${invalidos.join(', ')}.`);
  }
  return tipos as TipoEvento[];
}

/** Período pedido pela página (?de=&ate=); sem parâmetros = mês atual. */
export function parsePeriodo(params: URLSearchParams, agora: Date = new Date()): Periodo {
  const de = params.get('de');
  const ate = params.get('ate');
  if (!de && !ate) {
    const { ano, mes } = partes(hojeCivil(agora));
    return { de: montar(ano, mes, 1), ate: montar(ano, mes + 1, 0) };
  }
  if (!de || !ate || !ehDataCivilValida(de) || !ehDataCivilValida(ate)) {
    throw new ApiError(400, 'Informe de e ate no formato AAAA-MM-DD.');
  }
  const dias = diffDias(de, ate);
  if (dias < 0) throw new ApiError(400, 'A data inicial vem depois da final.');
  if (dias > MAX_DIAS_PERIODO) {
    throw new ApiError(400, `O período não pode passar de ${MAX_DIAS_PERIODO} dias.`);
  }
  return { de, ate };
}

export function ordenarEventos(eventos: EventoAgenda[]): EventoAgenda[] {
  return [...eventos].sort(
    (a, b) =>
      a.data.localeCompare(b.data) ||
      (a.hora ?? '').localeCompare(b.hora ?? '') ||
      a.titulo.localeCompare(b.titulo, 'pt-BR'),
  );
}

export async function montarAgenda(
  userId: string,
  periodo: Periodo,
  tipos?: TipoEvento[],
): Promise<{ eventos: EventoAgenda[]; fontesComErro: TipoEvento[] }> {
  const ativas = tipos ? FONTES.filter((f) => tipos.includes(f.tipo)) : FONTES;
  const fontesComErro: TipoEvento[] = [];
  const resultados = await Promise.all(
    ativas.map(async (f) => {
      try {
        return await f.carregar(userId, periodo);
      } catch (error: unknown) {
        logger.error(`[agenda] fonte ${f.tipo} falhou:`, error);
        fontesComErro.push(f.tipo);
        return [];
      }
    }),
  );
  return { eventos: ordenarEventos(resultados.flat()), fontesComErro };
}
