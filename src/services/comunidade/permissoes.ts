/**
 * Regras puras da Comunidade (sem Prisma) — quem vê, publica e modera.
 */

import type { CommunityCargo, UserRole } from '@prisma/client';
import { categoriaPorChave } from '@/constants/comunidade';

export interface MembroContexto {
  id: string;
  role: UserRole;
  cargo: CommunityCargo | null;
}

export type Selo = 'equipe' | 'consultor';

/** Equipe My Finance (cargo) ou admin do sistema moderam. */
export const podeModerar = (m: Pick<MembroContexto, 'role' | 'cargo'>): boolean =>
  m.cargo === 'equipe' || m.role === 'admin';

/** Selos exibidos ao lado do nome: equipe tem precedência visual sobre consultor. */
export const selosDoAutor = (role: UserRole, cargo: CommunityCargo | null | undefined): Selo[] => {
  const selos: Selo[] = [];
  if (cargo === 'equipe') selos.push('equipe');
  if (role === 'consultant') selos.push('consultor');
  return selos;
};

export const podePublicarNaCategoria = (
  m: Pick<MembroContexto, 'role' | 'cargo'>,
  chave: string,
): boolean => {
  const categoria = categoriaPorChave(chave);
  if (!categoria) return false;
  if (categoria.restricao === 'todos') return true;
  if (podeModerar(m)) return true;
  return categoria.restricao === 'consultores' && m.role === 'consultant';
};

export const estaSuspenso = (suspensoAte: Date | null | undefined, agora = new Date()): boolean =>
  suspensoAte != null && suspensoAte.getTime() > agora.getTime();

/** Conteúdo visível no feed: nem excluído pelo autor, nem oculto (exceto p/ moderador). */
export const conteudoVisivel = (
  c: { excluidoEm: Date | null; ocultoEm: Date | null },
  moderador: boolean,
): boolean => c.excluidoEm == null && (c.ocultoEm == null || moderador);

/** Normaliza texto livre: CRLF → LF, tira espaços nas pontas e colapsa >2 linhas vazias. */
export const normalizarTexto = (s: string): string =>
  s
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
