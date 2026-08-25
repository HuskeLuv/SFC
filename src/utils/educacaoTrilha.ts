/**
 * Área Educacional — cálculo puro da "trilha" (ticket 25/08/2026, layout do
 * Pedro): stats por módulo (aulas, duração, progresso, status) e a aula de
 * "Continue de onde parou". Sem Prisma pra ser testável.
 */

export interface TrilhaAulaInput {
  id: string;
  title: string;
  durationSeconds: number | null;
  /** Já resolvido (MAIOR entre curso e aula). */
  requiredLevel: number;
  bloqueada: boolean;
  concluida: boolean;
  /** Última interação do usuário (LessonProgress.updatedAt), se houver. */
  ultimaInteracao: Date | null;
}

export interface TrilhaModuloInput {
  id: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  aulas: TrilhaAulaInput[];
}

export type ModuloStatus = 'concluido' | 'em_andamento' | 'nao_iniciado';

export interface ModuloTrilha {
  id: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  totalAulas: number;
  aulasConcluidas: number;
  progresso: number;
  duracaoSegundos: number;
  status: ModuloStatus;
}

export interface ContinuarAula {
  moduloId: string;
  moduloTitle: string;
  moduloIndex: number;
  aulaId: string;
  aulaTitle: string;
  /** Posição 1-based da aula dentro do módulo. */
  aulaIndex: number;
  totalAulasModulo: number;
  progressoModulo: number;
  /** Soma das durações das aulas ainda não concluídas do módulo. */
  restanteSegundos: number;
}

export const pct = (done: number, total: number): number =>
  total > 0 ? Math.round((done / total) * 100) : 0;

export const resumirModulo = (mod: TrilhaModuloInput): ModuloTrilha => {
  const totalAulas = mod.aulas.length;
  const aulasConcluidas = mod.aulas.filter((a) => a.concluida).length;
  const duracaoSegundos = mod.aulas.reduce((s, a) => s + (a.durationSeconds ?? 0), 0);
  const iniciado = mod.aulas.some((a) => a.concluida || a.ultimaInteracao != null);
  const status: ModuloStatus =
    totalAulas > 0 && aulasConcluidas === totalAulas
      ? 'concluido'
      : iniciado
        ? 'em_andamento'
        : 'nao_iniciado';
  return {
    id: mod.id,
    title: mod.title,
    description: mod.description,
    coverUrl: mod.coverUrl,
    totalAulas,
    aulasConcluidas,
    progresso: pct(aulasConcluidas, totalAulas),
    duracaoSegundos,
    status,
  };
};

const montarContinuar = (
  modulos: TrilhaModuloInput[],
  moduloIndex: number,
  aula: TrilhaAulaInput,
): ContinuarAula => {
  const mod = modulos[moduloIndex];
  const resumo = resumirModulo(mod);
  return {
    moduloId: mod.id,
    moduloTitle: mod.title,
    moduloIndex,
    aulaId: aula.id,
    aulaTitle: aula.title,
    aulaIndex: mod.aulas.findIndex((a) => a.id === aula.id) + 1,
    totalAulasModulo: resumo.totalAulas,
    progressoModulo: resumo.progresso,
    restanteSegundos: mod.aulas
      .filter((a) => !a.concluida)
      .reduce((s, a) => s + (a.durationSeconds ?? 0), 0),
  };
};

/**
 * Aula sugerida pra retomar:
 *  1. módulo da última interação do usuário → primeira aula pendente
 *     (não concluída e desbloqueada) desse módulo;
 *  2. senão, primeira aula pendente do curso na ordem da trilha;
 *  3. null se tudo concluído/bloqueado (ou curso vazio).
 */
export const calcularContinuar = (modulos: TrilhaModuloInput[]): ContinuarAula | null => {
  const pendente = (a: TrilhaAulaInput) => !a.concluida && !a.bloqueada;

  let ultimaData = 0;
  let ultimoModuloIdx = -1;
  modulos.forEach((mod, idx) => {
    mod.aulas.forEach((a) => {
      const t = a.ultimaInteracao?.getTime() ?? 0;
      if (t > ultimaData) {
        ultimaData = t;
        ultimoModuloIdx = idx;
      }
    });
  });

  if (ultimoModuloIdx >= 0) {
    const aula = modulos[ultimoModuloIdx].aulas.find(pendente);
    if (aula) return montarContinuar(modulos, ultimoModuloIdx, aula);
  }

  for (let idx = 0; idx < modulos.length; idx++) {
    const aula = modulos[idx].aulas.find(pendente);
    if (aula) return montarContinuar(modulos, idx, aula);
  }
  return null;
};

/** "1h 10min" / "48 min" / null quando desconhecido. */
export const formatDuracaoCurta = (seconds: number): string | null => {
  if (!seconds || seconds <= 0) return null;
  const totalMin = Math.round(seconds / 60);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, '0')}min`;
};
